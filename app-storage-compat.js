/* Code Nest legacy app storage compatibility V0.5.7 */
(() => {
  'use strict';

  // The original app.js has a legacy snapshot implementation that calls
  // $('.cell').map(...). querySelector() returns one element, not a NodeList.
  // Give .cell elements a small compatibility map() method so the existing
  // editor can keep its UI while the IndexedDB layer receives the real list.
  if (!Element.prototype.__codeNestCellMapCompat) {
    Object.defineProperty(Element.prototype, '__codeNestCellMapCompat', { value: true });
    Object.defineProperty(Element.prototype, 'map', {
      configurable: true,
      value(callback, thisArg) {
        if (typeof this.matches === 'function' && this.matches('.cell')) {
          return [...document.querySelectorAll('.cell')].map(callback, thisArg);
        }
        throw new TypeError('Element.map is only available for Code Nest cells');
      }
    });
  }

  // Make the storage status explicit after the legacy app initializes.
  const mark = () => {
    const el = document.getElementById('storageState');
    if (el) el.textContent = 'IndexedDB';
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mark, { once: true });
  } else {
    mark();
  }

  console.log('[Code Nest] legacy app storage compatibility V0.5.7 ready');
})();
