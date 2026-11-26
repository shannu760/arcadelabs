/* AdSense units.
   Two conditions, both required:
     1. the visitor allowed ads through the consent banner (consent.js);
     2. the unit's data-ad-slot holds a real slot ID, so a page with no slot
        configured shows no empty box.
   Slot IDs come from the AdSense account: Ads > By ad unit > data-ad-slot. */

const SLOT_RE = /^\d{5,}$/;

function fill() {
  if (!window.siConsent || !window.siConsent.ads()) return;

  for (const unit of document.querySelectorAll('.si-ad ins.adsbygoogle')) {
    const box = unit.closest('.si-ad');
    const slot = (unit.dataset.adSlot || '').trim();

    if (!SLOT_RE.test(slot)) {
      box.hidden = true;
      continue;
    }
    if (unit.dataset.siFilled === '1') continue;

    unit.dataset.siFilled = '1';
    box.hidden = false;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

fill();
document.addEventListener('si:consent', fill);
