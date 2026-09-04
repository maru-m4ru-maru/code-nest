// Code Nest package manager bridge for the browser Pyodide runtime.
// Supports:
//   pip install <packages>
//   python -m pip install <packages>
// The install runs against the SAME Pyodide instance used by Python cells.

const PIP_INSTALL_RE=/^(?:python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip|pip)\s+install(?:\s+--[^\s]+)*\s+(.+)$/i;

function parsePipInstall(input){
  const match=input.trim().match(PIP_INSTALL_RE);
  if(!match)return null;
  const raw=match[1].trim();
  const parts=raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)||[];
  const specs=parts
    .filter(x=>x && !x.startsWith('-'))
    .map(x=>x.replace(/^['"]|['"]$/g,''));
  return specs.length?specs:null;
}

function packageImportName(spec){
  return spec.split(/[<>=!~\[]/,1)[0].trim().replace(/-/g,'_');
}

// Capture the Pyodide instance created by app.js without creating a second runtime.
// app.js dynamically injects pyodide.js only when Python is first used.
if(!globalThis.__codeNestPipHookInstalled){
  globalThis.__codeNestPipHookInstalled=true;
  const originalAppendChild=document.head.appendChild.bind(document.head);
  document.head.appendChild=node=>{
    if(node?.src && /pyodide(?:\.min)?\.js(?:\?|$)/i.test(node.src)){
      node.addEventListener('load',()=>{
        const originalLoadPyodide=globalThis.loadPyodide;
        if(typeof originalLoadPyodide!=='function'||originalLoadPyodide.__codeNestWrapped)return;
        const wrapped=async(...args)=>{
          const instance=await originalLoadPyodide(...args);
          globalThis.__codeNestPyodide=instance;
          return instance;
        };
        wrapped.__codeNestWrapped=true;
        globalThis.loadPyodide=wrapped;
      },{once:true});
    }
    return originalAppendChild(node);
  };
}

async function getCodeNestPyodide(){
  if(globalThis.__codeNestPyodide)return globalThis.__codeNestPyodide;
  // Trigger the existing runtime loader by running a tiny Python cell through the UI.
  // We do this only when no runtime exists yet. After the first Python load, the hook above
  // stores the same Pyodide instance globally.
  const addButton=document.querySelector('#addCodeBtn');
  if(!addButton)throw new Error('Code Nest: Codeセル追加ボタンが見つかりません');
  addButton.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const cells=[...document.querySelectorAll('.cell[data-type="code"]')];
  const cell=cells[cells.length-1];
  if(!cell)throw new Error('Code Nest: Pythonセルを作成できませんでした');
  const area=cell.querySelector('textarea');
  const runButton=cell.querySelector('button[data-act="run"]');
  const output=cell.querySelector('.output');
  area.value='print("__CN_PYODIDE_BOOT__")';
  runButton.click();
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,100));
    if(globalThis.__codeNestPyodide)return globalThis.__codeNestPyodide;
    if(output && output.textContent && output.textContent!=='実行中…')break;
  }
  if(globalThis.__codeNestPyodide)return globalThis.__codeNestPyodide;
  cell.remove();
  throw new Error('Code Nest: Pyodide runtime could not be captured');
}

const SCRATCHATTACH_BROWSER_INCOMPATIBLE=['browser_cookie3'];
const SCRATCHATTACH_RUNTIME_DEPS=[
  'websocket-client',
  'requests',
  'bs4',
  'SimpleWebSocketServer',
  'typing-extensions',
  'aiohttp',
  'rich'
];

function isScratchattachSpec(spec){
  return /^scratchattach(?:[<>=!~\[]|$)/i.test(spec.trim());
}

async function installScratchattach(py,spec){
  // scratchattach declares browser_cookie3 as a dependency for desktop-browser-cookie
  // extraction. That dependency pulls native crypto packages that cannot be installed in
  // the WebAssembly browser runtime. scratchattach itself handles the missing optional
  // browser-cookie module at import time, so install the package without dependencies and
  // provide the browser-compatible runtime dependencies explicitly.
  await py.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(spec)}, deps=False)
await micropip.install(${JSON.stringify(SCRATCHATTACH_RUNTIME_DEPS)})
`);
}

async function runPipInstall(specs){
  const py=await getCodeNestPyodide();
  await py.loadPackage('micropip');
  py.setStdout?.({batched:()=>{}});

  const normalSpecs=specs.filter(spec=>!isScratchattachSpec(spec));
  const scratchSpecs=specs.filter(isScratchattachSpec);

  if(normalSpecs.length){
    const encoded=JSON.stringify(normalSpecs).replace(/</g,'\\u003c');
    const importNames=JSON.stringify(normalSpecs.map(packageImportName));
    const code=`
