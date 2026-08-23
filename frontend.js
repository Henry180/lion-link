// Same-site API in production. Cloudflare Pages forwards /api via its Pages Function.
const API_URL = window.LION_LINK_API_URL || (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:5000/api' : '/api');
const $ = s => document.querySelector(s);
let token = localStorage.getItem('lionLinkToken');
let me = null, posts = [], announcements = [], conversations = [], activeChat = null, selectedMedia = [], stories=[], viewedProfile=null, quickMedia=[], announcementMedia=[];
const esc = value => { const el=document.createElement('div'); el.textContent=value||''; return el.innerHTML; };
const initials = name => String(name||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const when = date => { const s=Math.max(0,Math.floor((Date.now()-new Date(date))/1000)); return s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m`:s<86400?`${Math.floor(s/3600)}h`:`${Math.floor(s/86400)}d`; };
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500)}
async function api(path, options={}) { let response;try{response=await fetch(API_URL+"/api"+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});}catch{throw Error('Cannot reach Lion Link. Start the backend and try again.');}const text=response.status===204?'':await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={message:'Lion Link received an unexpected response. Please try again.'};}if(!response.ok)throw Error(data.message||`Request failed (${response.status})`);return data; }
function show(view){if(view==='profile'&&me&&!viewedProfile)renderProfile(me);document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`${view}-view`));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));}
function identity(){if(!me)return;$('.account strong').textContent=me.name;$('.account small').textContent='@'+me.username;$('.account .avatar').textContent=initials(me.name);$('.composer>.avatar').textContent=initials(me.name);$('[data-view="admin"]').hidden=me.role!=='admin';renderProfile(me);}
function postMarkup(post){const mine=post.author?._id===me?.id||post.author?.id===me?.id;const user=post.author?.username||'';const hasStory=stories.some(s=>s.author?.username===user);const likes=Array.isArray(post.likes)?post.likes:[];const comments=Array.isArray(post.comments)?post.comments:[];const media=post.media||[];const avatar=post.author?.profileImage?`style="background-image:url('${post.author.profileImage}');background-size:cover"`:'';const tiles=media.slice(0,4).map((m,i)=>`<button class="gallery-item" type="button" data-open-media="${post._id}:${i}" aria-label="Open post media ${i+1}">${m.type==='video'?`<video muted preload="metadata" src="${m.url}"></video>`:`<img src="${m.url}" alt="Post media ${i+1}">`}${i===3&&media.length>4?`<span class="media-more">+${media.length-4}</span>`:''}</button>`).join('');const commentMarkup=c=>{const commentLikes=Array.isArray(c.likes)?c.likes:[];const liked=commentLikes.some(id=>(id._id||id).toString()===me?.id);const isMine=(c.author?._id||c.author?.id||c.author)?.toString()===me?.id?.toString();const editable=isMine&&c.createdAt&&Date.now()-new Date(c.createdAt).getTime()<=15*60*1000;return `<div class="comment"><div class="comment-line"><p><b>${esc(c.author?.name||'User')}</b> ${esc(c.text)}</p>${isMine?`<button class="comment-more" data-comment-menu="${post._id}:${c._id}" aria-label="Comment options">•••</button><div class="comment-menu" id="comment-menu-${post._id}-${c._id}" hidden>${editable?`<button data-edit-comment="${post._id}:${c._id}">Edit</button>`:''}<button data-delete-comment="${post._id}:${c._id}">Delete</button></div>`:''}</div><button class="${liked?'liked':''}" data-comment-like="${post._id}:${c._id}">♥ ${commentLikes.length}</button><button data-reply-to="${post._id}:${c._id}">Reply</button></div>`};return `<article class="post"><button class="avatar avatar-gold ${hasStory?'has-story':''}" data-avatar="${user}" ${avatar}>${post.author?.profileImage?'':initials(post.author?.name)}</button><div class="post-content"><div class="post-meta"><strong class="profile-name" data-profile="${user}">${esc(post.author?.name||'Lion Link User')}</strong><span>@${esc(user)} · ${when(post.createdAt)}</span>${mine?`<button class="action" data-menu="${post._id}">•••</button>`:` <button class="follow-small" data-follow="${user}">Follow</button>`}</div>${post.text?`<p class="post-text">${esc(post.text)}</p>`:''}${media.length?`<div class="post-media gallery gallery-${Math.min(media.length,4)}">${tiles}</div>`:''}<div class="post-actions"><button class="action" data-comment-toggle="${post._id}">💬 ${comments.length}</button><button class="action ${likes.some(id=>(id._id||id).toString()===me?.id)?'liked':''}" data-like="${post._id}">♥ ${likes.length}</button><button class="action" data-share="${post._id}">↗ Share</button></div><div class="post-menu" id="menu-${post._id}" hidden><button data-edit-post="${post._id}">Edit</button><button data-delete-post="${post._id}">Delete</button></div><div class="comment-thread" id="comments-${post._id}" hidden>${comments.map(commentMarkup).join('')}<form data-comment-form="${post._id}"><input maxlength="280" required placeholder="Write a reply…"><button>Reply</button></form></div></div></article>`;}
function renderPosts(){const all=posts.map(postMarkup).join('')||'<p class="empty-profile">No posts yet.</p>';$('#post-feed').innerHTML=all;const username=(viewedProfile||me)?.username;$('#profile-posts').innerHTML=posts.filter(p=>p.author?.username===username).map(postMarkup).join('')||'<p class="empty-profile">No posts yet.</p>';}
async function loadPosts(){posts=(await api('/posts')).posts;renderPosts();}
function renderProfile(user){if(!user)return;const own=user.username===me?.username;viewedProfile=own?null:user;$('#profile-name').textContent=user.name;$('#profile-handle').textContent='@'+user.username;const avatar=$('.profile-avatar');avatar.textContent=user.profileImage?'':initials(user.name);avatar.style.backgroundImage=user.profileImage?`url(${user.profileImage})`:'';avatar.style.backgroundSize='cover';avatar.dataset.profileAvatar=user.username;avatar.classList.toggle('has-story',stories.some(s=>s.author?.username===user.username));$('#profile-cover').style.backgroundImage=user.coverImage?`url(${user.coverImage})`:'';$('.profile-bio').textContent=user.bio||'UNN student · Sharing campus moments and meeting new people.';document.querySelectorAll('.profile-stats b')[0].textContent=user.following?.length??user.following??0;document.querySelectorAll('.profile-stats b')[1].textContent=user.followers?.length??user.followers??0;$('.edit-profile').hidden=!own;$('.message-profile').hidden=own;const follow=$('.follow-profile');follow.hidden=own;follow.textContent=user.isFollowing?'Following':'Follow';follow.classList.toggle('following',!!user.isFollowing);$('.profile-story-add').hidden=!own;renderPosts();}
async function openProfile(username){if(username===me.username){renderProfile(me);show('profile');return;}try{const {user}=await api('/users/'+encodeURIComponent(username));renderProfile(user);show('profile');}catch(error){toast(error.message);}}
async function loadAnnouncements(){announcements=(await api('/announcements')).announcements;const attachment=a=>(a.media||[]).map(m=>m.type==='video'?`<video class="announcement-media" controls src="${m.url}"></video>`:`<img class="announcement-media" src="${m.url}" alt="Announcement media">`).join('');$('#announcement-list').innerHTML=announcements.map(a=>`<article class="announcement-card"><div class="date">${new Date(a.createdAt).toLocaleDateString()}</div><div><span class="official-label">LION LINK ADMIN <b>✓</b></span><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p>${attachment(a)}</div></article>`).join('')||'<p class="empty-profile">No announcements yet.</p>';$('#admin-announcements').innerHTML=announcements.map(a=>`<article class="admin-announcement"><div><b>${esc(a.title)}</b><p>${esc(a.body)}</p>${attachment(a)}</div><button data-remove-announcement="${a._id}">Remove</button></article>`).join('');}
async function loadChats(){conversations=(await api('/conversations')).conversations;$('#conversations').innerHTML=conversations.map(c=>{const other=c.members.find(x=>(x._id||x.id)!==me.id)||me,last=c.messages.at(-1);return `<button class="conversation" data-chat="${c._id}"><div class="avatar avatar-gold">${initials(other.name)}</div><div><strong>${esc(other.name)}</strong><p>${esc(last?.text||(last?.media?'📎 Media':'Start a conversation'))}</p></div></button>`}).join('')||'<p class="empty-profile">No messages yet. Click a user’s avatar to start one.</p>';}
function openChat(id){activeChat=conversations.find(c=>c._id===id);if(!activeChat)return;const other=activeChat.members.find(x=>(x._id||x.id)!==me.id)||me;const messageMarkup=m=>{const mine=(m.sender?._id||m.sender)===me.id,media=m.media?.url?`<div class="message-media">${m.media.type==='video'?`<video controls src="${m.media.url}"></video>`:`<img src="${m.media.url}" alt="Message attachment">`}</div>`:'';return `<div class="message-row ${mine?'mine':''}"><div class="bubble">${media}${m.text?`<div class="message-text">${esc(m.text)}</div>`:''}</div></div>`};$('#chat-empty').hidden=true;$('#active-chat').hidden=false;$('#active-chat').innerHTML=`<header class="chat-header"><div class="avatar avatar-gold">${initials(other.name)}</div><div><strong>${esc(other.name)}</strong><small>@${esc(other.username)}</small></div></header><div class="messages" id="messages">${activeChat.messages.map(messageMarkup).join('')}</div><form class="chat-compose" id="chat-form"><input maxlength="300" placeholder="Write a message…"><label class="chat-media-picker" title="Attach image or video">📎<input id="chat-media-input" type="file" accept="image/*,video/*" hidden></label><button class="chat-send" type="submit" aria-label="Send message">➤</button></form>`;let chatMedia=null;$('#chat-media-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){e.target.value='';return toast('Attachments must be 5 MB or smaller.')}try{chatMedia=await fileData(file);toast('Attachment ready to send.')}catch{toast('That attachment could not be read.')}};$('#chat-form').onsubmit=async e=>{e.preventDefault();const text=e.target.elements[0].value.trim();if(!text&&!chatMedia)return;try{await api(`/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({text,media:chatMedia})});await loadChats();openChat(id)}catch(error){toast(error.message)}};}
function loginMode(){const signup=$('#login-mode').value==='signup';$('#login-name-field').hidden=!signup;$('#login-username-field').hidden=!signup;$('#login-email').placeholder=signup?'your@email.com':'email or username';}
$('#login-mode').onchange=loginMode;
$('#login-form').onsubmit=async event=>{event.preventDefault();try{const signup=$('#login-mode').value==='signup';const payload=signup?{name:$('#login-name').value.trim(),username:$('#login-username').value.trim(),email:$('#login-email').value.trim(),password:$('#login-password').value}:{identity:$('#login-email').value.trim(),password:$('#login-password').value};const result=await api(`/auth/${signup?'signup':'login'}`,{method:'POST',body:JSON.stringify(payload)});token=result.token;localStorage.setItem('lionLinkToken',token);me={...result.user,id:result.user.id||result.user._id};$('#login-overlay').classList.add('hidden');identity();await Promise.all([loadPosts(),loadAnnouncements(),loadChats()]);toast(signup?'Account created — welcome!':'Welcome back!');}catch(error){toast(error.message)}};
async function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({url:reader.result,type:file.type.startsWith('video/')?'video':'image'});reader.onerror=reject;reader.readAsDataURL(file)})}
$('#media-picker').onclick=()=>$('#media-input').click();$('#media-input').onchange=async event=>{try{selectedMedia=await Promise.all([...event.target.files].slice(0,8).filter(file=>file.size<5*1024*1024).map(fileData));$('#media-preview').hidden=!selectedMedia.length;$('#media-preview').innerHTML=selectedMedia.map((m,i)=>`<div>${m.type==='video'?`<video src="${m.url}"></video>`:`<img src="${m.url}">`}<button type="button" data-remove-media="${i}">×</button></div>`).join('');if(event.target.files.length>8)toast('Only the first 8 files were selected.')}catch{toast('That media could not be read')}};
$('#submit-post').onclick=async()=>{const text=$('#post-text').value.trim();if(!text&&!selectedMedia.length)return;try{await api('/posts',{method:'POST',body:JSON.stringify({text,media:selectedMedia})});$('#post-text').value='';selectedMedia=[];$('#media-preview').hidden=true;await loadPosts();toast('Your post is live!')}catch(error){toast(error.message)}};
$('#open-post').onclick=()=>{show('feed');$('#post-text').focus()};$('#refresh-feed').onclick=()=>loadPosts().catch(error=>toast(error.message));$('#open-admin').onclick=()=>show('admin');$('#theme-toggle').onclick=()=>document.body.classList.toggle('dark');$('#mobile-theme').onclick=()=>document.body.classList.toggle('dark');$('.edit-profile').onclick=()=>{$('#edit-name').value=me.name;$('#edit-bio').value=me.bio||'';$('#edit-modal').hidden=false};$('#edit-profile-form').onsubmit=async e=>{e.preventDefault();try{const avatar=$('#edit-avatar').files[0],cover=$('#edit-cover').files[0];me=(await api('/auth/me',{method:'PATCH',body:JSON.stringify({name:$('#edit-name').value,bio:$('#edit-bio').value,profileImage:avatar?await fileData(avatar).then(x=>x.url):me.profileImage,coverImage:cover?await fileData(cover).then(x=>x.url):me.coverImage})})).user;identity();$('#edit-modal').hidden=true;toast('Profile updated.')}catch(error){toast(error.message)}};$('#help-link').onclick=()=>toast('For help, contact a Lion Link administrator.');document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=()=>$('#'+b.dataset.closeModal).hidden=true);
$('#announcement-form').onsubmit=async event=>{event.preventDefault();try{await api('/announcements',{method:'POST',body:JSON.stringify({title:$('#announcement-title').value,body:$('#announcement-body').value})});event.target.reset();await loadAnnouncements();toast('Announcement published.')}catch(error){toast(error.message)}};
document.addEventListener('click',async event=>{const button=event.target.closest('[data-view]');if(button){if(button.dataset.view==='profile'){viewedProfile=null;renderProfile(me);}return show(button.dataset.view);}const d=event.target.dataset;if(d.like){const post=posts.find(p=>p._id===d.like),index=post.likes.findIndex(id=>(id._id||id).toString()===me.id);index<0?post.likes.push(me.id):post.likes.splice(index,1);renderPosts();try{await api(`/posts/${d.like}/like`,{method:'POST'})}catch(error){index<0?post.likes.pop():post.likes.push(me.id);renderPosts();toast(error.message)}}if(d.follow)try{const result=await api(`/users/${d.follow}/follow`,{method:'POST'});event.target.textContent=result.following?'Following':'Follow';event.target.classList.toggle('following',result.following);toast(result.following?'Following user':'Unfollowed user')}catch(error){toast(error.message)}if(d.commentToggle){const box=$('#comments-'+d.commentToggle);box.hidden=!box.hidden}if(d.deletePost&&confirm('Delete this post?'))try{await api('/posts/'+d.deletePost,{method:'DELETE'});loadPosts()}catch(error){toast(error.message)}if(d.editPost){const post=posts.find(p=>p._id===d.editPost),text=prompt('Edit post',post.text);if(text!==null)try{await api('/posts/'+d.editPost,{method:'PATCH',body:JSON.stringify({text})});loadPosts()}catch(error){toast(error.message)}}if(d.removeAnnouncement&&confirm('Remove this announcement?'))try{await api('/announcements/'+d.removeAnnouncement,{method:'DELETE'});loadAnnouncements()}catch(error){toast(error.message)}if(d.gallery){const post=posts.find(p=>p._id===d.gallery);$('#media-modal-content').innerHTML=post.media.map(m=>m.type==='video'?`<div class="modal-media"><video controls src="${m.url}"></video></div>`:`<div class="modal-media"><img src="${m.url}"></div>`).join('');$('#media-modal').hidden=false}if(d.chat)openChat(d.chat);if(d.user){if(d.user===me.username)return show('profile');try{const {conversation}=await api('/conversations',{method:'POST',body:JSON.stringify({username:d.user})});await loadChats();show('messages');openChat(conversation._id)}catch(error){toast(error.message)}}});
document.addEventListener('submit',async event=>{const id=event.target.dataset.commentForm;if(!id)return;event.preventDefault();try{await api(`/posts/${id}/comments`,{method:'POST',body:JSON.stringify({text:event.target.elements[0].value,replyTo:event.target.dataset.replyTo||null})});await loadPosts();const box=$('#comments-'+id);if(box)box.hidden=false;}catch(error){toast(error.message)}});
(async()=>{loginMode();if(!token)return;try{const result=await api('/auth/me');me=result.user;$('#login-overlay').classList.add('hidden');identity();await Promise.all([loadPosts(),loadAnnouncements(),loadChats()]);}catch{localStorage.removeItem('lionLinkToken');token=null;$('#login-overlay').classList.remove('hidden')}})();

