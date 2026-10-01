(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  const message = document.getElementById("message");
  const openApp = document.getElementById("open-app");
  window.history.replaceState(null, "", "/auth/desktop");

  if (!/^[A-Za-z0-9_-]{20,512}$/.test(code) || !/^[A-Za-z0-9_-]{32,64}$/.test(state)) {
    message.textContent = "Login belum selesai. Kembali ke aplikasi dan coba lagi.";
    return;
  }

  const deepLink = `comeplayers://auth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  openApp.href = deepLink;
  openApp.hidden = false;
  window.location.assign(deepLink);
})();
