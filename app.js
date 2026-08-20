const API_URL = "http://localhost:5000/api";

let authToken = localStorage.getItem("lionLinkToken");

let posts = [];

const announcements=[
 {date:'SEP 16',title:'Notice to all UNN students',body:'Please check your faculty notice board and official channels for the latest academic updates.'},
 {date:'SEP 18',title:'Student Club Fair on campus',body:'Meet student leaders, explore new interests, and find your community from 12:00–2:00 PM.'},
 {date:'SEP 20',title:'Campus social night',body:'Join fellow students for an evening of connection and community at the Campus Centre.'}
];

const people=[
 {name:'UNN Students’ Union',handle:'@unn_sug',initials:'SU'},
 {name:'UNN Literary Society',handle:'@unnliterary',initials:'UL'},
 {name:'Ifeanyi Eze',handle:'@ifeanyie',initials:'IE'}
];

const chats=[
 {
  name:'Amaka Okafor',
  initials:'AO',
  online:true,
  preview:'Are you going to the club fair?',
  messages:[
   {mine:false,text:'Hey! Are you going to the club fair tomorrow?'},
   {mine:true,text:'Definitely — I want to check out some societies.'},
   {mine:false,text:'Same! I’ll see you there 😊'}
  ]
 },
 {
  name:'Study Group',
  initials:'SG',
  online:false,
  preview:'Ethan: I shared the notes in Drive!',
  messages:[
   {mine:false,text:'Ethan: I shared the notes in Drive!'},
   {mine:true,text:'Thanks, that’s a lifesaver!'}
  ]
 },
 {
  name:'Sam Lee',
  initials:'SL',
  online:true,
  preview:'See you at practice!',
  messages:[
   {mine:false,text:'See you at practice!'}
  ]
 }
];

let selectedChat=null,
    selectedMedia=[],
    currentUser={name:'Jordan Smith',role:'student'},
    viewedProfile=null;

const feed=document.querySelector('#post-feed');

const escapeHtml=str=>{
 const el=document.createElement('div');
 el.textContent=str;
 return el.innerHTML;
};

async function loadPosts() {
    try {
        const response = await fetch(`${API_URL}/posts`);

        if (!response.ok) {
            throw new Error("Failed to load posts");
        }

        const data = await response.json();

        posts = (data.posts || []).map(post => ({
            id: post._id,
            name: post.author?.name || "Unknown User",
            handle: post.author?.username
                ? `@${post.author.username}`
                : "",
            initials: initials(post.author?.name || "Unknown User"),
            time: formatPostTime(post.createdAt),
            text: post.text || "",
            comments: Array.isArray(post.comments) ? post.comments.length : (post.comments || 0),
            likes: Array.isArray(post.likes) ? post.likes.length : (post.likes || 0),
            media: post.media || [],
            official: false
        }));

        renderPosts();

    } catch (error) {
        console.error("Load posts error:", error);
        toast("Could not load posts.");
    }
}

function formatPostTime(date) {
    if (!date) return "now";

    const seconds = Math.floor(
        (Date.now() - new Date(date).getTime()) / 1000
    );

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

    return new Date(date).toLocaleDateString();
}

const initials=name=>
 name.split(' ')
 .map(word=>word[0])
 .slice(0,2)
 .join('')
 .toUpperCase();


// =====================================================
// LOAD POSTS FROM MONGODB
// =====================================================

async function loadPosts(){

 try{

  const response=await fetch(`${API_URL}/posts`);

  const data=await response.json();

  if(!response.ok){
   throw new Error(data.message || "Failed to load posts");
  }

  // Remove the temporary frontend posts
  posts.length=0;

  // Add posts received from MongoDB
  data.posts.forEach(post=>{

   posts.push({

    id:post._id,

    name:post.author?.name || "Lion Link User",

    handle:`@${post.author?.username || "user"}`,

    initials:initials(
     post.author?.name || "Lion Link User"
    ),

    time:formatPostTime(post.createdAt),

    text:post.text || "",

    comments:Array.isArray(post.comments) ? post.comments.length : (post.comments || 0),

    likes:Array.isArray(post.likes) ? post.likes.length : (post.likes || 0),

    media:post.media || [],

    liked:false

   });

  });

  renderPosts();

 }catch(error){

  console.error("Load posts error:",error);

  toast("Unable to load posts.");

 }

}