import micropip
await micropip.install(${encoded})
mods=${importNames}
loaded=[]
for name in mods:
    try:
        __import__(name)
        loaded.append(name)
    except Exception as exc:
        raise RuntimeError(f"Installed but import failed for {name}: {exc}") from exc
print("Successfully installed: " + ", ".join(${JSON.stringify(normalSpecs)}))
print("Import check: " + ", ".join(loaded))
`;

    let captured='';
    py.setStdout({batched:s=>{captured+=s+'\n'}});
    py.setStderr({batched:s=>{captured+=s+'\n'}});
    await py.runPythonAsync(code);
    if(captured.trim())captured=captured.trimEnd();
  }

  if(scratchSpecs.length){
    let captured='';
    py.setStdout({batched:s=>{captured+=s+'\n'}});
    py.setStderr({batched:s=>{captured+=s+'\n'}});
    for(const spec of scratchSpecs)await installScratchattach(py,spec);
    await py.runPythonAsync(`
import scratchattach
print("Successfully installed: scratchattach (browser-compatible mode)")
print("Import check: scratchattach " + getattr(scratchattach, "__version__", "loaded"))
print("Note: browser_cookie3 is intentionally skipped in Code Nest because browser cookie extraction is not available from Pyodide/WebAssembly.")
`);
    if(captured.trim())return captured.trimEnd();
    return 'Successfully installed: scratchattach (browser-compatible mode)\nImport check: scratchattach loaded\nNote: browser_cookie3 is intentionally skipped in Code Nest because browser cookie extraction is not available from Pyodide/WebAssembly.';
  }

  return `Successfully installed: ${normalSpecs.join(', ')}`;
}

function appendBashOutput(command,result,error=false){
  const output=document.querySelector('#bashOutput');
  if(!output)return;
  const line=document.createElement('div');
  line.className='bash-line'+(error?' error':'');
  const prompt=document.createElement('span');
  prompt.className='prompt';
  prompt.textContent='$ ';
  const commandEl=document.createElement('span');
  commandEl.className='command';
  commandEl.textContent=command;
  line.append(prompt,commandEl);
  const resultEl=document.createElement('div');
  resultEl.className='result';
  resultEl.textContent=String(result);
  line.appendChild(resultEl);
  output.appendChild(line);
  output.scrollTop=output.scrollHeight;
}

async function handlePipCommand(command,context,terminalCell=null){
  const specs=parsePipInstall(command);
  if(!specs)return false;

  if(context==='terminal'&&terminalCell){
    const output=terminalCell.querySelector('.terminal-output');
    if(output){
      let history=output.dataset.history||'';
      history+=(history?'\n':'')+`$ ${command}\nCollecting ${specs.join(', ')}`;
      output.dataset.history=history;
      output.textContent=history;
      output.classList.add('visible');
    }
    try{
      const result=await runPipInstall(specs);
      if(output){
        let history=output.dataset.history||'';
        history+='\n'+result;
        output.dataset.history=history;
        output.textContent=history;
      }
    }catch(error){
      if(output){
        let history=output.dataset.history||'';
        history+='\nERROR: '+String(error);
        output.dataset.history=history;
        output.textContent=history;
      }
    }
    return true;
  }

  if(context==='bash'){
    try{
      const result=await runPipInstall(specs);
      appendBashOutput(command,result,false);
    }catch(error){
      appendBashOutput(command,'ERROR: '+String(error),true);
    }
    return true;
  }
  return false;
}

// Terminal cells submit with Enter. Capture early so app.js's normal terminal runner
// does not interpret pip as an unknown command.
document.addEventListener('keydown',async event=>{
  if(event.key!=='Enter'||event.shiftKey)return;
  const terminal=event.target.closest?.('.terminal-input');
  if(!terminal)return;
  const command=terminal.value.trim();
  if(!parsePipInstall(command))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await handlePipCommand(command,'terminal',terminal.closest('.cell'));
},true);

// Standalone Bash Console submit.
document.addEventListener('submit',async event=>{
  if(event.target?.id!=='bashForm')return;
  const input=document.querySelector('#bashInput');
  const command=input?.value.trim()||'';
  if(!parsePipInstall(command))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(input)input.value='';
  await handlePipCommand(command,'bash');
},true);

globalThis.codeNestPipInstall=async spec=>runPipInstall(Array.isArray(spec)?spec:[spec]);