async function loadStories(){stories=(await api('/stories')).stories;renderPosts();if(me){renderProfile(viewedProfile||me);const accountAvatar=$('.account .avatar');accountAvatar.classList.toggle('has-story',stories.some(s=>s.author?.username===me.username));}}
$('#story-upload')?.addEventListener('change',async e=>{try{await api('/stories',{method:'POST',body:JSON.stringify({media:await fileData(e.target.files[0])})});loadStories();toast('Story posted for 24 hours.')}catch(error){toast(error.message)}});
window.addEventListener('scroll',()=>$('#floating-post').hidden=window.scrollY<280);$('#floating-post').onclick=()=>{$('#quick-post-modal').hidden=false;$('#quick-post-text').focus()};
$('#refresh-feed').onclick=async()=>{await loadPosts();window.scrollTo({top:0,behavior:'smooth'});toast('Showing latest posts.');};
function openStory(story){$('#media-modal-content').innerHTML=story.media.type==='video'?`<div class="modal-media"><video controls autoplay src="${story.media.url}"></video></div>`:`<div class="modal-media"><img src="${story.media.url}" alt="Story"></div>`;$('#media-modal').hidden=false;}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-open-media],[data-profile],[data-avatar],[data-profile-avatar]'),d=target?.dataset||{};if(d.openMedia){const [postId,index]=d.openMedia.split(':');const item=posts.find(p=>p._id===postId)?.media[+index];if(item){$('#media-modal-content').innerHTML=item.type==='video'?`<div class="modal-media"><video controls autoplay src="${item.url}"></video></div>`:`<div class="modal-media"><img src="${item.url}" alt="Post media"></div>`;$('#media-modal').hidden=false;}}if(d.profile)openProfile(d.profile);if(d.avatar||d.profileAvatar){const username=d.avatar||d.profileAvatar,story=stories.find(s=>s.author?.username===username);if(story)openStory(story);else openProfile(username);}});
setTimeout(()=>{if(token)loadStories().catch(()=>{})},600);