// =====================================================
// FORMAT POST TIME
// =====================================================

function formatPostTime(date){

 if(!date) return "";

 const seconds=Math.floor(
  (Date.now()-new Date(date).getTime())/1000
 );

 if(seconds<60){
  return `${seconds}s`;
 }

 const minutes=Math.floor(seconds/60);

 if(minutes<60){
  return `${minutes}m`;
 }

 const hours=Math.floor(minutes/60);

 if(hours<24){
  return `${hours}h`;
 }

 const days=Math.floor(hours/24);

 return `${days}d`;

}


// =====================================================
// MEDIA
// =====================================================

const mediaMarkup=(media=[],postIndex=-1)=>{

 if(!media.length)return'';

 const shown=media.slice(0,4);
 const more=media.length-4;

 return `
 <div class="post-media gallery gallery-${Math.min(media.length,4)}">

 ${shown.map((m,i)=>`

  <div class="gallery-item">

   ${
    m.type==='video'
    ? `<video controls src="${m.url}"></video>`
    : `<img src="${m.url}" alt="Post attachment ${i+1}"/>`
   }

   ${
    i===3&&more>0
    ? `<button class="media-more" data-open-gallery="${postIndex}">+${more}</button>`
    : ''
   }

  </div>

 `).join('')}

 </div>
 `;

};


// =====================================================
// POST MARKUP
// =====================================================

function postMarkup(p,index){

 const comments=(p.commentItems||[])
 .map((c,i)=>`

  <div class="comment">

   ${
    c.replyTo
    ? `<span class="replying-to">
        Replying to @${escapeHtml(c.replyTo)}
       </span>`
    : ''
   }

   <p>
    <b>${escapeHtml(c.name)}</b>
    ${escapeHtml(c.text)}
   </p>

   <button data-comment-like="${index}:${i}">
    ♥ ${c.likes||0}
   </button>

   <button data-comment-reply="${index}:${i}">
    ↩ Reply
   </button>

  </div>

 `).join('');

 const target=p.replyingTo
  ? `<div class="reply-context">
      Replying to @${escapeHtml(p.replyingTo)}
     </div>`
  : '';

 return `
 <article class="post">

  <button
   class="avatar avatar-gold profile-link"
   data-profile="${index}">
   ${p.initials}
  </button>

  <div class="post-content">

   ${target}

   <div class="post-meta">

    <strong>

     <button
      class="profile-link"
      data-profile="${index}">
      ${p.name}
     </button>

     ${p.official
      ? '<span class="verified">✓</span>'
      : ''}

    </strong>

    <span>
     ${p.handle} · ${p.time}
    </span>

   </div>

   ${
    p.text
    ? `<p class="post-text">
        ${escapeHtml(p.text)}
       </p>`
    : ''
   }

   ${mediaMarkup(p.media,index)}

   ${
    p.image
    ? `<div class="post-image">
        ${p.image}
       </div>`
    : ''
   }

   <div class="post-actions">

    <button
     class="action like-action ${p.liked?'liked':''}"
     data-index="${index}">
     ♥ ${p.likes}
    </button>

    <button
     class="action comment-action"
     data-index="${index}">
     💬 ${p.comments}
    </button>

    <button
     class="action share-action"
     data-index="${index}">
     ↗ Share
    </button>

   </div>

   ${
    p.commentsOpen
    ? `
     <div class="comment-thread">

      ${
       comments ||
       '<p class="no-comments">Be the first to comment.</p>'
      }

      <form data-comment-form="${index}">

       <span
        class="reply-indicator"
        hidden>
       </span>

       <input
        required
        maxlength="180"
        placeholder="Write a comment…"/>

       <button>
        Reply
       </button>

      </form>

     </div>
    `
    : ''
   }

  </div>

 </article>
 `;

}


