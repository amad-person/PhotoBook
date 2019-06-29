function getIconTypeUsingSentimentScore(sentimentScore) {
  const iconClassNames = ['sentiment-score-icon', 'fas'];
  if (sentimentScore > 0.5) {
    iconClassNames.push('fa-laugh-beam');
  } else if (sentimentScore < -0.5) {
    iconClassNames.push('fa-frown');
  } else {
    iconClassNames.push('fa-meh-blank');
  }
  return iconClassNames;
}

function getTextForTts(message) {
  const { user, text } = message;
  const date = new Date(message.timestamp).toDateString();
  const finalText = [];

  finalText.push(
    'On ', date, ', ',
    user, ' said: ',
    text,
  );

  return finalText.join('');
}

function playTtsAudio(text) {
  fetch('/a11y/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
    .then(response => response.blob())
    .then((audioBlob) => {
      const audioUrl = window.URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play()
        .catch((error) => {
          throw error.message;
        });
    });
}

function getTranslatedText(text, languageCode) {
  return fetch('/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      languageCode,
    }),
  }).then(response => response.text());
}

function buildInfoDiv(message) {
  const infoDiv = document.createElement('div');
  infoDiv.classList.add('d-flex', 'justify-content-between', 'align-items-center');

  const sentimentScoreDiv = document.createElement('div');
  const sentimentScoreIcon = document.createElement('i');
  sentimentScoreIcon.classList.add(...getIconTypeUsingSentimentScore(message.sentimentScore));
  sentimentScoreDiv.appendChild(sentimentScoreIcon);
  const sentimentScore = Math.trunc(message.sentimentScore * 100) / 100;
  sentimentScoreDiv.appendChild(document.createTextNode(sentimentScore));

  infoDiv.appendChild(sentimentScoreDiv);

  const textToSpeechIcon = document.createElement('i');
  textToSpeechIcon.classList.add('fas', 'fa-volume-up', 'text-to-speech-icon');
  textToSpeechIcon.addEventListener('click', () => {
    playTtsAudio(getTextForTts(message));
  });
  infoDiv.appendChild(textToSpeechIcon);

  const translateIcon = document.createElement('i');
  translateIcon.classList.add('fas', 'fa-language', 'translate-icon');

  const translateResultDivId = `translateCollapseDiv-${message.id}`;
  translateIcon.setAttribute('data-toggle', 'collapse');
  translateIcon.setAttribute('data-target', `#${translateResultDivId}`);
  infoDiv.appendChild(translateIcon);

  const translateResult = document.createElement('div');
  translateResult.classList.add('collapse');
  translateResult.setAttribute('id', translateResultDivId);
  getTranslatedText(message.text, 'es').then((translatedText) => {
    translateResult.innerHTML = translatedText;
  });

  return { infoDiv, translateResult };
}

function buildUsernameDiv(message) {
  const usernameDiv = document.createElement('h5');
  usernameDiv.classList.add('card-title', 'mb-0');
  usernameDiv.appendChild(document.createTextNode(message.user));
  return usernameDiv;
}

function buildTimeDiv(message) {
  const timeDiv = document.createElement('p');
  timeDiv.classList.add('card-text', 'mb-0');

  const timeText = document.createElement('small');
  timeText.classList.add('text-muted');
  timeText.appendChild(
    document.createTextNode(new Date(message.timestamp)),
  );

  timeDiv.appendChild(timeText);
  return timeDiv;
}

function buildLandmarkDiv(message) {
  const landmarkDiv = document.createElement('div');
  landmarkDiv.classList.add('mb-2', 'imageLandmark-container');
  landmarkDiv.innerHTML = `<a href="#" class="card-text">${message.imageLandmark}</a>`;
  return landmarkDiv;
}

function buildTextDiv(message) {
  const textDiv = document.createElement('p');
  textDiv.classList.add('card-text', 'border-top', 'pt-2');
  textDiv.innerHTML = message.text;
  return textDiv;
}

// eslint-disable-next-line no-unused-vars
function onMouseEnterImageDiv(element) {
  element.childNodes[1].classList.remove('hidden');
}