let deferredInstall;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall=event; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
$('#install-app').onclick=async()=>{if(!deferredInstall)return toast('Use your browser menu and choose “Install app” or “Add to Home Screen”.');deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;};
$('#account-profile').onclick=()=>{renderProfile(me);show('profile');};
$('#logout').onclick=()=>{if(!confirm('Log out of Lion Link? You will need to sign in again to post, message, or manage your profile.'))return;localStorage.removeItem('lionLinkToken');token=null;me=null;$('#login-overlay').classList.remove('hidden');toast('You have been logged out.');};
$('#share-app').onclick=async()=>{const link=location.href;try{if(navigator.share)await navigator.share({title:'Lion Link',text:'Join Lion Link — your campus, connected.',url:link});else{await navigator.clipboard.writeText(link);toast('Lion Link link copied — send it to your friends!')}}catch{}};
$('#admin-code').onclick=async()=>{const code=prompt('Enter the admin invitation code');if(!code)return;try{const result=await api('/auth/become-admin',{method:'POST',body:JSON.stringify({code})});token=result.token;localStorage.setItem('lionLinkToken',token);me=result.user;identity();toast('You are now an admin.');}catch(error){toast(error.message)}};
document.querySelectorAll('[data-profile-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-profile-tab]').forEach(x=>x.classList.toggle('selected',x===button));const tab=button.dataset.profileTab,current=(viewedProfile||me)?.username;let list=posts.filter(p=>p.author?.username===current);if(tab==='replies')list=list.filter(p=>p.comments?.length);if(tab==='media')list=list.filter(p=>p.media?.length);if(tab==='likes')list=posts.filter(p=>Array.isArray(p.likes)&&p.likes.some(id=>(id._id||id).toString()===me.id));$('#profile-posts').innerHTML=list.map(postMarkup).join('')||`<p class="empty-profile">No ${tab} yet.</p>`;});
$('#quick-post-form').onsubmit=async e=>{e.preventDefault();const text=$('#quick-post-text').value.trim();if(!text)return;try{await api('/posts',{method:'POST',body:JSON.stringify({text,media:[]})});e.target.reset();$('#quick-post-modal').hidden=true;await loadPosts();window.scrollTo({top:0,behavior:'smooth'});toast('Your post is live!');}catch(error){toast(error.message);}};
$('.message-profile').onclick=async()=>{const user=viewedProfile;if(!user)return;try{const {conversation}=await api('/conversations',{method:'POST',body:JSON.stringify({username:user.username})});await loadChats();show('messages');openChat(conversation._id);}catch(error){toast(error.message);}};
$('.follow-profile').onclick=async()=>{const user=viewedProfile;if(!user)return;try{const result=await api(`/users/${encodeURIComponent(user.username)}/follow`,{method:'POST'});user.isFollowing=result.following;user.followers=result.followers;renderProfile(user);toast(result.following?'Following user':'Unfollowed user');}catch(error){toast(error.message);}};
async function uploadStory(file){if(!file)return;try{await api('/stories',{method:'POST',body:JSON.stringify({media:await fileData(file)})});await loadStories();toast('Story posted for 24 hours.');}catch(error){toast(error.message);}}
$('#profile-story-upload')?.addEventListener('change',e=>uploadStory(e.target.files[0]));
document.addEventListener('click',async event=>{const d=event.target.dataset;if(d.removeMedia!==undefined){selectedMedia.splice(+d.removeMedia,1);event.target.closest('div').remove();}if(d.menu){const menu=$('#menu-'+d.menu);menu.hidden=!menu.hidden;}if(d.commentLike){const [postId,commentId]=d.commentLike.split(':');try{await api(`/posts/${postId}/comments/${commentId}/like`,{method:'POST'});await loadPosts();const box=$('#comments-'+postId);if(box)box.hidden=false;}catch(error){toast(error.message)}}if(d.replyTo){const [postId,commentId]=d.replyTo.split(':');const form=document.querySelector(`[data-comment-form="${postId}"]`);if(form){form.dataset.replyTo=commentId;form.elements[0].placeholder='Write a reply…';form.elements[0].focus();}}if(d.share){const post=posts.find(p=>p._id===d.share),text=`${post.author?.name||'Lion Link user'} on Lion Link: ${post.text||''}`;try{if(navigator.share)await navigator.share({title:'Lion Link',text,url:location.href+'#post-'+post._id});else{await navigator.clipboard.writeText(text+' '+location.href);toast('Post text and Lion Link link copied.')}}catch{}}});
let reelVideos=[], reelIndex=0;
// Comment/reply owner controls. Edit expires after fifteen minutes; deletion remains available.
document.addEventListener('click', async event => {
 const d=event.target.dataset;
 if(d.commentMenu){const [postId,commentId]=d.commentMenu.split(':');const menu=$(`#comment-menu-${postId}-${commentId}`);if(menu)menu.hidden=!menu.hidden;}
 if(d.editComment){const [postId,commentId]=d.editComment.split(':'),comment=posts.find(post=>post._id===postId)?.comments.find(item=>item._id===commentId);const text=prompt('Edit comment',comment?.text||'');if(text!==null)try{await api(`/posts/${postId}/comments/${commentId}`,{method:'PATCH',body:JSON.stringify({text})});await loadPosts();const box=$('#comments-'+postId);if(box)box.hidden=false;}catch(error){toast(error.message)}}
 if(d.deleteComment){const [postId,commentId]=d.deleteComment.split(':');if(confirm('Delete this comment?'))try{await api(`/posts/${postId}/comments/${commentId}`,{method:'DELETE'});await loadPosts();const box=$('#comments-'+postId);if(box)box.hidden=false;}catch(error){toast(error.message)}}
});
function openReel(url){reelVideos=posts.flatMap(post=>(post.media||[]).filter(media=>media.type==='video').map(media=>({...media,post})));reelIndex=Math.max(0,reelVideos.findIndex(video=>video.url===url));renderReel();$('#reels-modal').hidden=false;}
function renderReel(){const reel=reelVideos[reelIndex];if(!reel)return;$('#reels-content').innerHTML=`<video controls autoplay src="${reel.url}"></video><p>${esc(reel.post.author?.name||'Lion Link user')} · ${esc(reel.post.text||'')}</p><small>${reelIndex+1} of ${reelVideos.length}</small>`;}
$('#close-reels').onclick=()=>$('#reels-modal').hidden=true;$('#reel-prev').onclick=()=>{if(reelVideos.length){reelIndex=(reelIndex-1+reelVideos.length)%reelVideos.length;renderReel()}};$('#reel-next').onclick=()=>{if(reelVideos.length){reelIndex=(reelIndex+1)%reelVideos.length;renderReel()}};
document.addEventListener('click',event=>{if(event.target.matches('.post-media video')){event.preventDefault();openReel(event.target.currentSrc||event.target.src)}});

