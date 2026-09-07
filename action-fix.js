/* Code Nest action bridge V1 */
(function(){
  'use strict';

  function toast(message){
    if(typeof globalThis.showToast==='function') return globalThis.showToast(message);
    let el=document.getElementById('codeNestActionToast');
    if(!el){
      el=document.createElement('div');
      el.id='codeNestActionToast';
      el.style.cssText='position:fixed;left:50%;bottom:58px;transform:translateX(-50%);z-index:10060;padding:9px 13px;border-radius:10px;background:#111827;color:#fff;font:11px/1.4 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .18s ease;';
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.style.opacity='1';
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>el.style.opacity='0',1800);
  }

  function isPreviewable(name){
    return /\.(?:html?|css|m?js)$/i.test(String(name||'').trim());
  }

  function getName(cell){
    return (cell?.querySelector('.cell-name')?.value||'').trim();
  }

  function runCell(cell){
    if(!cell)return;
    const type=cell.dataset.type;
    if(type==='code' && typeof globalThis.runCodeCell==='function'){
      return globalThis.runCodeCell(cell);
    }
    if(type==='markdown' && typeof globalThis.renderMarkdown==='function'){
      return globalThis.renderMarkdown(cell);
    }
    if(type==='terminal' && typeof globalThis.runTerminal==='function'){
      return globalThis.runTerminal(cell);
    }
    toast('セルを実行する処理を読み込めませんでした');
  }

  document.addEventListener('click',function(event){
    const button=event.target.closest?.('button[data-act]');
    if(!button)return;
    const action=button.dataset.act;
    if(action!=='run' && action!=='preview')return;

    const cell=button.closest('.cell');
    if(!cell)return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if(action==='preview'){
      if(cell.dataset.type!=='code'){
        toast('Markdown / Terminalはプレビュー対象ではありません');
        return;
      }
      const name=getName(cell);
      if(!isPreviewable(name)){
        toast('このファイル形式はプレビュー対象ではありません');
        return;
      }
      if(typeof globalThis.runCodeCell==='function'){
        globalThis.runCodeCell(cell);
      }else{
        toast('プレビュー処理を読み込めませんでした');
      }
      return;
    }

    runCell(cell);
  },true);

  console.log('[Code Nest] action bridge ready');
})();
