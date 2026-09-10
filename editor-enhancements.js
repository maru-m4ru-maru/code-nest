(() => {
  const copyText = async text => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  const addCopyButton = cell => {
    if (!cell || cell.dataset.copyButtonReady === '1') return;
    if (cell.dataset.type !== 'code') return;
    const actions = cell.querySelector('.cell-actions');
    if (!actions) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn copy-code-btn';
    button.dataset.copyCode = '1';
    button.title = 'コードをコピー';
    button.setAttribute('aria-label', 'コードをコピー');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path></svg><span>コピー</span>';
    actions.insertBefore(button, actions.querySelector('.delete-icon') || null);
    cell.dataset.copyButtonReady = '1';
  };

  const wireCells = () => {
    document.querySelectorAll('.cell[data-type="code"]').forEach(addCopyButton);
  };

  const observer = new MutationObserver(wireCells);
  const start = () => {
    wireCells();
    const cells = document.querySelector('#cells');
    if (cells) observer.observe(cells, { childList: true });
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-copy-code="1"]');
    if (!button) return;
    const cell = button.closest('.cell[data-type="code"]');
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();

    const source = cell.querySelector('textarea')?.value || '';
    try {
      await copyText(source);
      button.classList.add('is-copied');
      button.querySelector('span').textContent = 'コピー済み ✓';
      clearTimeout(button._copyTimer);
      button._copyTimer = setTimeout(() => {
        button.classList.remove('is-copied');
        button.querySelector('span').textContent = 'コピー';
      }, 1400);
    } catch (error) {
      button.querySelector('span').textContent = '失敗';
      clearTimeout(button._copyTimer);
      button._copyTimer = setTimeout(() => {
        button.querySelector('span').textContent = 'コピー';
      }, 1400);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