function mediaPreview(items, container){const el=$(container);el.hidden=!items.length;el.innerHTML=items.map(m=>m.type==='video'?`<video controls src="${m.url}"></video>`:`<img src="${m.url}" alt="Selected media">`).join('');}
$('#quick-post-media').onchange=async e=>{quickMedia=await Promise.all([...e.target.files].slice(0,8).map(fileData));mediaPreview(quickMedia,'#quick-post-preview');};
$('#quick-post-form').onsubmit=async e=>{e.preventDefault();const text=$('#quick-post-text').value.trim();if(!text&&!quickMedia.length)return;try{await api('/posts',{method:'POST',body:JSON.stringify({text,media:quickMedia})});e.target.reset();quickMedia=[];mediaPreview(quickMedia,'#quick-post-preview');$('#quick-post-modal').hidden=true;await loadPosts();window.scrollTo({top:0,behavior:'smooth'});toast('Your post is live!');}catch(error){toast(error.message);}};
$('#announcement-media').onchange=async e=>{announcementMedia=await Promise.all([...e.target.files].slice(0,8).map(fileData));mediaPreview(announcementMedia,'#announcement-preview');};
$('#announcement-form').onsubmit=async event=>{event.preventDefault();try{await api('/announcements',{method:'POST',body:JSON.stringify({title:$('#announcement-title').value,body:$('#announcement-body').value,media:announcementMedia})});event.target.reset();announcementMedia=[];mediaPreview(announcementMedia,'#announcement-preview');await loadAnnouncements();toast('Announcement published.')}catch(error){toast(error.message)}};
function personMarkup(user){const avatar=user.profileImage?`style="background-image:url('${user.profileImage}');background-size:cover"`:'';const ring=stories.some(s=>s.author?.username===user.username)?'has-story':'';return `<div class="person"><button class="avatar avatar-gold ${ring}" data-avatar="${user.username}" ${avatar}>${user.profileImage?'':initials(user.name)}</button><div><strong class="profile-name" data-profile="${user.username}">${esc(user.name)}</strong><small>@${esc(user.username)}</small></div><button class="follow-small" data-follow="${user.username}">Follow</button></div>`;}
async function loadPeople(){try{const {users}=await api('/users/suggestions/all');$('#people-list').innerHTML=users.map(personMarkup).join('')||'<p class="empty-profile">No other members yet.</p>';renderMobileDrawers(users);}catch(error){console.warn(error);}}
$('#open-user-search').onclick=()=>{$('#user-search-modal').hidden=false;$('#user-search-input').focus();};
let searchTimer;$('#user-search-input').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{const value=e.target.value.trim();if(!value){$('#user-search-results').innerHTML='<p class="empty-profile">Search registered Lion Link users.</p>';return;}try{const {users}=await api('/users/search/'+encodeURIComponent(value));$('#user-search-results').innerHTML=users.map(personMarkup).join('')||'<p class="empty-profile">No people found.</p>';}catch(error){toast(error.message);}},180);};
const info={help:['Help','Need a hand? You can create posts, add stories, follow people, and send messages from their profile. Contact Lion Link support if you need account help.'],privacy:['Privacy','Your profile and posts are visible to Lion Link members. Use the profile editor to update the details you share.'],terms:['Terms','Use Lion Link respectfully. Do not post harmful, unlawful, or impersonating content.']};
document.addEventListener('click',e=>{const key=e.target.dataset.info;if(!key)return;$('#info-title').textContent=info[key][0];$('#info-content').textContent=info[key][1];$('#info-modal').hidden=false;});
$('#copyright-year').textContent=new Date().getFullYear();
function renderMobileDrawers(users=[]){const admin=me?.role==='admin'?'<button data-view="admin">⚙ Lion Link Admin</button>':'';$('#mobile-left-drawer').innerHTML=`<button data-view="feed">⌂ Home</button><button data-view="announcements">◉ Announcements</button><button data-view="messages">✉ Messages</button><button data-view="events">◇ Events</button><button data-view="profile">♙ Profile</button>${admin}<button id="drawer-theme">◐ Dark mode</button><button id="drawer-post">Create post</button><div class="drawer-account">${esc(me?.name||'')}</div>`;$('#mobile-right-drawer').innerHTML=`<h2>Upcoming events</h2><p>Student Club Fair · Sep 18</p><p>Lions Social Night · Sep 20</p><h2>People you may know</h2>${users.map(personMarkup).join('')||'<p>Loading people…</p>'}`;$('#drawer-theme').onclick=()=>document.body.classList.toggle('dark');$('#drawer-post').onclick=()=>{$('#quick-post-modal').hidden=false;closeDrawers();};}
function closeDrawers(){document.querySelectorAll('.mobile-drawer').forEach(x=>x.hidden=true);$('#drawer-scrim').hidden=true;}
function openDrawer(side){$('#mobile-'+side+'-drawer').hidden=false;$('#drawer-scrim').hidden=false;}
$('#drawer-scrim').onclick=closeDrawers;let touchStart;document.addEventListener('touchstart',e=>{touchStart=e.changedTouches[0];},{passive:true});document.addEventListener('touchend',e=>{if(!touchStart||innerWidth>800)return;const end=e.changedTouches[0],dx=end.clientX-touchStart.clientX,dy=end.clientY-touchStart.clientY;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy))openDrawer(dx>0?'left':'right');},{passive:true});
const originalIdentity=identity;identity=function(){originalIdentity();if(me){const avatar=$('.account .avatar');avatar.style.backgroundImage=me.profileImage?`url(${me.profileImage})`:'';avatar.style.backgroundSize='cover';avatar.classList.toggle('has-story',stories.some(s=>s.author?.username===me.username));loadPeople();}};

