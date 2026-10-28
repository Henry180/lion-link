// Network-first for the app itself, so fixes reach everyone on their next visit
// (cache-first kept people on an old copy of the app until the cache name changed).
// The cache is only the offline fallback. API calls are never cached.
const CACHE='lion-link-v21';
const ASSETS=['./','./index.html','./styles.css','./frontend.js','./manifest.webmanifest','./assets/lion-link-mark.png','./assets/lion-link-logo.png','./assets/icons/icon-192.png','./favicon.ico'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/api/'))return;
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
    return response;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