// =====================================================
// RENDER POSTS
// =====================================================

function renderPosts(){
  console.log("POSTS:", posts);
console.log("FEED ELEMENT:", feed);

 feed.innerHTML=posts
  .map(postMarkup)
  .join('');

 const profile=viewedProfile || {
  name:currentUser.name
 };

 document.querySelector('#profile-posts').innerHTML=

  posts
   .filter(p=>p.name===profile.name)
   .map(p=>postMarkup(p,posts.indexOf(p)))
   .join('')

  ||

  '<p class="empty-profile">No posts yet.</p>';

}


// =====================================================
// ANNOUNCEMENTS
// =====================================================

function renderAnnouncements(){

 document.querySelector('#announcement-list').innerHTML=

 announcements.map(a=>`

  <article class="announcement-card">

   <div class="date">
    ${a.date}
   </div>

   <div>

    <span class="official-label">
     LION LINK ADMIN <b>✓</b>
    </span>

    <h3>${a.title}</h3>

    <p>${a.body}</p>

    ${mediaMarkup(a.media)}

   </div>

  </article>

 `).join('');


 document.querySelector('#admin-announcements').innerHTML=

 announcements.map((a,i)=>`

  <article class="admin-announcement">

   <div>

    <b>${a.title}</b>

    <p>${a.body}</p>

   </div>

   <button data-delete-announcement="${i}">
    Remove
   </button>

  </article>

 `).join('');

}


// =====================================================
// PEOPLE
// =====================================================

function renderPeople(){

 document.querySelector('#people-list').innerHTML=

 people.map((p,i)=>`

  <div class="person">

   <div class="avatar avatar-gold">
    ${p.initials}
   </div>

   <div>

    <strong>${p.name}</strong>

    <small>${p.handle}</small>

   </div>

   <button data-person="${i}">
    Follow
   </button>

  </div>

 `).join('');

}


// =====================================================
// CONVERSATIONS
// =====================================================

function renderConversations(){

 document.querySelector('#conversations').innerHTML=

 chats.map((c,i)=>`

  <div
   class="conversation ${i===selectedChat?'selected':''}"
   data-chat="${i}">

   <div class="avatar avatar-gold">
    ${c.initials}
   </div>

   <div>

    <strong>${c.name}</strong>

    <p>${c.preview}</p>

   </div>

  </div>

 `).join('');

}


// =====================================================
// OPEN CHAT
// =====================================================

function openChat(index){

 selectedChat=index;

 const c=chats[index];

 document
  .querySelector('#messages-view')
  .classList
  .add('chat-open');

 renderConversations();

 document.querySelector('#chat-empty').hidden=true;

 const active=document.querySelector('#active-chat');

 active.hidden=false;

 active.innerHTML=`

  <header class="chat-header">

   <button
    class="chat-back"
    aria-label="Back to messages">
    ‹
   </button>

   <div class="avatar avatar-gold">
    ${c.initials}
   </div>

   <div>

    <strong>${c.name}</strong>

    <small>
     ${
      c.online
      ? '● Active now'
      : 'Last active recently'
     }
    </small>

   </div>

  </header>

  <div class="messages" id="messages">

   ${c.messages.map(m=>`

    <div class="bubble ${m.mine?'mine':''}">
     ${escapeHtml(m.text)}
    </div>

   `).join('')}

  </div>

  <form
   class="chat-compose"
   id="chat-form">

   <input
    id="chat-input"
    maxlength="300"
    autocomplete="off"
    placeholder="Write a message…"/>

   <button>
    Send
   </button>

  </form>

 `;

 const box=document.querySelector('#messages');

 box.scrollTop=box.scrollHeight;

 active
  .querySelector('.chat-back')
  .onclick=()=>
   document
    .querySelector('#messages-view')
    .classList
    .remove('chat-open');

 document
  .querySelector('#chat-form')
  .addEventListener('submit',e=>{

   e.preventDefault();

   const input=document.querySelector('#chat-input');

   if(!input.value.trim())return;

   c.messages.push({
    mine:true,
    text:input.value.trim()
   });

   c.preview=`You: ${input.value.trim()}`;

   openChat(index);

  });

}