// Reliability and mobile usability improvements.
const baseRenderProfile = renderProfile;
renderProfile = function(user) {
  baseRenderProfile(user);
  const joined = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  if (joined) $('.profile-meta').innerHTML = `⌖ University of Nigeria, Nsukka &nbsp; · &nbsp; ◷ Joined ${esc(joined)}`;
};

const basePostMarkup = postMarkup;
postMarkup = function(post) {
  const markup = basePostMarkup(post);
  return markup.replace('<div class="post-menu"', `<span class="impressions" data-impressions="${post._id}">◉ ${Number(post.impressions || 0).toLocaleString()} impressions</span><div class="post-menu"`);
};

const countedImpressions = new Set();
const baseRenderPostsWithImpressions = renderPosts;
renderPosts = function() {
  baseRenderPostsWithImpressions();
  posts.forEach(post => {
    if (countedImpressions.has(post._id)) return;
    countedImpressions.add(post._id);
    api(`/posts/${post._id}/impression`, { method: 'POST' }).then(({ impressions }) => {
      post.impressions = impressions;
      document.querySelectorAll(`[data-impressions="${post._id}"]`).forEach(node => node.textContent = `◉ ${Number(impressions).toLocaleString()} impressions`);
    }).catch(() => countedImpressions.delete(post._id));
  });
};

