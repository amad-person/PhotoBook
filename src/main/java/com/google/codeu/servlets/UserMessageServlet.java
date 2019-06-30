package com.google.codeu.servlets;

import com.google.appengine.api.blobstore.BlobInfo;
import com.google.appengine.api.blobstore.BlobInfoFactory;
import com.google.appengine.api.blobstore.BlobKey;
import com.google.appengine.api.blobstore.BlobstoreService;
import com.google.appengine.api.blobstore.BlobstoreServiceFactory;
import com.google.appengine.api.images.ImagesService;
import com.google.appengine.api.images.ImagesServiceFactory;
import com.google.appengine.api.images.ServingUrlOptions;
import com.google.appengine.api.users.UserService;
import com.google.appengine.api.users.UserServiceFactory;
import com.google.cloud.language.v1.Document;
import com.google.cloud.language.v1.LanguageServiceClient;
import com.google.cloud.language.v1.Sentiment;
import com.google.cloud.vision.v1.AnnotateImageRequest;
import com.google.cloud.vision.v1.AnnotateImageResponse;
import com.google.cloud.vision.v1.BatchAnnotateImagesResponse;
import com.google.cloud.vision.v1.EntityAnnotation;
import com.google.cloud.vision.v1.Feature;
import com.google.cloud.vision.v1.Feature.Type;
import com.google.cloud.vision.v1.Image;
import com.google.cloud.vision.v1.ImageAnnotatorClient;
import com.google.codeu.data.Datastore;
import com.google.codeu.data.Message;
import com.google.gson.Gson;
import com.google.protobuf.ByteString;

import com.google.appengine.api.datastore.DatastoreService;
import com.google.appengine.api.datastore.DatastoreServiceFactory;
import com.google.appengine.api.datastore.Entity;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.jsoup.Jsoup;
import org.jsoup.safety.Whitelist;

/**
 * Handles fetching and saving {@link Message}
 * instances.
 */
@WebServlet("/user-messages")
public class UserMessageServlet extends HttpServlet {

  private Datastore datastore;

  @Override
  public void init() {
    datastore = new Datastore();
  }

  /**
   * Responds with a JSON representation of {@link Message} data for a specific user. Responds with
   * an empty array if the user is not provided.
   */
  @Override
  public void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {

    response.setContentType("application/json");

    String user = request.getParameter("user");

    if (user == null || user.equals("")) {
      // Request is invalid, return empty array
      response.getWriter().println("[]");
      return;
    }

    List<Message> messages = datastore.getUserMessages(user);
    Gson gson = new Gson();
    String json = gson.toJson(messages);

    response.getWriter().println(json);
  }

  /**
   * Stores a new {@link Message}.
   */
  @Override
  public void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {

    UserService userService = UserServiceFactory.getUserService();
    if (!userService.isUserLoggedIn()) {
      response.sendRedirect("/index.html");
      return;
    }

    String user = userService.getCurrentUser().getEmail();
    String rawUserText = request.getParameter("message");
    String userText = Jsoup.clean(rawUserText, Whitelist.basic());
    Message message = new Message(user, userText);

    // Get the BlobKey that points to the image uploaded by the user.
    BlobKey blobKey = getBlobKey(request, "image");

    if (blobKey != null) {
      // Get the URL of the image that the user uploaded.
      String imageUrl = getUploadedFileUrl(blobKey);
      message.setImageUrl(imageUrl);

      // Get the labels of the image that the user uploaded.
      byte[] blobBytes = getBlobBytes(blobKey);

      List<EntityAnnotation> imageLabels = getImageLabels(blobBytes);
      List<String> imageLabelsList = imageLabels.stream()
            .map(label -> label.getDescription()).collect(Collectors.toList());
      message.setImageLabels(imageLabelsList);

      List<EntityAnnotation> imageLandmarks = getImageLandmarks(blobBytes);
      if (imageLandmarks != null && imageLandmarks.size() != 0) {
        String imageLandmark = imageLandmarks.get(0).getDescription();
        double imageLat = imageLandmarks.get(0).getLocations(0).getLatLng().getLatitude();
        double imageLong = imageLandmarks.get(0).getLocations(0).getLatLng().getLongitude();
        message.setImageLandmark(imageLandmark);
        message.setImageLat(imageLat);
        message.setImageLong(imageLong);
        Marker marker = new Marker(imageLat, imageLong, imageLandmark);
        storeMarker(marker);
      }
    }

    // Set text for sentiment analysis.
    Document doc = Document.newBuilder().setContent(rawUserText)
            .setType(Document.Type.HTML).build();

    // Perform sentiment analysis.
    LanguageServiceClient languageService = LanguageServiceClient.create();
    Sentiment sentiment = languageService.analyzeSentiment(doc).getDocumentSentiment();
    double sentimentScore = sentiment.getScore();
    languageService.close();

    // Store sentiment score in message.
    message.setSentimentScore(sentimentScore);

    // Create empty list for comments.
    List<UUID> commentIds = new ArrayList<>();
    message.setCommentIds(commentIds);

    datastore.storeMessage(message);

    response.sendRedirect("/user-page.html?user=" + user);
  }