// =====================================================
// TOAST
// =====================================================

function toast(message){

 const t=document.querySelector('#toast');

 t.textContent=message;

 t.classList.add('show');

 setTimeout(
  ()=>t.classList.remove('show'),
  2200
 );

}


// =====================================================
// VIEW SWITCHING
// =====================================================

function showView(view){

 document
  .querySelectorAll('.nav-link,.bottom-nav button')
  .forEach(b=>
   b.classList.toggle(
    'active',
    b.dataset.view===view
   )
  );

 document
  .querySelectorAll('.view')
  .forEach(v=>
   v.classList.remove('active')
  );

 document
  .querySelector(`#${view}-view`)
  .classList
  .add('active');

}


// =====================================================
// PROFILE
// =====================================================

function viewProfile(post){

 viewedProfile={
  name:post.name,
  handle:post.handle,
  initials:post.initials
 };

 const own=post.name===currentUser.name;

 document.querySelector('#profile-name').textContent=post.name;

 document.querySelector('#profile-handle').textContent=post.handle;

 document.querySelector('.profile-avatar').textContent=post.initials;

 document.querySelector('.profile-bio').textContent=

  own
  ? 'UNN student · Sharing campus moments and meeting new people.'
  : 'UNN Lion Link community member.';

 document.querySelector('.edit-profile').hidden=!own;

 document.querySelector('.message-profile').hidden=own;

 renderPosts();

 showView('profile');

}


document
 .querySelectorAll('.nav-link,.bottom-nav button')
 .forEach(btn=>
  btn.addEventListener(
   'click',
   ()=>showView(btn.dataset.view)
  )
 );


// =====================================================
// POST COMPOSER
// =====================================================

const postText=document.querySelector('#post-text');

const mediaInput=document.querySelector('#media-input');

const mediaPreview=document.querySelector('#media-preview');