$('#open-home-search')?.addEventListener('click', () => {
  $('#user-search-modal').hidden = false;
  $('#user-search-input').focus();
});
$('.profile-links a[href^="mailto:"]')?.setAttribute('href', 'mailto:lionlinkadmin@gmail.com');

let feedPosting = false;
$('#submit-post').onclick = async () => {
  if (feedPosting) return;
  const text = $('#post-text').value.trim();
  if (!text && !selectedMedia.length) return;
  feedPosting = true;
  $('#submit-post').disabled = true;
  try {
    const { post } = await api('/posts', { method: 'POST', body: JSON.stringify({ text, media: selectedMedia }) });
    posts.unshift(post);
    renderPosts();
    $('#post-text').value = '';
    selectedMedia = [];
    $('#media-input').value = '';
    $('#media-preview').hidden = true;
    toast('Your post is live!');
  } catch (error) { toast(error.message); }
  finally { feedPosting = false; $('#submit-post').disabled = false; }
};

async function postStoryWithCaption(file) {
  if (!file) return;
  const caption = prompt('Add a caption to your story (optional):', '');
  if (caption === null) return;
  try {
    await api('/stories', { method: 'POST', body: JSON.stringify({ media: await fileData(file), caption }) });
    await loadStories();
    toast('Story posted for 24 hours.');
  } catch (error) { toast(error.message); }
}
['#story-upload', '#profile-story-upload'].forEach(selector => $(selector)?.addEventListener('change', event => {
  event.stopImmediatePropagation();
  postStoryWithCaption(event.target.files[0]);
}, true));