// eslint-disable-next-line no-unused-vars
function onMouseOutImageDiv(element) {
  element.childNodes[1].classList.add('hidden');
}

function buildImageDiv(message) {
  let imageDivHtml = '<div class="card mb-0 border-0" id="image-container" onmouseenter="onMouseEnterImageDiv(this)" onmouseleave="onMouseOutImageDiv(this)">';

  imageDivHtml += `<img class="card-img-top border-bottom" 
                                src=${message.imageUrl} 
                                alt=${message.imageLabels[0]}>`;

  let labelHtml = '<div id="image-label-container" class="card-footer p-1 border-top-0 image-label-container hidden">';
  // eslint-disable-next-line no-return-assign
  message.imageLabels.map(imageLabel => labelHtml
    += `<a href="/feed.html?imageLabel=${imageLabel.toLowerCase()}">
            <button type="button" class="btn btn-outline-light m-1 p-1 font-weight-lighter tag-button">
              ${imageLabel}
            </button>
          </a>`);
  labelHtml += '</div>';
  imageDivHtml += labelHtml;

  imageDivHtml += '</div>';

  const imageDiv = document.createElement('div');
  imageDiv.innerHTML = imageDivHtml;

  return imageDiv;
}

// eslint-disable-next-line no-unused-vars
function onClickCommentCount() {
  document.getElementById('comment-container').classList.remove('hidden');
}

function buildCommentCount(message) {
  // eslint-disable-next-line no-nested-ternary
  return (message.commentIds == null || message.commentIds.length === 0)
    ? '' : message.commentIds.length === 1
      ? `<p class="text-muted font-weight-light pr-2 mb-0" data-toggle="collapse" data-target="#comment-container-${message.id}">1 comment</p>`
      : `<p class="text-muted font-weight-light pr-2 mb-0" data-toggle="collapse" data-target="#comment-container-${message.id}">${message.commentIds.length} comments</p>`;
}

function buildFavouriteCount(message) {
  // eslint-disable-next-line no-nested-ternary
  return (message.favouritedUserEmails == null
    || message.favouritedUserEmails.length === 0)
    ? '' : message.favouritedUserEmails.length === 1
      ? '<p class="text-muted font-weight-light mb-0">1 Favourite</p>'
      : `<p class="text-muted font-weight-light mb-0">${message.favouritedUserEmails.length} Favourites</p>`;
}

function buildLikeCount(message) {
  const messageCount = (message.likedUserEmails == null || message.likedUserEmails.length === 0)
    ? '' : message.likedUserEmails.length;
  return (message.likedUserEmails == null || message.likedUserEmails.length === 0)
    ? '' : `<i class="reaction-icon far fa-thumbs-up mr-1"></i>
            <p class="reaction-count font-weight-light mb-0">${messageCount}</p>`;
}

function hasResponse(message) {
  return ((message.commentIds != null && message.commentIds.length !== 0)
    || (message.favouritedUserEmails != null && message.favouritedUserEmails.length !== 0)
    || (message.likedUserEmails != null && message.likedUserEmails.length !== 0));
}

function toggleResponse(message) {
  const responseDiv = document.getElementById(`response-container-${message.id}`);
  if (hasResponse(message)) {
    responseDiv.classList.remove('hidden');
  } else {
    responseDiv.classList.add('hidden');
  }
}

function buildResponseDiv(message) {
  const responseDiv = document.createElement('div');
  responseDiv.id = `response-container-${message.id}`;
  responseDiv.classList.add('response-container', 'd-flex', 'justify-content-between', 'mt-2', 'pb-2', 'border-bottom');

  if (!hasResponse(message)) {
    responseDiv.classList.add('hidden');
  }

  responseDiv.innerHTML = `<span class="like-count-container d-flex flex-row" id="like-count-container-${message.id}">
                            ${buildLikeCount(message)}
                          </span>
                          <div class="comment-favourite-container d-flex flex-row">
                            <div id="comment-count-container-${message.id}">
                              ${buildCommentCount(message)}
                            </div>
                            <div id="favourite-count-container-${message.id}">
                              ${buildFavouriteCount(message)}
                            </div>
                          </div>`;
  return responseDiv;
}

