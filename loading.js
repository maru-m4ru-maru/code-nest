// Code Nest runtime loader V0.4.0
(() => {
  'use strict';

  // V0.4 owns Preview in one standalone module. No legacy preview recovery
  // layers are loaded here, so Python / Markdown / Terminal / API / Share stay
  // on their existing code paths.
  if (!document.querySelector('script[data-code-nest-preview-v4]')) {
    document.write('<script src="preview-v4.js?v=40" data-code-nest-preview-v4><\\/script>');
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