openStory = function(story) {
  const mine = (story.author?._id || story.author?.id) === me?.id;
  const controls = mine ? `<div class="story-controls"><button data-edit-story="${story._id}">Edit caption</button><button data-delete-story="${story._id}">Delete story</button></div>` : '';
  $('#media-modal-content').innerHTML = `${story.media.type === 'video' ? `<div class="modal-media"><video controls autoplay src="${story.media.url}"></video></div>` : `<div class="modal-media"><img src="${story.media.url}" alt="Story"></div>`}<p class="story-caption">${esc(story.caption || '')}</p>${controls}`;
  $('#media-modal').hidden = false;
};
document.addEventListener('click', async event => {
  const d = event.target.dataset;
  if (d.editStory) {
    const story = stories.find(item => item._id === d.editStory);
    const caption = prompt('Edit story caption', story?.caption || '');
    if (caption !== null) try { await api(`/stories/${d.editStory}`, { method: 'PATCH', body: JSON.stringify({ caption }) }); await loadStories(); openStory({ ...story, caption }); } catch (error) { toast(error.message); }
  }
  if (d.deleteStory && confirm('Delete this story?')) try { await api(`/stories/${d.deleteStory}`, { method: 'DELETE' }); $('#media-modal').hidden = true; await loadStories(); toast('Story deleted.'); } catch (error) { toast(error.message); }
});

document.addEventListener('touchend', event => {
  if (innerWidth > 800 || $('#mobile-left-drawer').hidden && $('#mobile-right-drawer').hidden) return;
  const end = event.changedTouches[0];
  if (touchStart && Math.abs(end.clientX - touchStart.clientX) > 70) {
    closeDrawers();
    event.stopImmediatePropagation();
  }
}, true);

// In-app notifications for likes, comments, follows, and unread messages.
const notificationsView = document.createElement('section');
notificationsView.className = 'view';
notificationsView.id = 'notifications-view';
notificationsView.innerHTML = '<header class="page-header"><div><p class="eyebrow">STAY CONNECTED</p><h1>Notifications</h1></div><button class="icon-button" id="read-notifications" aria-label="Mark all notifications as read">✓</button></header><section id="notification-list" class="notification-list"></section>';
$('.main-content').append(notificationsView);
const notificationButton = document.createElement('button');
notificationButton.className = 'nav-link'; notificationButton.dataset.view = 'notifications'; notificationButton.innerHTML = '<span>♢</span> Notifications <i id="notification-count" hidden>0</i>';
document.querySelector('.main-nav').insertBefore(notificationButton, document.querySelector('.main-nav [data-view="profile"]'));
const mobileNotificationButton = document.createElement('button');
mobileNotificationButton.dataset.view = 'notifications'; mobileNotificationButton.innerHTML = '<span>♢</span>Alerts';
$('.bottom-nav').insertBefore(mobileNotificationButton, $('.bottom-nav [data-view="profile"]'));
async function loadNotifications() {
  if (!token) return;
  try {
    const { notifications, unread, unreadMessages } = await api('/notifications');
    const count = $('#notification-count'); count.textContent = unread; count.hidden = !unread;
    const messageButton = document.querySelector('[data-view="messages"] i');
    if (messageButton) { messageButton.textContent = unreadMessages || ''; messageButton.hidden = !unreadMessages; }
    $('#notification-list').innerHTML = notifications.map(item => `<article class="notification ${item.read ? '' : 'unread'}"><div class="avatar avatar-gold">${initials(item.actor?.name)}</div><p><b>${esc(item.actor?.name || 'Someone')}</b> ${item.type === 'like' ? 'liked your post' : item.type === 'comment' ? 'commented on your post' : item.type === 'follow' ? 'started following you' : 'sent you a message'}<small>${when(item.createdAt)}</small></p></article>`).join('') || '<p class="empty-profile">You have no notifications yet.</p>';
  } catch (error) { console.warn(error); }
}
$('#read-notifications').onclick = async () => { try { await api('/notifications/read', { method: 'POST' }); await loadNotifications(); } catch (error) { toast(error.message); } };
const identityWithNotifications = identity;
identity = function() { identityWithNotifications(); loadNotifications(); };

// Events are public to view and restricted to verified admins to manage.
let campusEvents = [];
const eventsView = $('#events-view');
eventsView.classList.remove('placeholder-view');
eventsView.innerHTML = '<header class="page-header"><div><p class="eyebrow">WHAT’S HAPPENING</p><h1>Campus events</h1></div></header><form id="event-form" class="event-form" hidden><input name="title" required maxlength="100" placeholder="Event title"><input name="startsAt" required type="datetime-local"><input name="location" maxlength="120" placeholder="Location"><textarea name="description" maxlength="500" placeholder="Event details (optional)"></textarea><button class="small-post">Publish event</button></form><section id="event-list" class="event-list"></section>';
function renderEvents() {
  const admin = me?.role === 'admin';
  $('#event-form').hidden = !admin;
  $('#event-list').innerHTML = campusEvents.map(event => `<article class="event-card"><time><b>${new Date(event.startsAt).toLocaleString(undefined, { month: 'short' }).toUpperCase()}</b><strong>${new Date(event.startsAt).getDate()}</strong></time><div><h2>${esc(event.title)}</h2><p>${new Date(event.startsAt).toLocaleString()} · ${esc(event.location)}</p><p>${esc(event.description || '')}</p></div>${admin ? `<button class="action" data-delete-event="${event._id}">Delete</button>` : ''}</article>`).join('') || '<p class="empty-profile">No upcoming events yet.</p>';
}
async function loadEvents() { try { campusEvents = (await api('/events')).events; renderEvents(); } catch (error) { console.warn(error); } }
$('#event-form').onsubmit = async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { await api('/events', { method: 'POST', body: JSON.stringify(data) }); event.target.reset(); await loadEvents(); toast('Event published.'); } catch (error) { toast(error.message); } };
document.addEventListener('click', async event => { const id = event.target.dataset.deleteEvent; if (!id || !confirm('Delete this event?')) return; try { await api(`/events/${id}`, { method: 'DELETE' }); await loadEvents(); toast('Event deleted.'); } catch (error) { toast(error.message); } });
const identityWithEvents = identity;
identity = function() { identityWithEvents(); loadEvents(); $('#admin-code').hidden = true; setTimeout(() => toast(`Hello ${me?.name || 'Lion'} — welcome to Lion Link!`), 120); };
setTimeout(loadEvents, 700);