function updatePostButton(){

 document.querySelector('#character-count').textContent=
  `${postText.value.length} / 280`;

 document.querySelector('#submit-post').onclick = async () => {

    const text = postText.value.trim();

    if (!text && !selectedMedia.length) {
        return;
    }

    if (!authToken) {
        toast("Please log in first.");
        return;
    }

    try {

        const response = await fetch(`${API_URL}/posts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                text
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to create post");
        }

        postText.value = "";
        selectedMedia = [];

        renderMediaPreview();
        updatePostButton();

        await loadPosts();

        toast("Your post is live!");

    } catch (error) {

        console.error("Create post error:", error);
        toast(error.message || "Could not create post.");

    }
};
}


function renderMediaPreview(){

 mediaPreview.hidden=!selectedMedia.length;

 mediaPreview.innerHTML=

  selectedMedia.map((m,i)=>`

   <div>

    ${
     m.type==='video'
     ? `<video src="${m.url}" muted></video>`
     : `<img src="${m.url}" alt="Selected attachment"/>`
    }

    <button
     type="button"
     data-remove-media="${i}"
     aria-label="Remove media">
     ×
    </button>

   </div>

  `).join('');

}


const videoDuration=file=>

 new Promise(resolve=>{

  const video=document.createElement('video');

  const url=URL.createObjectURL(file);

  video.preload='metadata';

  video.onloadedmetadata=()=>{

   URL.revokeObjectURL(url);

   resolve(video.duration);

  };

  video.onerror=()=>{

   URL.revokeObjectURL(url);

   resolve(Infinity);

  };

  video.src=url;

 });


postText.addEventListener(
 'input',
 updatePostButton
);


document
 .querySelector('#media-picker')
 .onclick=()=>mediaInput.click();


mediaInput.addEventListener(
 'change',
 async()=>{

  const files=[...mediaInput.files];

  mediaInput.value='';

  const usable=[];

  for(const file of files){

   if(
    !(
     file.type.startsWith('image/') ||
     file.type.startsWith('video/')
    )
   ){

    toast('Only photos and videos can be added.');

    continue;

   }

   if(file.size>150*1024*1024){

    toast(
     `${file.name} is over the 150 MB limit.`
    );

    continue;

   }

   if(
    file.type.startsWith('video/') &&
    await videoDuration(file)>120
   ){

    toast(
     `${file.name} is longer than the 2-minute limit.`
    );

    continue;

   }

   usable.push({

    url:URL.createObjectURL(file),

    type:file.type.startsWith('video/')
     ? 'video'
     : 'image'

   });

  }

  selectedMedia.push(...usable);

  renderMediaPreview();

  updatePostButton();

 }
);


mediaPreview.addEventListener(
 'click',
 e=>{

  const i=e.target.dataset.removeMedia;

  if(i===undefined)return;

  URL.revokeObjectURL(
   selectedMedia[i].url
  );

  selectedMedia.splice(i,1);

  renderMediaPreview();

  updatePostButton();

 }
);


// =====================================================
// OPEN POST COMPOSER
// =====================================================

function focusComposer(){

 showView('feed');

 setTimeout(
  ()=>postText.focus(),
  0
 );

}

document
 .querySelector('#open-post')
 .onclick=focusComposer;


// =====================================================
// CREATE POST
// =====================================================

document
 .querySelector('#submit-post')
 .onclick=()=>{

  const text=postText.value.trim();

  if(!text&&!selectedMedia.length)return;

  posts.unshift({

   name:currentUser.name,

   handle:'@jordansmith',

   initials:initials(currentUser.name),

   time:'now',

   text,

   comments:0,

   likes:0,

   media:selectedMedia

  });

  postText.value='';

  selectedMedia=[];

  renderMediaPreview();

  updatePostButton();

  renderPosts();

  toast('Your post is live!');

 };


document
 .querySelectorAll('.tool-button[data-add]')
 .forEach(b=>

  b.onclick=()=>{

   postText.value+=b.dataset.add;

   postText.focus();

   updatePostButton();

  }

 );


// =====================================================
// GALLERY
// =====================================================

function openGallery(index){

 const post=posts[index];

 if(!post?.media)return;

 document.querySelector('#media-modal-content').innerHTML=

  post.media.map((m,i)=>`

   <div class="modal-media">

    ${
     m.type==='video'
     ? `<video controls autoplay src="${m.url}"></video>`
     : `<img src="${m.url}" alt="Attachment ${i+1}"/>`
    }

   </div>

  `).join('');

 document.querySelector('#media-modal').hidden=false;

}


// =====================================================
// SHARE
// =====================================================

function copyPostLink(){

 const text=location.href;

 if(navigator.clipboard?.writeText)

  return navigator.clipboard
   .writeText(text)
   .then(
    ()=>toast('Post link copied to your clipboard!')
   )
   .catch(
    ()=>toast('Copy the page address to share this post.')
   );

 const input=document.createElement('textarea');

 input.value=text;

 document.body.append(input);

 input.select();

 try{

  document.execCommand('copy');

  toast('Post link copied to your clipboard!');

 }catch{

  toast('Copy the page address to share this post.');

 }

 input.remove();

}


function sharePost(index){

 const post=posts[index];

 const shareData={
  title:`Lion Link · ${post.name}`,
  text:post.text||'A Lion Link post'
 };

 if(
  navigator.share &&
  location.protocol!=='file:'
 ){

  Promise
   .resolve(
    navigator.share({
     ...shareData,
     url:location.href
    })
   )
   .catch(error=>{

    if(error?.name!=='AbortError')
     copyPostLink();

   });

 }else{

  copyPostLink();

 }

}


// =====================================================
// FEED ACTIONS
// =====================================================

feed.addEventListener(
 'click',
 e=>{

  const gallery=e.target.closest(
   '[data-open-gallery]'
  );

  if(gallery){

   openGallery(
    +gallery.dataset.openGallery
   );

   return;

  }


  const link=e.target.closest(
   '.profile-link'
  );

  if(link){

   viewProfile(
    posts[+link.dataset.profile]
   );

   return;

  }


  const i=e.target.dataset.index;


  if(
   e.target.classList.contains(
    'like-action'
   )
  ){

   posts[i].liked=!posts[i].liked;

   posts[i].likes+=
    posts[i].liked ? 1 : -1;

   renderPosts();

  }


  if(
   e.target.classList.contains(
    'comment-action'
   )
  ){

   posts[i].commentsOpen=
    !posts[i].commentsOpen;

   renderPosts();

  }


  if(
   e.target.classList.contains(
    'share-action'
   )
  ){

   sharePost(+i);

  }


  if(e.target.dataset.commentLike){

   const [
    postIndex,
    commentIndex
   ]=
    e.target
     .dataset
     .commentLike
     .split(':')
     .map(Number);

   const comment=
    posts[postIndex]
     .commentItems[commentIndex];

   comment.likes=
    (comment.likes||0)+1;

   renderPosts();

  }


  if(e.target.dataset.commentReply){

   const [
    postIndex,
    commentIndex
   ]=
    e.target
     .dataset
     .commentReply
     .split(':')
     .map(Number);

   const form=
    feed.querySelector(
     `[data-comment-form="${postIndex}"]`
    );

   const comment=
    posts[postIndex]
     .commentItems[commentIndex];

   if(form){

    form.dataset.replyTo=
     comment.name;

    const label=
     form.querySelector(
      '.reply-indicator'
     );

    label.textContent=
     `Replying to @${comment.name}`;

    label.hidden=false;

    form
     .querySelector('input')
     .focus();

   }

  }

 }
);


// =====================================================
// COMMENTS
// =====================================================

feed.addEventListener(
 'submit',
 e=>{

  const form=e.target.closest(
   '[data-comment-form]'
  );

  if(!form)return;

  e.preventDefault();

  const i=+form.dataset.commentForm;

  const input=form.querySelector('input');

  posts[i].commentItems??=[];

  posts[i].commentItems.push({

   name:currentUser.name,

   text:input.value.trim(),

   likes:0,

   replyTo:form.dataset.replyTo||''

  });

  posts[i].comments++;

  posts[i].commentsOpen=true;

  renderPosts();

 }
);


// =====================================================
// OTHER FEED CONTROLS
// =====================================================

document
 .querySelector('#pinned-announcement .close-strip')
 .onclick=()=>
  document
   .querySelector('#pinned-announcement')
   .remove();


document
 .querySelector('#refresh-feed')
 .onclick=()=>
  toast('You’re all caught up!');


document
 .querySelector('#people-list')
 .addEventListener(
  'click',
  e=>{

   if(e.target.matches('button')){

    e.target.classList.toggle(
     'following'
    );

    e.target.textContent=
     e.target.classList.contains(
      'following'
     )
     ? 'Following'
     : 'Follow';

   }

  }
 );


document
 .querySelector('#conversations')
 .addEventListener(
  'click',
  e=>{

   const item=
    e.target.closest('[data-chat]');

   if(item)
    openChat(+item.dataset.chat);

  }
 );


// =====================================================
// DARK MODE
// =====================================================

const themeToggle=
 document.querySelector('#theme-toggle');

const mobileTheme=
 document.querySelector('#mobile-theme');


function setTheme(dark){

 document.body.classList.toggle(
  'dark',
  dark
 );

 themeToggle.innerHTML=
  `<span>◐</span> ${
   dark
   ? 'Light mode'
   : 'Dark mode'
  }`;

 mobileTheme.textContent=
  dark
  ? '☀'
  : '◐';

 localStorage.setItem(
  'lion-link-theme',
  dark
  ? 'dark'
  : 'light'
 );

}


setTheme(
 localStorage.getItem(
  'lion-link-theme'
 )==='dark'
);


themeToggle.onclick=()=>
 setTheme(
  !document.body.classList.contains('dark')
 );


mobileTheme.onclick=()=>
 setTheme(
  !document.body.classList.contains('dark')
 );


// =====================================================
// ADMIN
// =====================================================

function setAdmin(isAdmin){

 document
  .querySelector('[data-view="admin"]')
  .hidden=!isAdmin;

}


document
 .querySelector('#login-role')
 ?.addEventListener(
  'change',
  e=>{

   const admin=
    e.target.value==='admin';

   document
    .querySelector('#admin-password-field')
    .hidden=!admin;

   document
    .querySelector('#admin-password')
    .required=admin;

  }
 );




   setAdmin(
    currentUser.role==='admin'
   );

   document
    .querySelector('#login-overlay')
    .classList
    .add('hidden');

   toast(
    currentUser.role==='admin'
    ? 'Lion Link Admin console enabled.'
    : 'Welcome to Lion Link!'
   );

  

document
 .querySelector('#open-admin')
 .onclick=()=>
  showView('admin');


// =====================================================
// EDIT PROFILE
// =====================================================

document
 .querySelector('.edit-profile')
 .onclick=()=>{

  document.querySelector('#edit-name').value=
   currentUser.name;

  document.querySelector('#edit-bio').value=
   document.querySelector('.profile-bio')
    .textContent;

  document
   .querySelector('#edit-modal')
   .hidden=false;

 };


document
 .querySelector('#edit-profile-form')
 .addEventListener(
  'submit',
  e=>{

   e.preventDefault();

   const name=
    document
     .querySelector('#edit-name')
     .value
     .trim();

   const bio=
    document
     .querySelector('#edit-bio')
     .value
     .trim();

   const avatar=
    document
     .querySelector('#edit-avatar')
     .files[0];

   const cover=
    document
     .querySelector('#edit-cover')
     .files[0];

   if(!name)return;

   currentUser.name=name;

   viewedProfile={
    name,
    handle:`@${name
     .toLowerCase()
     .replace(/\s+/g,'')}`,
    initials:initials(name)
   };

   document
    .querySelector('#profile-name')
    .textContent=name;

   document
    .querySelector('.account strong')
    .textContent=name;

   document
    .querySelector('#profile-handle')
    .textContent=
     viewedProfile.handle;

   document
    .querySelector('.profile-bio')
    .textContent=bio;

   const profileAvatar=
    document.querySelector(
     '.profile-avatar'
    );

   profileAvatar.textContent=
    initials(name);

   if(avatar){

    profileAvatar.style.backgroundImage=
     `url(${URL.createObjectURL(avatar)})`;

    profileAvatar.style.backgroundSize=
     'cover';

    profileAvatar.style.color=
     'transparent';

   }

   if(cover){

    document
     .querySelector('#profile-cover')
     .style.backgroundImage=
      `url(${URL.createObjectURL(cover)})`;

    document
     .querySelector('#profile-cover')
     .style.backgroundSize=
      'cover';

    document
     .querySelector('#profile-cover')
     .style.backgroundPosition=
      'center';

   }

   document
    .querySelector('#edit-modal')
    .hidden=true;

   renderPosts();

   toast('Profile updated.');

  }
 );


// =====================================================
// MESSAGE PROFILE
// =====================================================

document
 .querySelector('.message-profile')
 .onclick=()=>{

  const profile=viewedProfile;

  if(!profile)return;

  let index=
   chats.findIndex(
    c=>c.name===profile.name
   );

  if(index<0){

   chats.unshift({

    name:profile.name,

    initials:profile.initials,

    online:false,

    preview:'Start a conversation',

    messages:[]

   });

   index=0;

  }

  showView('messages');

  openChat(index);

 };


// =====================================================
// MISC
// =====================================================

document
 .querySelector('#share-app')
 .onclick=()=>
  sharePost(0);


document
 .querySelector('#help-link')
 .onclick=()=>
  toast(
   'Lion Link help: posts, announcements, messages, and community safety.'
  );


document
 .querySelectorAll('[data-close-modal]')
 .forEach(button=>

  button.onclick=()=>

   document
    .querySelector(
     `#${button.dataset.closeModal}`
    )
    .hidden=true

 );


// =====================================================
// ADMIN ANNOUNCEMENTS
// =====================================================

let announcementMedia=[];

const announcementInput=
 document.querySelector(
  '#announcement-media'
 );

const announcementPreview=
 document.querySelector(
  '#announcement-preview'
 );


announcementInput.addEventListener(
 'change',
 ()=>{

  announcementMedia=
   [...announcementInput.files]
    .filter(
     f=>
      f.type.startsWith('image/') ||
      f.type.startsWith('video/')
    )
    .map(f=>({

     url:URL.createObjectURL(f),

     type:f.type.startsWith('video/')
      ? 'video'
      : 'image'

    }));

  announcementPreview.hidden=
   !announcementMedia.length;

  announcementPreview.innerHTML=
   announcementMedia.map(m=>`

    <div>

     ${
      m.type==='video'
      ? `<video src="${m.url}" muted></video>`
      : `<img src="${m.url}" alt="Announcement media"/>`
     }

    </div>

   `).join('');

  }
 );


document
 .querySelector('#announcement-form')
 .addEventListener(
  'submit',
  e=>{

   e.preventDefault();

   const title=
    document.querySelector(
     '#announcement-title'
    );

   const body=
    document.querySelector(
     '#announcement-body'
    );

   announcements.unshift({

    date:'NEW',

    title:title.value.trim(),

    body:body.value.trim(),

    media:announcementMedia

   });

   title.value='';

   body.value='';

   announcementMedia=[];

   announcementInput.value='';

   announcementPreview.hidden=true;

   announcementPreview.innerHTML='';

   renderAnnouncements();

   toast(
    'Official announcement published.'
   );

  }
 );


document
 .querySelector('#admin-announcements')
 .addEventListener(
  'click',
  e=>{

   const i=
    e.target.dataset
     .deleteAnnouncement;

   if(i===undefined)return;

   announcements.splice(i,1);

   renderAnnouncements();

   toast(
    'Announcement removed.'
   );

  }
 );


// =====================================================
// START APPLICATION
// =====================================================

// Load real posts from MongoDB
// instead of only using temporary frontend posts.

console.log("APP JS REACHED THE BOTTOM");

loadPosts();

renderAnnouncements();

renderPeople();

renderConversations();

// Real account flow: replaces the original demo login.
document.querySelector('#login-mode').addEventListener('change', e => {
 const signup=e.target.value==='signup';
 document.querySelector('#login-name-field').hidden=!signup;
 document.querySelector('#login-username-field').hidden=!signup;
});
document.querySelector('#login-form').addEventListener('submit', async e => {
 e.preventDefault();
 const signup=document.querySelector('#login-mode').value==='signup';
 const email=document.querySelector('#login-email').value.trim();
 const password=document.querySelector('#login-password').value;
 try {
  const response=await fetch(`${API_URL}/auth/${signup?'signup':'login'}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signup ? {name:document.querySelector('#login-name').value.trim(),username:document.querySelector('#login-username').value.trim(),email,password} : {identity:email,password})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.message||'Could not sign in');
  authToken=data.token;
  localStorage.setItem('lionLinkToken',authToken);
  currentUser={name:data.user.name,role:data.user.role};
  setAdmin(data.user.role==='admin');
  document.querySelector('#login-overlay').classList.add('hidden');
  loadPosts();
  toast(signup?'Account created — welcome!':'Welcome back!');
 } catch(error) { toast(error.message); }
});
