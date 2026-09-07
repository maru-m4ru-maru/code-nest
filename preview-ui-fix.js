/* Code Nest Preview UI fallback V0.3.12 */
(() => {
  'use strict';
  const log = (...a) => console.log('[Code Nest Preview UI]', ...a);
  const $ = (s, r = document) => r.querySelector(s);

  function show() {
    const modal = $('#previewModal');
    const frame = $('#previewFrame');
    if (!modal || !frame) { log('missing nodes', { modal: !!modal, frame: !!frame }); return; }

    modal.classList.remove('open', 'preview-fix-hidden');
    modal.classList.add('open', 'preview-fix-visible');
    modal.setAttribute('aria-hidden', 'false');

    Object.assign(modal.style, {
      position: 'fixed', inset: '0', display: 'flex', visibility: 'visible',
      opacity: '1', pointerEvents: 'auto', zIndex: '99999',
      alignItems: 'center', justifyContent: 'center'
    });

    const card = modal.querySelector('.preview-card');
    if (card) Object.assign(card.style, {
      display: 'flex', visibility: 'visible', opacity: '1',
      width: 'min(1100px, 96vw)', height: 'min(760px, 92vh)',
      maxWidth: '96vw', maxHeight: '92vh'
    });

    Object.assign(frame.style, {
      display: 'block', visibility: 'visible', opacity: '1',
      width: '100%', height: '100%', minHeight: '500px', border: '0'
    });

    log('FORCED VISIBLE', {
      modalDisplay: getComputedStyle(modal).display,
      modalVisibility: getComputedStyle(modal).visibility,
      modalOpacity: getComputedStyle(modal).opacity,
      cardDisplay: card ? getComputedStyle(card).display : null,
      frameSize: `${frame.clientWidth}x${frame.clientHeight}`
    });
  }

  document.addEventListener('click', event => {
    const b = event.target?.closest?.('button[data-act="preview"]');
    if (!b) return;
    setTimeout(show, 0);
  }, true);

  log('loaded V0.3.12');
})();
