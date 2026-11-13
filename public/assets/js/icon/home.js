/* Student Icon landing — brand mark and year.
   Deliberately tiny: no content on this page depends on JS to become
   visible, and no data is invented here. The status board is static copy
   that changes when a milestone actually ships. */

const BRAND = `<svg viewBox="0 0 10 8" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="3" width="10" height="4" fill="#5949b0"/>
  <rect x="1" y="2" width="8" height="5" fill="#5949b0"/>
  <rect x="2" y="0" width="6" height="2" fill="#c8ff3d"/>
  <rect x="4" y="1" width="2" height="1" fill="#0a0820"/>
  <rect x="2" y="4" width="2" height="1" fill="#c8ff3d"/>
  <rect x="6" y="4" width="2" height="1" fill="#38f2ff"/>
  <rect x="3" y="6" width="4" height="1" fill="#ff3f8e"/>
</svg>`;

document.querySelectorAll('.brand-slot').forEach((el) => {
  el.innerHTML = BRAND;
});

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
