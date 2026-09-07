/* Code Nest preview hotfix V0.3.13 */
(() => {
  'use strict';

  const log = (...args) => console.log('[Code Nest Preview Hotfix]', ...args);

  function syncModal() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;

    const visible = modal.classList.contains('preview-fix-visible');
    if (visible) {
      // The base .modal rule hides the dialog; .open is the existing
      // visibility switch used by Code Nest's modal system.
      modal.classList.add('open');
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('visibility', 'visible', 'important');
      modal.style.setProperty('opacity', '1', 'important');
      modal.style.setProperty('pointer-events', 'auto', 'important');
      modal.style.setProperty('z-index', '50000', 'important');
      log('FORCE OPEN', {
        className: modal.className,
        display: getComputedStyle(modal).display,
        visibility: getComputedStyle(modal).visibility,
        opacity: getComputedStyle(modal).opacity,
        pointerEvents: getComputedStyle(modal).pointerEvents
      });
    } else {
      modal.classList.remove('open');
    }
  }

  new MutationObserver(syncModal).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden'],
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', syncModal, { once: true });
  syncModal();
  log('hotfix ready V0.3.13');
})();
