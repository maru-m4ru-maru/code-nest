/* Code Nest preview + editor UX fixes V2 */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];

  function toast(message){
    let el=document.querySelector('#codeNestEnhanceToast');
    if(!el){
      el=document.createElement('div');
      el.id='codeNestEnhanceToast';
      el.style.cssText='position:fixed;left:50%;bottom:58px;transform:translateX(-50%) translateY(8px);opacity:0;z-index:10050;padding:9px 13px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#111827;color:#fff;font:11px/1.4 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.28);pointer-events:none;transition:.18s ease;';
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.style.opacity='1';
    el.style.transform='translateX(-50%) translateY(0)';
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(-50%) translateY(8px)'},1800);
  }

  function ensureStyles(){
    if($('#codeNestEnhanceStyles'))return;
    const style=document.createElement('style');
    style.id='codeNestEnhanceStyles';
    style.textContent=`
      .cell.cn-dragging{opacity:.48;transform:scale(.995);}
      .cell.cn-drag-over{outline:2px solid var(--accent);outline-offset:3px;}
      .cell-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;margin-right:6px;border:1px solid transparent;border-radius:7px;color:var(--muted2);cursor:grab;user-select:none;flex:none;font-size:14px;letter-spacing:-2px;}
      .cell-drag-handle:hover{background:var(--surface3);border-color:var(--border);color:var(--text);}
      .cell-drag-handle:active{cursor:grabbing;}
      .cell-file-wrap{display:flex;align-items:center;min-width:0;flex:1;margin-right:8px;}
      .cell-file-icon{width:26px;height:26px;display:grid;place-items:center;margin-right:7px;border:1px solid var(--border);border-radius:8px;background:linear-gradient(145deg,var(--surface),var(--surface2));color:var(--accent);font-size:12px;box-shadow:0 3px 10px rgba(31,44,79,.08);}
      .cell-name{width:min(230px,42vw)!important;height:30px!important;padding:0 38px 0 10px!important;border:1px solid var(--border)!important;border-radius:9px!important;background:linear-gradient(180deg,var(--surface),var(--surface2))!important;color:var(--text)!important;outline:none!important;font:600 11px/30px "JetBrains Mono",ui-monospace,monospace!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 2px 8px rgba(31,44,79,.04)!important;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease!important;}
      .cell-name:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px var(--accent2),0 6px 16px rgba(31,44,79,.08)!important;background:var(--surface)!important;}
      .cell-name::placeholder{color:var(--muted2);font-weight:500;}
      .cell-file-ext{margin-left:-34px;margin-right:6px;min-width:25px;padding:3px 5px;border-radius:6px;background:var(--accent2);color:var(--accent3);font:800 8px/1 Inter,sans-serif;letter-spacing:.05em;text-transform:uppercase;pointer-events:none;}
      .cell-editor-shell{position:relative;min-height:106px;overflow:hidden;background:var(--code);border-left:4px solid var(--codeBorder);}
      .cell-editor-highlight{position:absolute;inset:0;margin:0;padding:16px 18px;overflow:hidden;white-space:pre-wrap;word-break:break-word;pointer-events:none;color:var(--text);font:13px/1.65 "JetBrains Mono",ui-monospace,monospace;}
      .cell-editor-shell>.code-input{position:relative;z-index:1;min-height:106px!important;margin:0!important;background:transparent!important;border-left:0!important;color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:var(--text)!important;}
      .cell-editor-shell>.code-input::selection{background:rgba(109,60,255,.22);}
      .cn-tok-comment{color:#6b7280;font-style:italic}.cn-tok-string{color:#16a34a}.cn-tok-number{color:#2563eb}.cn-tok-keyword{color:#7c3aed;font-weight:600}.cn-tok-tag{color:#db2777;font-weight:700}.cn-tok-attr{color:#ea580c}.cn-tok-fn{color:#0891b2}.cn-tok-operator{color:#b45309}.cn-tok-plain{color:var(--text)}
      body.dark .cn-tok-comment{color:#7c879a}.cell-bar{cursor:default;}
      @media(max-width:700px){.cell-name{width:min(190px,46vw)!important}.cell-file-ext{display:none}.cell-file-icon{display:none}}
    `;
    document.head.appendChild(style);
  }

  function codeCells(){return $$('.cell[data-type="code"]')}
  function fileExt(path){const m=String(path).toLowerCase().match(/(\.[a-z0-9]+)$/);return m?m[1]:''}
  function normalizePath(path){
    const parts=[];
    for(const p of String(path).split('/')){
      if(!p||p==='.')continue;
      if(p==='..'){if(parts.length)parts.pop();continue;}
      parts.push(p);
    }
    return '/'+parts.join('/');
  }
  function cellFiles(){
    const files=new Map();
    for(const cell of codeCells()){
      const input=cell.querySelector('.cell-name'),area=cell.querySelector('textarea');
      if(!input||!area)continue;
      const raw=(input.value||'').trim().replace(/^\/+/, '');
      if(!raw)continue;
      const path=normalizePath('/'+raw);
      files.set(path,{path,source:area.value,ext:fileExt(path)});
    }
    return files;
  }
  function directory(path){const i=path.lastIndexOf('/');return i<0?'/':(path.slice(0,i)||'/')}
  function resolveProjectPath(basePath,target){
    if(!target)return null;
    const t=target.trim();
    if(!t||t.startsWith('#')||/^(?:[a-z]+:|\/\/)/i.test(t)||t.startsWith('data:')||t.startsWith('blob:'))return null;
    const clean=t.split('#')[0].split('?')[0];
    if(!clean)return null;
    return normalizePath(clean.startsWith('/')?clean:directory(basePath)+'/'+clean);
  }
  function assetType(file){
    if(file.ext==='.css')return 'text/css';
    if(file.ext==='.js'||file.ext==='.mjs')return 'text/javascript';
    if(file.ext==='.json')return 'application/json';
    if(file.ext==='.html'||file.ext==='.htm')return 'text/html';
    return 'text/plain';
  }
  function makeBlobs(files){
    const urls=new Map();
    for(const file of files.values())urls.set(file.path,URL.createObjectURL(new Blob([file.source],{type:assetType(file)})));
    return urls;
  }
  function rewriteCss(css,cssPath,urls){
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,(m,q,target)=>{const path=resolveProjectPath(cssPath,target);return path&&urls.has(path)?'url("'+urls.get(path)+'")':m;})
      .replace(/@import\s+(["'])([^"']+)\1/gi,(m,q,target)=>{const path=resolveProjectPath(cssPath,target);return path&&urls.has(path)?'@import url("'+urls.get(path)+'")':m;});
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function rewriteHtml(html,htmlPath,urls,files){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const el of doc.querySelectorAll('[src],[href],[poster]')){
      for(const attr of ['src','href','poster']){
        if(!el.hasAttribute(attr))continue;
        const raw=el.getAttribute(attr),path=resolveProjectPath(htmlPath,raw);
        if(path&&urls.has(path))el.setAttribute(attr,urls.get(path));
      }
    }
    for(const link of doc.querySelectorAll('link[rel~="stylesheet" i][href]')){
      const raw=link.getAttribute('href'),path=resolveProjectPath(htmlPath,raw),file=path&&files.get(path);
      if(file&&file.ext==='.css'){
        const style=doc.createElement('style');
        style.setAttribute('data-code-nest-file',file.path);
        style.textContent=rewriteCss(file.source,file.path,urls);
        link.replaceWith(style);
      }
    }
    for(const script of doc.querySelectorAll('script[src]')){
      const raw=script.getAttribute('src'),path=resolveProjectPath(htmlPath,raw),file=path&&files.get(path);
      if(file&&(file.ext==='.js'||file.ext==='.mjs')){
        const inline=doc.createElement('script');
        if(file.ext==='.mjs')inline.type='module';
        inline.setAttribute('data-code-nest-file',file.path);
        inline.textContent=file.source.replace(/<\/(script)/gi,'<\\/$1');
        script.replaceWith(inline);
      }
    }
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  function currentHtml(){for(const f of cellFiles().values())if(f.ext==='.html'||f.ext==='.htm')return f;return null}
  function injectLegacyAssets(html,files){
    const css=[...files.values()].filter(f=>f.ext==='.css');
    const js=[...files.values()].filter(f=>f.ext==='.js'||f.ext==='.mjs');
    if(css.length&&!/<style\b/i.test(html)&&!/<link\b[^>]*stylesheet/i.test(html))html=html.replace(/<\/head>/i,css.map(f=>'<style data-code-nest-file="'+esc(f.path)+'">'+f.source+'</style>').join('')+'</head>');
    if(js.length&&!/<script\b[^>]*src=/i.test(html)&&!/<script\b/i.test(html))html=html.replace(/<\/body>/i,js.map(f=>'<script'+(f.ext==='.mjs'?' type="module"':'')+' data-code-nest-file="'+esc(f.path)+'">'+f.source.replace(/<\/(script)/gi,'<\\/$1')+'</script>').join('')+'</body>');
    return html;
  }
  let activeUrls=[];
  function closePreview(){
    const modal=$('#previewModal');
    if(!modal)return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }
  function openPreviewModal(){
    const modal=$('#previewModal');
    if(!modal)return false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    return true;
  }
  function buildPreview(){
    const files=cellFiles(),htmlFile=currentHtml();
    if(!htmlFile)return {html:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h2>Code Nest preview</h2><p>HTMLセル（例: <code>index.html</code>）を追加すると、プロジェクトとしてプレビューできます。</p></body></html>',urls:new Map(),title:'project preview'};
    const urls=makeBlobs(files);
    for(const file of files.values())if(file.ext==='.css'){
      const old=urls.get(file.path);
      if(old)URL.revokeObjectURL(old);
      urls.set(file.path,URL.createObjectURL(new Blob([rewriteCss(file.source,file.path,urls)],{type:'text/css'})));
    }
    let html=rewriteHtml(htmlFile.source,htmlFile.path,urls,files);
    html=injectLegacyAssets(html,files);
    return {html,urls,title:htmlFile.path};
  }
  function openProjectPreview(label){
    const frame=$('#previewFrame');
    if(!frame)return toast('プレビュー画面が見つかりません');
    activeUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});
    activeUrls=[];
    try{
      const built=buildPreview(),u=URL.createObjectURL(new Blob([built.html],{type:'text/html'}));
      activeUrls=[u,...built.urls.values()];
      frame.src=u;
      frame.dataset.previewUrl=u;
      const labelEl=$('#previewLabel');
      if(labelEl)labelEl.textContent=label||('プロジェクトプレビュー — '+built.title);
      const newTab=$('#previewNewTab');
      if(newTab){newTab.disabled=true;newTab.textContent='サンドボックス内で実行';newTab.title='安全のためプレビューはサンドボックス内で実行されます';}
      openPreviewModal();
    }catch(e){toast('プレビューの生成に失敗しました');console.error('[Code Nest preview]',e)}
  }

  function previewable(name){return /\.(html?|css|m?js)$/i.test(name)}
  function isPython(name){return !previewable(name)}

  function iconForExt(ext){
    const map={'.html':'</>','.htm':'</>','.css':'{}','.js':'JS','.mjs':'JS','.py':'🐍','.json':'{}','.ts':'TS'};
    return map[ext]||'⌘';
  }
  function updateFilenameUI(cell){
    const input=cell.querySelector('.cell-name'),bar=cell.querySelector('.cell-bar');
    if(!input||!bar||input.dataset.cnStyled)return;
    input.dataset.cnStyled='1';
    const label=cell.querySelector('.cell-label');
    if(label&&!label.dataset.cnLabelStyled){
      label.dataset.cnLabelStyled='1';
      const wrap=document.createElement('div');
      wrap.className='cell-file-wrap';
      const icon=document.createElement('span');
      icon.className='cell-file-icon';
      const ext=document.createElement('span');
      ext.className='cell-file-ext';
      const update=()=>{
        const e=fileExt((input.value||'').trim().toLowerCase())||'.code';
        icon.textContent=iconForExt(e); ext.textContent=e.replace(/^\./,'')||'code';
      };
      icon.title='プロジェクトファイル';
      input.addEventListener('input',update);
      label.after(wrap);
      wrap.append(icon,input,ext);
      update();
    }
  }

  function highlightCode(source,lang){
    const escaped=esc(source);
    const isHtml=lang==='.html'||lang==='.htm';
    const isCss=lang==='.css';
    const isPy=lang==='.py';
    const isJs=lang==='.js'||lang==='.mjs';
    const tokenRe=isHtml
      ? /(<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>)/g
      : isCss
      ? /(\/\*[\s\S]*?\*\/|#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b|[A-Za-z-]+(?=\s*:)|[A-Za-z-]+(?=\s*\())
      : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|from|export|async|await|try|catch|throw|switch|case|break|continue|def|print|in|is|not|and|or|True|False|None)\b|\b[A-Za-z_$][\w$]*(?=\s*\())/gm;
    let out='',last=0,m;
    while((m=tokenRe.exec(source))){
      out+=esc(source.slice(last,m.index));
      const raw=m[0];
      if(isHtml){
        if(raw.startsWith('<!--'))out+='<span class="cn-tok-comment">'+esc(raw)+'</span>';
        else out+=esc(raw).replace(/(&lt;\/?)([A-Za-z][\w-]*)([^&]*?)(&gt;)/,(_,a,b,c,d)=>a+'<span class="cn-tok-tag">'+b+'</span>'+c+d).replace(/([A-Za-z_:][-\w:.]*)(=)("[^"]*"|'[^']*')/g,'<span class="cn-tok-attr">$1</span>$2<span class="cn-tok-string">$3</span>');
      }else if(/^\/\//.test(raw)||/^\/\*/.test(raw)||/^#/.test(raw)&&isPy)out+='<span class="cn-tok-comment">'+esc(raw)+'</span>';
      else if(/^['"]/.test(raw))out+='<span class="cn-tok-string">'+esc(raw)+'</span>';
      else if(/^\d/.test(raw))out+='<span class="cn-tok-number">'+esc(raw)+'</span>';
      else if(/^(const|let|var|function|return|if|else|for|while|class|new|import|from|export|async|await|try|catch|throw|switch|case|break|continue|def|print|in|is|not|and|or|True|False|None)$/.test(raw))out+='<span class="cn-tok-keyword">'+esc(raw)+'</span>';
      else if(isCss&&/^[A-Za-z-]+$/.test(raw))out+='<span class="cn-tok-attr">'+esc(raw)+'</span>';
      else out+='<span class="cn-tok-fn">'+esc(raw)+'</span>';
      last=m.index+raw.length;
    }
    out+=esc(source.slice(last));
    return out||' ';
  }
  function enhanceCodeEditor(cell){
    const area=cell.querySelector('.code-input');
    if(!area||area.dataset.cnHighlight)return;
    area.dataset.cnHighlight='1';
    const shell=document.createElement('div');shell.className='cell-editor-shell';
    const pre=document.createElement('pre');pre.className='cell-editor-highlight';
    area.parentNode.insertBefore(shell,area);shell.append(area,pre);
    const sync=()=>{
      const ext=fileExt((cell.querySelector('.cell-name')?.value||'').toLowerCase())||'.py';
      pre.innerHTML=highlightCode(area.value,ext);
      pre.scrollTop=area.scrollTop;pre.scrollLeft=area.scrollLeft;
    };
    area.addEventListener('input',sync);area.addEventListener('scroll',sync);area.addEventListener('click',sync);area.addEventListener('keyup',sync);
    cell.querySelector('.cell-name')?.addEventListener('input',sync);
    sync();
  }

  function persistOrder(){
    try{
      const current=JSON.parse(localStorage.getItem('code-nest-v02')||'{}');
      current.title=$('#titleInput')?.value||current.title||'Welcome to Code Nest';
      current.cells=codeCells().concat($$('.cell:not([data-type="code"])')).map(el=>({
        type:el.dataset.type,
        name:el.querySelector('.cell-name')?.value||'',
        source:el.querySelector('textarea')?.value||'',
        output:el.querySelector('.output')?.textContent||el.querySelector('.terminal-output')?.textContent||''
      }));
      localStorage.setItem('code-nest-v02',JSON.stringify(current));
    }catch(e){console.warn('[Code Nest] order save failed',e)}
  }
  let dragCell=null;
  function enhanceDrag(cell){
    if(cell.dataset.cnDrag)return;
    cell.dataset.cnDrag='1';cell.draggable=true;
    const bar=cell.querySelector('.cell-bar');
    if(bar){
      const handle=document.createElement('span');handle.className='cell-drag-handle';handle.textContent='⋮⋮';handle.title='ドラッグしてセルを移動';handle.setAttribute('aria-label','セルをドラッグして移動');
      const label=bar.querySelector('.cell-file-wrap')||bar.querySelector('.cell-label');
      if(label)bar.insertBefore(handle,label);
    }
    cell.addEventListener('dragstart',e=>{dragCell=cell;cell.classList.add('cn-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','code-nest-cell');});
    cell.addEventListener('dragend',()=>{cell.classList.remove('cn-dragging');$$('.cell.cn-drag-over').forEach(c=>c.classList.remove('cn-drag-over'));dragCell=null;persistOrder();});
    cell.addEventListener('dragover',e=>{if(!dragCell||dragCell===cell)return;e.preventDefault();cell.classList.add('cn-drag-over');e.dataTransfer.dropEffect='move';});
    cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('cn-drag-over');});
    cell.addEventListener('drop',e=>{e.preventDefault();cell.classList.remove('cn-drag-over');if(!dragCell||dragCell===cell)return;const rect=cell.getBoundingClientRect();const before=e.clientY<rect.top+rect.height/2;const parent=cell.parentNode;if(before)parent.insertBefore(dragCell,cell);else parent.insertBefore(dragCell,cell.nextSibling);persistOrder();toast('セルを移動しました');});
  }

  function enhanceCell(cell){updateFilenameUI(cell);enhanceCodeEditor(cell);enhanceDrag(cell)}
  function refresh(){ensureStyles();$$('.cell').forEach(enhanceCell)}

  function interceptActions(){
    document.addEventListener('click',e=>{
      const previewBtn=e.target.closest('button[data-act="preview"]');
      if(previewBtn){
        e.preventDefault();e.stopImmediatePropagation();
        const cell=previewBtn.closest('.cell');
        if(!cell)return;
        const name=(cell.querySelector('.cell-name')?.value||'').trim().toLowerCase();
        if(cell.dataset.type!=='code')return toast('Markdown / Terminalはプレビュー対象ではありません');
        if(!previewable(name))return toast('このファイル形式はプレビュー対象ではありません');
        return openProjectPreview('ブラウザプレビュー');
      }
      const runBtn=e.target.closest('button[data-act="run"]');
      if(runBtn){
        const cell=runBtn.closest('.cell');
        if(cell&&cell.dataset.type==='code'){
          const name=(cell.querySelector('.cell-name')?.value||'').trim().toLowerCase();
          if(previewable(name)){
            e.preventDefault();e.stopImmediatePropagation();
            return openProjectPreview('コードセルのブラウザプレビュー');
          }
        }
      }
    },true);
  }

  function bindPreviewModal(){
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-close="previewModal"]')||e.target.closest('#previewClose'))closePreview();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#previewModal')?.classList.contains('open'))closePreview()});
  }

  ensureStyles();
  interceptActions();
  bindPreviewModal();
  refresh();
  const observer=new MutationObserver(refresh);
  const root=$('#cells');
  if(root)observer.observe(root,{childList:true,subtree:true});
  console.log('[Code Nest] preview/editor enhancements ready');
})();
