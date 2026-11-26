/* Consent, and the only place AdSense is loaded from.

   AdSense sets advertising cookies, so it is not loaded until the visitor says
   yes. Saying no keeps every page working; the ad units simply stay hidden.
   The choice is stored in localStorage and can be changed from the privacy
   page ("Cookie settings") or by visiting any page with ?consent=reset.

   This is a plain script on purpose: every page can include it without a module
   graph, and it runs before the ad code.
*/
(function () {
  'use strict';

  var KEY = 'si.consent.v1';
  var CLIENT = 'ca-pub-4494199135836412';
  var state = { ads: false, decided: false };

  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      state.ads = saved && saved.ads === true;
      state.decided = true;
    }
  } catch (err) {
    state.decided = false;
  }

  window.siConsent = {
    ads: function () {
      return state.ads;
    },
    reset: function () {
      try {
        localStorage.removeItem(KEY);
      } catch (err) {
        /* ignore */
      }
      state.ads = false;
      state.decided = false;
      show();
    },
  };

  function record(ads) {
    state.ads = ads;
    state.decided = true;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ads: ads, at: new Date().toISOString() }));
    } catch (err) {
      /* the choice still applies to this page */
    }
    document.dispatchEvent(new CustomEvent('si:consent', { detail: { ads: ads } }));
    if (ads) loadAds();
  }

  function loadAds() {
    if (document.querySelector('script[data-si-adsense]')) return;
    var script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.siAdsense = '1';
    script.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    document.head.appendChild(script);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      node.setAttribute(name, attrs[name]);
    });
    if (text) node.textContent = text;
    return node;
  }

  function show() {
    if (document.getElementById('si-consent')) return;

    var box = el('div', { id: 'si-consent', role: 'dialog', 'aria-label': 'Cookie choice' });
    box.style.cssText = [
      'position:fixed',
      'left:12px',
      'right:12px',
      'bottom:12px',
      'z-index:9999',
      'max-width:760px',
      'margin:0 auto',
      'padding:16px 18px',
      'border:2px solid #c8ff3d',
      'background:#0b0824',
      'color:#e8e6ff',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
      'font-size:13px',
      'line-height:1.5',
      'box-shadow:0 0 0 4px rgba(6,5,15,.9)',
    ].join(';');

    var text = el('p', { style: 'margin:0 0 12px' });
    text.textContent =
      'Student Icon can show ads through Google AdSense, which sets advertising cookies. ' +
      'Nothing is loaded until you choose. Pages and games work either way. ';

    var policy = el('a', { href: '/privacy.html', style: 'color:#38f2ff' }, 'Privacy policy');
    text.appendChild(policy);
    text.appendChild(document.createTextNode('.'));

    var row = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });

    var yes = el('button', { type: 'button', style: buttonStyle('#c8ff3d', '#06050f') }, 'Allow ads');
    yes.addEventListener('click', function () {
      record(true);
      box.remove();
    });

    var no = el('button', { type: 'button', style: buttonStyle('transparent', '#e8e6ff') }, 'Continue without ads');
    no.addEventListener('click', function () {
      record(false);
      box.remove();
    });

    row.appendChild(yes);
    row.appendChild(no);
    box.appendChild(text);
    box.appendChild(row);
    document.body.appendChild(box);
  }

  function buttonStyle(background, color) {
    return [
      'background:' + background,
      'color:' + color,
      'border:2px solid #c8ff3d',
      'padding:8px 12px',
      'font:inherit',
      'font-weight:700',
      'cursor:pointer',
    ].join(';');
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('consent') === 'reset') {
      try {
        localStorage.removeItem(KEY);
      } catch (err) {
        /* ignore */
      }
      state.decided = false;
      state.ads = false;
      params.delete('consent');
      var qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    if (state.decided) {
      if (state.ads) loadAds();
      return;
    }
    show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