// eslint-disable-next-line no-unused-vars
function onClickLikeIcon(messageId) {
  fetch('/login-status')
    .then(response => response.json())
    .then((loginStatus) => {
      if (loginStatus.isLoggedIn) {
        const data = { userEmail: loginStatus.username, messageId };
        $.ajax({
          contentType: 'application/json',
          data: JSON.stringify(data),
          processData: false,
          type: 'POST',
          url: '/like',
        }).done(() => {
          fetch(`/message?messageId=${messageId}`)
            .then(response => response.json())
            .then((message) => {
              $(`#like-count-container-${messageId}`).html(
                buildLikeCount(message),
              );
              toggleResponse(message);
            });
        });
      }
    });
}

// eslint-disable-next-line no-unused-vars
function onClickFavouriteButton(messageId) {
  fetch('/login-status')
    .then(response => response.json())
    .then((loginStatus) => {
      if (loginStatus.isLoggedIn) {
        const data = { userEmail: loginStatus.username, messageId };
        $.ajax({
          contentType: 'application/json',
          data: JSON.stringify(data),
          processData: false,
          type: 'POST',
          url: '/favourite',
        }).done(() => {
          fetch(`/message?messageId=${messageId}`)
            .then(response => response.json())
            .then((message) => {
              $(`#favourite-count-container-${messageId}`).html(
                buildFavouriteCount(message),
              );
              toggleResponse(message);
            });
        });
      }
    });
}

function buildActionDiv(messageId) {
  const actionDiv = document.createElement('div');
  actionDiv.innerHTML = `<div id="action-container" class="action-container d-flex justify-content-between mt-2 pb-2">
                          <button class="btn btn-light btn-sm action-icon-container font-weight-light" onclick="onClickLikeIcon('${messageId}');">
                            <i class="action-icon far fa-thumbs-up mr-1"></i>
                            Like
                          </button>
                          <button class="btn btn-light btn-sm font-weight-light" data-toggle="collapse" data-target="#comment-container-${messageId}">
                            <i class="far fa-comment-alt mr-1"></i>
                            Comment
                          </button>
                          <button class="btn btn-light btn-sm font-weight-light" onclick="onClickFavouriteButton('${messageId}');">
                            <i class="far fa-heart mr-1"></i>
                            Favourite
                          </button>
                         </div>`;
  return actionDiv;
}

// eslint-disable-next-line no-unused-vars
function autoGrow(element) {
  // eslint-disable-next-line no-param-reassign
  element.style.height = '5px';
  // eslint-disable-next-line no-param-reassign
  element.style.height = `${element.scrollHeight}px`;
}

function buildCommentInput(messageId) {
  const commentFormHtml = `<li class="media">
                            <a class="mr-3 my-2" href="#">
                              <img src="./images/aboutus-avatar-anqi.jpg" class="comment-image rounded-circle" alt="...">
                            </a>
                            <div class="media-body">
                              <div id="comment-input-container" class="comment-input-container">
                                <div class="input-group input-group-sm mt-2">
                                  <textarea
                                    name=${messageId}
                                    id=${messageId}
                                    class=form-control
                                    type=text
                                    placeholder="Add a comment"
                                    onblur="this.placeholder='Add a comment'"
                                    onfocus="this.placeholder=''"
                                    onkeyup="autoGrow(this)">
                                  </textarea>
                                  <div class="input-group-append">
                                    <button class="btn btn-light comment-post-button border" 
                                            type="button" 
                                            id="comment-post-button"
                                            onclick="onClickCommentPostButton('${messageId}');">
                                            Post
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>`;
  return commentFormHtml;
}

function buildCommentItem(comment) {
  return `<li class="media">
            <a class="mr-3 my-2" href="#">
              <img src="./images/aboutus-avatar-anqi.jpg" class="comment-image rounded-circle" alt="...">
            </a>
            <div class="media-body">
              <a href="#"><p class="mt-1 mb-0 font-weight-normal comment-username">${comment.user}</p></a>
              <p class="font-weight-light comment-text mb-0">${comment.text}</p>
            </div>
          </li>`;
}

