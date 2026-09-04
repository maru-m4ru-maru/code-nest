// Code Nest package manager bridge for the browser Pyodide runtime.
// Supports: pip install <packages> and python -m pip install <packages>.
// The actual installation runs inside the same Pyodide instance used by Python cells.

const PIP_PROMPT_RE=/^(?:python\s+-m\s+pip|python3\s+-m\s+pip|pip)\s+install\s+(.+)$/i;

function parsePipInstall(input){
  const match=input.trim().match(PIP_PROMPT_RE);
  if(!match)return null;
  const raw=match[1].trim();
  const parts=raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)||[];
  const specs=parts
    .filter(x=>x && !x.startsWith('-'))
    .map(x=>x.replace(/^['"]|['"]$/g,''));
  return specs.length?specs:null;
}

function formatPipCode(specs){
  const encoded=JSON.stringify(specs).replace(/</g,'\\u003c');
  return `import micropip\nawait micropip.install(${encoded})\nprint("Successfully installed: ${specs.join(', ').replace(/"/g,'\\"')}")`;
}

async function runPipInstall(specs){
  const addButton=document.querySelector('#addCodeBtn');
  if(!addButton)throw new Error('Code Nest: Codeセル追加ボタンが見つかりません');

  addButton.click();
  await new Promise(resolve=>setTimeout(resolve,0));

  const cells=[...document.querySelectorAll('.cell[data-type="code"]')];
  const cell=cells[cells.length-1];
  if(!cell)throw new Error('Code Nest: 一時Pythonセルを作成できませんでした');

  cell.dataset.pipTemp='true';
  cell.style.display='none';
  const area=cell.querySelector('textarea');
  const runButton=cell.querySelector('button[data-act="run"]');
  const output=cell.querySelector('.output');
  area.value=formatPipCode(specs);
  runButton.click();

  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,80));
    if(output && output.textContent && output.textContent!=='実行中…')break;
  }

  const result=output?.textContent||'';
  cell.remove();
  const count=document.querySelector('#cellCount');
  if(count)count.textContent=document.querySelectorAll('.cell').length;
  if(result==='実行中…')return 'ERROR: pip install timed out after 120s';
  return result||`Successfully installed: ${specs.join(', ')}`;
}

function appendTerminalOutput(cell,result,command){
  const output=cell.querySelector('.terminal-output');
  if(!output)return;
  let history=output.dataset.history||'';
  const lines=[`$ ${command}`,...String(result).split(/\r?\n/)];
  history+=(history?'\n':'')+lines.join('\n');
  output.dataset.history=history;
  output.textContent=history;
  output.classList.add('visible');
}

function appendBashOutput(command,result){
  const output=document.querySelector('#bashOutput');
  if(!output)return;
  const line=document.createElement('div');
  line.className='bash-line'+(String(result).startsWith('Traceback')||String(result).startsWith('ERROR:')?' error':'');
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

async function handlePipCommand(command,context){
  const specs=parsePipInstall(command);
  if(!specs)return false;
  if(context==='terminal'){
    const cell=document.querySelector('.terminal-input:focus')?.closest('.cell');
    if(!cell)return false;
    const output=cell.querySelector('.terminal-output');
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
        history+='\n'+String(result);
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
      appendBashOutput(command,result);
    }catch(error){
      appendBashOutput(command,'ERROR: '+String(error));
    }
    return true;
  }
  return false;
}

document.addEventListener('keydown',async event=>{
  if(event.key!=='Enter'||event.shiftKey)return;
  const terminal=event.target.closest?.('.terminal-input');
  if(terminal){
    const command=terminal.value.trim();
    if(parsePipInstall(command)){
      event.preventDefault();
      event.stopImmediatePropagation();
      await handlePipCommand(command,'terminal');
    }
  }
},true);

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
