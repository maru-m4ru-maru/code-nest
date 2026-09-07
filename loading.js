// Code Nest runtime loader V0.4.0
(() => {
  'use strict';

  // V0.4 Preview is owned by one standalone module. Keep the existing
  // Share module loaded separately so Preview changes do not affect sharing.
  if (!document.querySelector('script[data-code-nest-preview-v4]')) {
    document.write('<script src="preview-v4.js?v=40" data-code-nest-preview-v4><\\/script>');
  }
  if (!document.querySelector('script[data-code-nest-share]')) {
    document.write('<script src="share.js?v=40" data-code-nest-share><\\/script>');
  }

  function setVersion() {
    document.querySelectorAll('.sidebar-footer span').forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim()) || /^V0\.4\.\d+$/i.test(el.textContent.trim())) {
        el.textContent = 'V0.4.0';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', setVersion, { once: true });
  if (document.readyState !== 'loading') setVersion();

  console.log('[Code Nest] runtime loader V0.4.0 ready');
})();