  /** Stores a marker in Datastore. */
  public void storeMarker(Marker marker) {
    Entity markerEntity = new Entity("Marker");
    markerEntity.setProperty("lat", marker.getLat());
    markerEntity.setProperty("lng", marker.getLng());
    markerEntity.setProperty("content", marker.getContent());

    DatastoreService datastore = DatastoreServiceFactory.getDatastoreService();
    datastore.put(markerEntity);

  }

  /**
   * Returns the BlobKey that points to the file uploaded by the user, or
   * null if the user didn't upload a file.
   */
  private BlobKey getBlobKey(HttpServletRequest request, String formInputElementName) {
    BlobstoreService blobstoreService = BlobstoreServiceFactory.getBlobstoreService();
    Map<String, List<BlobKey>> blobs = blobstoreService.getUploads(request);

    List<BlobKey> blobKeys = blobs.get(formInputElementName);

    // User submitted form without selecting a file, so we can't get a BlobKey. (devserver)
    if (blobKeys == null || blobKeys.isEmpty()) {
      return null;
    }

    // Our form only contains a single file input, so get the first index.
    BlobKey blobKey = blobKeys.get(0);

    // User submitted form without selecting a file, so the BlobKey is empty. (live server)
    BlobInfo blobInfo = new BlobInfoFactory().loadBlobInfo(blobKey);
    if (blobInfo.getSize() == 0) {
      blobstoreService.delete(blobKey);
      return null;
    }

    return blobKey;
  }

  /**
   * Returns a URL that points to the uploaded file.
   */
  private String getUploadedFileUrl(BlobKey blobKey) {
    ImagesService imagesService = ImagesServiceFactory.getImagesService();
    ServingUrlOptions options = ServingUrlOptions.Builder.withBlobKey(blobKey);
    return imagesService.getServingUrl(options);
  }

  /**
   * Blobstore stores files as binary data. This function retrieves the
   * binary data stored at the BlobKey parameter.
   */
  private byte[] getBlobBytes(BlobKey blobKey) throws IOException {
    BlobstoreService blobstoreService = BlobstoreServiceFactory.getBlobstoreService();
    ByteArrayOutputStream outputBytes = new ByteArrayOutputStream();

    int fetchSize = BlobstoreService.MAX_BLOB_FETCH_SIZE;
    long currentByteIndex = 0;
    boolean continueReading = true;
    while (continueReading) {

      // end index is inclusive, so we have to subtract 1 to get fetchSize bytes
      byte[] b = blobstoreService.fetchData(blobKey,
              currentByteIndex, currentByteIndex + fetchSize - 1);
      outputBytes.write(b);

      // if we read fewer bytes than we requested, then we reached the end
      if (b.length < fetchSize) {
        continueReading = false;
      }

      currentByteIndex += fetchSize;
    }

    return outputBytes.toByteArray();
  }

  /**
   * Uses the Google Cloud Vision API to generate a list of labels that apply to the image
   * represented by the binary data stored in imgBytes.
   */
  private List<EntityAnnotation> getImageLabels(byte[] imgBytes) throws IOException {
    return getImageAnalysis(imgBytes, Type.LABEL_DETECTION) == null ? null :
        getImageAnalysis(imgBytes, Type.LABEL_DETECTION).getLabelAnnotationsList();
  }

  /**
   * Uses the Google Cloud Vision API to generate the landmark that applies to the image
   * represented by the binary data stored in imgBytes.
   */
  private List<EntityAnnotation> getImageLandmarks(byte[] imgBytes) throws IOException {
    return getImageAnalysis(imgBytes, Type.LANDMARK_DETECTION) == null ? null :
        getImageAnalysis(imgBytes, Type.LANDMARK_DETECTION).getLandmarkAnnotationsList();
  }


  private AnnotateImageResponse getImageAnalysis(byte[] imgBytes, Feature.Type featureType) 
        throws IOException {
    ByteString byteString = ByteString.copyFrom(imgBytes);
    Image image = Image.newBuilder().setContent(byteString).build();

    Feature feature = Feature.newBuilder().setType(featureType).build();
    AnnotateImageRequest request =
            AnnotateImageRequest.newBuilder().addFeatures(feature).setImage(image).build();
    List<AnnotateImageRequest> requests = new ArrayList<>();
    requests.add(request);

    ImageAnnotatorClient client = ImageAnnotatorClient.create();
    BatchAnnotateImagesResponse batchResponse = client.batchAnnotateImages(requests);
    client.close();
    List<AnnotateImageResponse> imageResponses = batchResponse.getResponsesList();
    AnnotateImageResponse imageResponse = imageResponses.get(0);

    if (imageResponse.hasError()) {
      System.err.println("Error getting image analysis: " + imageResponse.getError().getMessage());
      return null;
    }
    return imageResponse;
  }

  public class Marker {

      private double lat;
      private double lng;
      private String content;

      public Marker(double lat, double lng, String content) {
        this.lat = lat;
        this.lng = lng;
        this.content = content;
      }

      public double getLat() {
        return lat;
      }

      public double getLng() {
        return lng;
      }

      public String getContent() {
        return content;
      }
  }
}
