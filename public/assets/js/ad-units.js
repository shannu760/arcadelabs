/* AdSense units.
   A unit only renders when its data-ad-slot holds a real slot ID, so a page
   with no slot configured shows no empty box. Slot IDs come from the AdSense
   account: Ads > By ad unit > the unit's data-ad-slot value. */

const SLOT_RE = /^\d{5,}$/;

for (const unit of document.querySelectorAll('.si-ad ins.adsbygoogle')) {
  const box = unit.closest('.si-ad');
  const slot = (unit.dataset.adSlot || '').trim();

  if (!SLOT_RE.test(slot)) {
    box.hidden = true;
    continue;
  }

  (window.adsbygoogle = window.adsbygoogle || []).push({});
}
