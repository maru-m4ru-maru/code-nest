/* Code Nest preview/project-file fixes */
(function(){
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];

  function codeCells(){return $$('.cell[data-type="code"]')}
  function cellFiles(){
    const files=new Map();
    for(const cell of codeCells()){
      const input=cell.querySelector('.cell-name');
      const area=cell.querySelector('textarea');
      if(!input||!area)continue;
      const raw=(input.value||'').trim().replace(/^\/+/, '');
      if(!raw)continue;
      const path=normalizePath('/'+raw);
      files.set(path,{path,source:area.value,ext:fileExt(path)});
    }
    return files;
  }
  function normalizePath(path){
    const parts=[];
    for(const p of String(path).split('/')){
      if(!p||p==='.')continue;
      if(p==='..'){if(parts.length)parts.pop();continue;}
      parts.push(p);
    }
    return '/'+parts.join('/');
  }
  function fileExt(path){
    const m=String(path).toLowerCase().match(/(\.[a-z0-9]+)$/);
    return m?m[1]:'';
  }
  function currentHtml(){
    const files=cellFiles();
    for(const f of files.values())if(f.ext==='.html'||f.ext==='.htm')return f;
    return null;
  }
  function assetType(file){
    if(file.ext==='.css')return 'text/css';
    if(file.ext==='.js'||file.ext==='.mjs')return 'text/javascript';
    if(file.ext==='.json')return 'application/json';
    if(file.ext==='.html'||file.ext==='.htm')return 'text/html';
    return 'text/plain';
  }
  function directory(path){
    const i=path.lastIndexOf('/');
    return i<0?'/':(path.slice(0,i)||'/');
  }
  function resolveProjectPath(basePath,target){
    if(!target)return null;
    const t=target.trim();
    if(!t||t.startsWith('#')||/^(?:[a-z]+:|\/\/)/i.test(t)||t.startsWith('data:')||t.startsWith('blob:'))return null;
    const clean=t.split('#')[0].split('?')[0];
    if(!clean)return null;
    return normalizePath(clean.startsWith('/')?clean:directory(basePath)+'/'+clean);
  }
  function makeBlobs(files){
    const urls=new Map();
    for(const file of files.values()){
      const blob=new Blob([file.source],{type:assetType(file)});
      urls.set(file.path,URL.createObjectURL(blob));
    }
    return urls;
  }
  function rewriteHtml(html,htmlPath,urls){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const attrs=['href','src','action','poster'];
    for(const el of doc.querySelectorAll('*')){
      for(const attr of attrs){
        if(!el.hasAttribute(attr))continue;
        const raw=el.getAttribute(attr);
        const path=resolveProjectPath(htmlPath,raw);
        if(path&&urls.has(path))el.setAttribute(attr,urls.get(path));
      }
    }
    for(const link of doc.querySelectorAll('link[href]')){
      const rel=(link.getAttribute('rel')||'').toLowerCase();
      const raw=link.getAttribute('href');
      const path=resolveProjectPath(htmlPath,raw);
      if(rel.includes('stylesheet')&&path&&urls.has(path))link.setAttribute('href',urls.get(path));
    }
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  function rewriteCss(css,cssPath,urls){
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,(m,q,target)=>{
      const path=resolveProjectPath(cssPath,target);
      return path&&urls.has(path)?'url("'+urls.get(path)+'")':m;
    }).replace(/@import\s+(["'])([^"']+)\1/gi,(m,q,target)=>{
      const path=resolveProjectPath(cssPath,target);
      return path&&urls.has(path)?'@import url("'+urls.get(path)+'")':m;
    });
  }
  function injectInlineAssets(html,files){
    // Keep legacy convenience: when there is a lone CSS/JS cell without a file reference,
    // include it automatically so existing Code Nest projects continue to work.
    const css=[...files.values()].filter(f=>f.ext==='.css').map(f=>'<style data-code-nest-file="'+escapeAttr(f.path)+'">'+f.source+'</style>').join('');
    const js=[...files.values()].filter(f=>f.ext==='.js'||f.ext==='.mjs').map(f=>'<script data-code-nest-file="'+escapeAttr(f.path)+'">'+f.source.replace(/<\/(script)/gi,'<\\/$1')+'</script>').join('');
    if(css&&!/<style\b/i.test(html))html=html.replace(/<\/head>/i,css+'</head>');
    if(js&&!/<script\b[^>]*src=/i.test(html))html=html.replace(/<\/body>/i,js+'</body>');
    return html;
  }
  function escapeAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function buildPreview(){
    const files=cellFiles();
    const htmlFile=currentHtml();
    let html;
    const htmlPath=htmlFile?htmlFile.path:'/index.html';
    if(htmlFile){
      const urls=makeBlobs(files);
      // Rewrite CSS files before the CSS blob is exposed to the iframe.
      for(const file of files.values())if(file.ext==='.css'){
        const blob=new Blob([rewriteCss(file.source,file.path,urls)],{type:'text/css'});
        const old=urls.get(file.path);
        if(old)URL.revokeObjectURL(old);
        urls.set(file.path,URL.createObjectURL(blob));
      }
      html=rewriteHtml(htmlFile.source,htmlPath,urls);
      html=injectInlineAssets(html,files);
      return {html,urls,title:htmlFile.path};
    }
    html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h2>Code Nest preview</h2><p>HTMLセル（例: <code>index.html</code>）を追加すると、プロジェクトとしてプレビューできます。</p></body></html>';
    return {html,urls:new Map(),title:'project preview'};
  }

  let activeUrls=[];
  function openProjectPreview(label){
    const frame=$('#previewFrame');
    if(!frame)return;
    for(const u of activeUrls)try{URL.revokeObjectURL(u)}catch{}
    activeUrls=[];
    const built=buildPreview();
    const blob=new Blob([built.html],{type:'text/html'});
    const u=URL.createObjectURL(blob);
    activeUrls=[u,...built.urls.values()];
    frame.src=u;
    frame.dataset.previewUrl=u;
    const labelEl=$('#previewLabel');
    if(labelEl)labelEl.textContent=label||('プロジェクトプレビュー — '+built.title);
    const newTab=$('#previewNewTab');
    if(newTab)newTab.onclick=()=>window.open(u,'_blank','noopener');
    if(typeof window.openModal==='function')window.openModal('#previewModal');
  }

  function canPreviewCell(cell){
    const name=(cell?.querySelector('.cell-name')?.value||'').trim().toLowerCase();
    return /\.(html?|css|m?js)$/.test(name);
  }

  // Run = keep Python execution, but make HTML/CSS/JS run the full project preview.
  window.runCodeCell=function(cell){
    const name=(cell?.querySelector('.cell-name')?.value||'cell.py').trim().toLowerCase();
    if(/\.(html?)$/.test(name))return openProjectPreview('HTMLプロジェクトのブラウザプレビュー');
    if(/\.css$/.test(name))return openProjectPreview('CSSプロジェクトのブラウザプレビュー');
    if(/\.m?js$/.test(name))return openProjectPreview('JavaScriptプロジェクトのブラウザプレビュー');
    if(typeof window.runPythonCell==='function')return window.runPythonCell(cell);
  };

  // Preview must never fall through to Python execution.
  document.addEventListener('click',function(e){
    const btn=e.target.closest('button[data-act="preview"]');
    if(!btn)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const cell=btn.closest('.cell');
    if(!cell)return;
    if(cell.dataset.type!=='code')return typeof window.showToast==='function'&&window.showToast('Markdown / Terminalはプレビュー対象ではありません');
    if(!canPreviewCell(cell))return typeof window.showToast==='function'&&window.showToast('このファイル形式はプレビュー対象ではありません');
    openProjectPreview('ブラウザプレビュー');
  },true);

  // Fix NodeList/HTMLCollection mistakes in the current minified runtime.
  window.snapshot=function(){
    return {
      title:$('#titleInput')?.value||'',
      cells:$$('.cell').map(el=>({
        type:el.dataset.type,
        name:el.querySelector('.cell-name')?.value||'',
        source:el.querySelector('textarea')?.value||'',
        output:el.querySelector('.output')?.textContent||el.querySelector('.terminal-output')?.textContent||''
      }))
    };
  };
  window.runAll=async function(){
    const codeCells=$$('.cell[data-type="code"]');
    if(!codeCells.length){if(typeof window.showToast==='function')window.showToast('実行するコードセルがありません');return;}
    for(const cell of codeCells)await window.runCodeCell(cell);
    if(typeof window.scheduleSave==='function')window.scheduleSave();
    if(typeof window.showToast==='function')window.showToast('コードセルをすべて実行しました');
  };
})();