function buildCommentHtml(messageId) {
  let commentHtml = `<ul class="list-unstyled comment-list mb-0" id="comment-list-${messageId}">`;
  commentHtml += buildCommentInput(messageId);

  $.ajaxSetup({ async: false });
  $.getJSON(`/comments?messageId=${messageId}`, (comments) => {
    comments.forEach((comment) => { commentHtml += buildCommentItem(comment); });
  });
  $.ajaxSetup({ async: true });

  commentHtml += '</ul>';
  return commentHtml;
}

function onCommentPost(messageId) {
  fetch(`/message?messageId=${messageId}`)
    .then(response => response.json())
    .then((message) => {
      $(`#comment-count-container-${messageId}`).html(
        buildCommentCount(message),
      );
      toggleResponse(message);
    });
}

// eslint-disable-next-line no-unused-vars
function onClickCommentPostButton(messageId) {
  const comment = { messageId, userText: document.getElementById(messageId).value };
  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify(comment),
    processData: false,
    type: 'POST',
    url: '/comments',
  }).done(() => {
    $(`#comment-container-${messageId}`).html(buildCommentHtml(messageId));
    onCommentPost(messageId);
  });
}

function buildCommentDiv(messageId) {
  const commentDiv = document.createElement('div');
  commentDiv.classList.add('px-2', 'py-1', 'border-top', 'collapse', 'comment-container');
  commentDiv.id = `comment-container-${messageId}`;

  commentDiv.innerHTML = buildCommentHtml(messageId);
  return commentDiv;
}

function buildCardBodyDiv(message) {
  const cardBody = document.createElement('div');
  cardBody.classList.add('card-body', 'pb-0', 'px-3');

  cardBody.appendChild(buildUsernameDiv(message));
  cardBody.appendChild(buildTimeDiv(message));

  if (message.imageLandmark != null && message.imageLandmark !== '') {
    cardBody.appendChild(buildLandmarkDiv(message));
  }

  cardBody.appendChild(buildTextDiv(message));

  const { infoDiv, translateResult } = buildInfoDiv(message);
  cardBody.appendChild(infoDiv);
  cardBody.appendChild(translateResult);

  cardBody.appendChild(buildResponseDiv(message));
  cardBody.appendChild(buildActionDiv(message.id));

  return cardBody;
}

/**
 * Builds an element that displays the message.
 * @param {Message} message
 * @return {Element}
 */
function buildMessageDiv(message) {
  const cardContainer = document.createElement('div');
  cardContainer.classList.add('card', 'p-2', 'border-0');

  const card = document.createElement('div');
  card.classList.add('border');

  card.appendChild(buildCardBodyDiv(message));

  if (message.imageUrl != null) {
    card.insertBefore(buildImageDiv(message), card.childNodes[0]);
  }

  card.appendChild(buildCommentDiv(message.id));
  cardContainer.appendChild(card);
  return cardContainer;
}

function fetchMessagesFromUrl(url) {
  fetch(url)
    .then(response => response.json())
    .then((messages) => {
      const messagesContainer = document.getElementById('message-cards-container');
      if (messages.length === 0) {
        messagesContainer.innerHTML = '<p>This user has no posts yet.</p>';
      } else {
        messagesContainer.innerHTML = '';
      }
      messages.forEach((message) => {
        const messageDiv = buildMessageDiv(message);
        messagesContainer.appendChild(messageDiv);
      });
    });
}

/** Fetches messages by user of current page  add them to the page. */
// eslint-disable-next-line no-unused-vars
function fetchMessagesByUser(parameterUsername) {
  const url = `/user-messages?user=${parameterUsername}`;
  fetchMessagesFromUrl(url);
}

/** Fetches all messages and add them to the page. */
// eslint-disable-next-line no-unused-vars
function fetchAllMessages() {
  const url = '/feed';
  fetchMessagesFromUrl(url);
}

/** Fetches messages for given image labels and add them to the page. */
// eslint-disable-next-line no-unused-vars
function fetchMessagesByImageLabels(imageLabels) {
  let url = '/feed?';
  imageLabels.forEach((imageLabel, index) => {
    url += `imageLabel=${imageLabel}`;
    if (index !== imageLabels.length - 1) {
      url += '&';
    }
  });
  fetchMessagesFromUrl(url);
}
