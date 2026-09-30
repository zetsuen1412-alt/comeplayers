(()=>{
  if(!("serviceWorker" in navigator)) return;
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("/games/crazy-rich-world-tour/sw.js",{scope:"/games/crazy-rich-world-tour"})
      .catch(error=>console.warn("[CRWT PWA] service worker",error));
  });
})();