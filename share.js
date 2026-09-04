const SHARE_API = 'https://code-nest-worker.maru-0727.workers.dev';

function snapshotForShare() {
  const title = document.querySelector('#titleInput')?.value || 'Untitled Notebook';
  const cells = [...document.querySelectorAll('.cell')].map((el) => ({
    type: el.dataset.type || 'code',
    source: el.querySelector('textarea')?.value || '',
    output: el.querySelector('.output')?.textContent || el.querySelector('.terminal-output')?.textContent || ''
  }));
  return { title, cells };
}

async function shareNotebook(data = snapshotForShare()) {
  const res = await fetch(`${SHARE_API}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Share failed (${res.status})`);
  }
  const result = await res.json();
  if (!result.url) throw new Error('Worker did not return a share URL');
  return result.url;
}

async function copyText(text) {
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
}

function showShareResult(url) {
  const existing = document.querySelector('#shareResult');
  existing?.remove();

  const previewUrl = url.includes('?') ? url + '&view=preview' : url + '?view=preview';
  const codeUrl = url.includes('?') ? url + '&view=code' : url + '?view=code';

  const box = document.createElement('div');
  box.id = 'shareResult';
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(15,18,30,.45);backdrop-filter:blur(8px);padding:20px';
  box.innerHTML = `
    <div style="width:min(640px,100%);background:var(--panel,#fff);color:var(--text,#111827);border:1px solid rgba(120,120,140,.22);border-radius:22px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.22)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px">
        <div><div style="font-size:20px;font-weight:800">Share your project</div><div style="opacity:.7;margin-top:4px">コード用とプレビュー用のURLを分けて共有できます。</div></div>
        <button id="shareResultClose" style="border:0;background:transparent;font-size:26px;cursor:pointer">×</button>
      </div>

      <div style="display:grid;gap:12px">
        <label style="display:grid;gap:6px">
          <span style="font-size:12px;font-weight:700;opacity:.65">CODE</span>
          <input id="shareCodeUrl" readonly value="${codeUrl.replace(/"/g, '&quot;')}" style="box-sizing:border-box;width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(120,120,140,.3);background:rgba(127,127,127,.07);color:inherit;font:inherit">
        </label>

        <label style="display:grid;gap:6px">
          <span style="font-size:12px;font-weight:700;opacity:.65">PREVIEW</span>
          <input id="sharePreviewUrl" readonly value="${previewUrl.replace(/"/g, '&quot;')}" style="box-sizing:border-box;width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(120,120,140,.3);background:rgba(127,127,127,.07);color:inherit;font:inherit">
        </label>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
        <button id="shareCodeOpen" style="padding:11px 15px;border-radius:11px;border:1px solid rgba(120,120,140,.3);background:transparent;color:inherit;cursor:pointer">コードを開く</button>
        <button id="sharePreviewOpen" style="padding:11px 15px;border-radius:11px;border:1px solid rgba(120,120,140,.3);background:transparent;color:inherit;cursor:pointer">プレビューを開く</button>
        <button id="shareCopyAll" style="padding:11px 15px;border-radius:11px;border:0;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer">URLをコピー</button>
      </div>
    </div>`;

  document.body.appendChild(box);
  box.querySelector('#shareResultClose').onclick = () => box.remove();
  box.querySelector('#shareCodeOpen').onclick = () => window.open(codeUrl, '_blank', 'noopener,noreferrer');
  box.querySelector('#sharePreviewOpen').onclick = () => window.open(previewUrl, '_blank', 'noopener,noreferrer');
  box.querySelector('#shareCopyAll').onclick = async () => {
    try {
      await copyText(codeUrl + '\\n' + previewUrl);
      box.querySelector('#shareCopyAll').textContent = 'コピーしました ✓';
    } catch {
      box.querySelector('#shareCodeUrl').select();
      box.querySelector('#shareCopyAll').textContent = '選択しました';
    }
  };
  box.addEventListener('click', (event) => {
    if (event.target === box) box.remove();
  });
}
async function runShare() {
  const button = document.querySelector('#shareBtn');
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ 共有中…';
  try {
    const data = snapshotForShare();
    if (!data.cells.length) throw new Error('共有するセルがありません');
    const url = await shareNotebook(data);
    showShareResult(url);
    button.textContent = '✓ 共有済み';
  } catch (error) {
    console.error(error);
    alert(`共有に失敗しました\n${error.message || error}`);
    button.textContent = original;
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1800);
  }
}

function initShareUI() {
  const button = document.querySelector('#shareBtn');
  if (!button) return;
  button.addEventListener('click', runShare);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShareUI, { once: true });
} else {
  initShareUI();
}

window.CodeNestShare = { shareNotebook, snapshotForShare };
