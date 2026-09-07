// Code Nest runtime loader V0.3.9
(() => {
  "use strict";

  // Keep this loader deliberately small. Studio's main app owns execution;
  // this file only loads the recovery layer and hardens the preview iframe.
  function loadScript(src, marker) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.setAttribute(marker, "true");
    document.head.appendChild(script);
  }

  loadScript("share.js?v=9", "data-code-nest-share-loader");
  loadScript("runtime-fix.js?v=9", "data-code-nest-runtime-fix");

  function hardenPreviewFrame() {
    const frame = document.getElementById("previewFrame");
    if (!frame) return;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("allow", "");
  }

  function setVersion() {
    document.querySelectorAll(".sidebar-footer span").forEach((el) => {
      if (/^V0\.3\.\d+$/i.test(el.textContent.trim())) el.textContent = "V0.3.9";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      hardenPreviewFrame();
      setVersion();
    }, { once: true });
  } else {
    hardenPreviewFrame();
    setVersion();
  }

  const observer = new MutationObserver(hardenPreviewFrame);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log("[Code Nest] V0.3.9 runtime loader ready");
})();
