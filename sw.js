// Snowboard Season 26/27 – offline cache
const CACHE="snow-2627-v2";
const CORE=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-512-maskable.png","./apple-touch-icon.png","./cams.json","./data/history.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);
  if(u.origin===location.origin){ // app files: network first (updates), cache when offline
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("./index.html"))));return}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){ // fonts: cache first
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res})))}
  // webcams and everything else: always live from the network
});
