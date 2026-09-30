const CACHE="crwt-web-v30-shell";
const SHELL=[
  "/games/crazy-rich-world-tour",
  "/crazy-rich-world-tour/PLAY-Crazy-Rich-World-Tour-Launcher.html",
  "/crazy-rich-world-tour/game.html",
  "/crazy-rich-world-tour/online-game.html",
  "/crazy-rich-world-tour/src/renderer3d.js",
  "/crazy-rich-world-tour/src/character_assets.js",
  "/crazy-rich-world-tour/src/landmark_assets.js"
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
  const isGame=url.pathname.startsWith("/crazy-rich-world-tour/")||url.pathname.startsWith("/games/crazy-rich-world-tour");
  if(!isGame) return;
  event.respondWith(
    fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(request).then(hit=>hit||caches.match("/games/crazy-rich-world-tour")))
  );
});
