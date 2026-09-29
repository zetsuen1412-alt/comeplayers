/**
 * The system browser receives a short-lived Supabase PKCE code here. This
 * response intentionally has no React layout or Supabase client: only the
 * desktop WebView holds the verifier and may exchange the code for a session.
 */
export function GET() {
  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kembali ke ComePlayers</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #070b14; color: #f8fafc; font: 16px/1.5 system-ui, sans-serif; }
    main { width: min(420px, calc(100vw - 48px)); padding: 32px; border: 1px solid #273245; border-radius: 22px; background: #101927; text-align: center; }
    h1 { font-size: 25px; margin: 0 0 12px; }
    p { color: #b7c7d9; }
    a { display: inline-block; margin-top: 16px; padding: 12px 24px; border-radius: 12px; color: #101318; background: #ffd400; font-weight: 700; text-decoration: none; }
  </style>
  <script defer src="/auth/desktop-callback.js"></script>
</head>
<body><main><h1>Kembali ke ComePlayers</h1><p id="message">Membuka aplikasi untuk menyelesaikan login...</p><a id="open-app" hidden>Buka aplikasi</a></main></body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
