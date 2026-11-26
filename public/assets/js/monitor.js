/* Client-side error reporting.

   Failures are posted to /api/errors, which writes one structured log line and
   (when a database is connected) one row in public.error_reports. Nothing here
   is allowed to break the page: every call is wrapped, capped at five reports
   per page load, and never blocks anything.

   This is a plain script so every page can include it with `defer`.
*/
(function () {
  'use strict';

  var sent = 0;
  var LIMIT = 5;

  function report(message, stack, extra) {
    if (sent >= LIMIT) return;
    sent += 1;

    var body = {
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 4000),
      url: String(location.href).slice(0, 300),
      userAgent: String(navigator.userAgent || '').slice(0, 300),
    };

    try {
      var payload = JSON.stringify(Object.assign(body, extra || {}));
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/errors', new Blob([payload], { type: 'application/json' }));
        return;
      }
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    } catch (err) {
      /* reporting must never throw */
    }
  }

  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') {
      report('Script failed to load: ' + (event.target.src || 'unknown'), '', { kind: 'resource' });
      return;
    }
    report(event.message, event.error && event.error.stack, { kind: 'error' });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    report(
      (reason && reason.message) || String(reason || 'Unhandled rejection'),
      reason && reason.stack,
      { kind: 'rejection' }
    );
  });
})();
