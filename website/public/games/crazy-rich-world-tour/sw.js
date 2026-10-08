const CACHE="crwt-web-v30-gameplay-continuity-20261004";
const SHELL=[
  "/games/crazy-rich-world-tour",
  "/games/crazy-rich-world-tour/client/PLAY-Crazy-Rich-World-Tour-Launcher.html",
  "/games/crazy-rich-world-tour/client/game.html",
  "/games/crazy-rich-world-tour/client/online-game.html",
  "/games/crazy-rich-world-tour/client/src/renderer3d.js",
  "/games/crazy-rich-world-tour/client/src/character_assets.js",
  "/games/crazy-rich-world-tour/client/src/landmark_assets.js"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>undefined));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("crwt-web-")&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET") return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(!url.pathname.startsWith("/games/crazy-rich-world-tour")) return;
  event.respondWith(
    fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(request).then(hit=>hit||caches.match("/games/crazy-rich-world-tour")))
  );
});
