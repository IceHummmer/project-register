// Online-first install support. Intentionally do not cache authenticated
// project data, HTML, scripts, API responses, or Microsoft sign-in content.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><html lang="en"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Project Register — Offline</title>' +
      '<body style="font:16px system-ui,sans-serif;background:#f5f7f8;color:#3a2d24;' +
      'max-width:440px;margin:16vh auto;padding:24px">' +
      '<h1>Internet connection required</h1>' +
      '<p>HH Project Register loads securely from the website. ' +
      'Reconnect and try again.</p>' +
      '<button style="padding:12px 18px;border-radius:8px;cursor:pointer" ' +
      'onclick="location.reload()">Try again</button></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    ))
  );
});