const followListModal = document.createElement('div');
followListModal.className = 'edit-modal'; followListModal.id = 'follow-list-modal'; followListModal.hidden = true;
followListModal.innerHTML = '<section class="edit-card"><button class="modal-close" type="button" data-close-modal="follow-list-modal" aria-label="Close follow list">×</button><h2 id="follow-list-title"></h2><div id="follow-list-results" class="people-results"></div></section>';
document.body.append(followListModal);
async function openFollowList(list) {
  const user = viewedProfile || me;
  if (!user) return;
  try {
    const result = await api(`/users/${encodeURIComponent(user.username)}/${list}`);
    $('#follow-list-title').textContent = list === 'followers' ? 'Followers' : 'Following';
    $('#follow-list-results').innerHTML = result.users.map(personMarkup).join('') || `<p class="empty-profile">No ${list} yet.</p>`;
    followListModal.hidden = false;
  } catch (error) { toast(error.message); }
}
const renderProfileWithLists = renderProfile;
renderProfile = function(user) {
  renderProfileWithLists(user);
  const stats = document.querySelectorAll('.profile-stats span');
  if (stats[0]) { stats[0].role = 'button'; stats[0].tabIndex = 0; stats[0].onclick = () => openFollowList('following'); }
  if (stats[1]) { stats[1].role = 'button'; stats[1].tabIndex = 0; stats[1].onclick = () => openFollowList('followers'); }
};

// Mobile conversations now open instantly as a focused chat, with an in-app return button.
const baseOpenChat = openChat;
openChat = function(id) {
  baseOpenChat(id);
  $('#messages-view').classList.add('chat-open');
  const header = $('#active-chat .chat-header');
  if (header && !header.querySelector('[data-close-chat]')) header.insertAdjacentHTML('afterbegin', '<button class="icon-button" data-close-chat aria-label="Back to conversations">‹</button>');
};
document.addEventListener('click', event => { if (event.target.closest('[data-close-chat]')) { $('#messages-view').classList.remove('chat-open'); activeChat = null; } });

// Reels use a vertical, touch-friendly stream instead of one video at a time.
renderReel = function() {
  if (!reelVideos.length) return;
  $('#reels-content').innerHTML = reelVideos.map((reel, index) => `<article class="reel-slide" data-reel-index="${index}"><video controls playsinline preload="metadata" src="${reel.url}"></video><div><b>${esc(reel.post.author?.name || 'Lion Link user')}</b><p>${esc(reel.post.text || '')}</p></div></article>`).join('');
  const selected = $('#reels-content [data-reel-index="' + reelIndex + '"]');
  selected?.scrollIntoView({ block: 'nearest' });
};

const postMarkupWithReports = postMarkup;
postMarkup = function(post) {
  const reportButton = post.author?._id === me?.id || post.author?.id === me?.id ? '' : `<button class="action report-post" data-report-post="${post._id}">⚑ Report</button>`;
  return postMarkupWithReports(post).replace('</article>', `${reportButton}</article>`);
};
document.addEventListener('click', async event => {
  const id = event.target.dataset.reportPost;
  if (!id) return;
  const reason = prompt('Why are you reporting this post?');
  if (reason === null) return;
  try { await api(`/posts/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }); toast('Report sent to the Lion Link admin.'); } catch (error) { toast(error.message); }
});

const reportReview = document.createElement('section');
reportReview.className = 'admin-posts'; reportReview.id = 'report-review'; reportReview.hidden = true;
reportReview.innerHTML = '<h2>Reported posts</h2><div id="report-list"></div>';
$('#admin-view').append(reportReview);
async function loadReports() {
  if (me?.role !== 'admin') return;
  try {
    const { posts: reportedPosts } = await api('/posts/reports');
    reportReview.hidden = false;
    $('#report-list').innerHTML = reportedPosts.map(post => `<article class="admin-announcement"><div><b>${esc(post.author?.name || 'User')} · @${esc(post.author?.username || '')}</b><p>${esc(post.text || '[Media post]')}</p><small>${post.reports.length} report${post.reports.length === 1 ? '' : 's'}${post.reports[0]?.reason ? `: ${esc(post.reports[0].reason)}` : ''}</small></div><button data-remove-reported-post="${post._id}">Remove post</button></article>`).join('') || '<p class="empty-profile">No reported posts.</p>';
  } catch (error) { console.warn(error); }
}
document.addEventListener('click', async event => {
  const id = event.target.dataset.removeReportedPost;
  if (!id || !confirm('Remove this reported post?')) return;
  try { await api(`/posts/${id}`, { method: 'DELETE' }); await loadReports(); toast('Reported post removed.'); } catch (error) { toast(error.message); }
});
const identityWithReports = identity;
identity = function() { identityWithReports(); loadReports(); };
