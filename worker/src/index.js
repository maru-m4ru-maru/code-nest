const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
const json=(data,status=200)=>Response.json(data,{status,headers:cors});
const esc=(v)=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function sharePage(data,id){
  const cells=Array.isArray(data.cells)?data.cells:[{type:"code",source:data.code||"",output:""}];
  const body=cells.map((c,i)=>{
    const type=c.type||"code";
    const label=type==="markdown"?"Markdown":type==="terminal"?"Terminal":"Code";
    const source=esc(c.source||"");
    const output=esc(c.output||"");
    return `<article class="cell"><div class="label">${i+1} · ${esc(label)}</div><pre>${source}</pre>${output?`<div class="out"><small>Output</small><pre>${output}</pre></div>`:""}</article>`;
  }).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title||"Shared Notebook")} · Code Nest</title><style>:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#161827;background:#f5f6fb}*{box-sizing:border-box}body{margin:0}main{width:min(980px,100%);margin:auto;padding:42px 18px 72px}.head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}.brand{font-weight:800;letter-spacing:-.03em}.brandmark{display:inline-grid;place-items:center;width:34px;height:34px;margin-right:9px;border-radius:10px;background:linear-gradient(135deg,#8b3dff,#4f7cff);color:#fff}.sub{margin-top:5px;color:#73788c;font-size:13px}.actions{display:flex;gap:8px}.btn{border:1px solid #dfe2ec;background:#fff;color:#1b1d2d;border-radius:11px;padding:10px 13px;font-weight:700;cursor:pointer}.hero{padding:25px;border-radius:20px;margin-bottom:18px;border:1px solid #e3e6f0;background:linear-gradient(135deg,rgba(139,61,255,.10),rgba(79,124,255,.08))}.hero h1{margin:0;font-size:clamp(26px,5vw,42px);letter-spacing:-.04em}.meta{margin-top:7px;color:#73788c;font-size:13px}.cell{padding:17px 18px;margin:12px 0;border:1px solid #e1e4ed;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(34,38,58,.05)}.label{font-size:12px;font-weight:800;color:#7c3aed;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}.cell pre,.out pre{margin:0;white-space:pre-wrap;overflow:auto;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.out{margin-top:13px;padding-top:12px;border-top:1px dashed #dfe2eb}.out small{display:block;color:#7b8092;font-weight:800;margin-bottom:5px}.foot{text-align:center;color:#878c9f;font-size:12px;margin-top:24px}@media(prefers-color-scheme:dark){:root{color:#f2f4fb;background:#0d1017}.cell,.btn{background:#151922;color:#f2f4fb;border-color:#2a2f3c}.hero{border-color:#2a2f3c;background:linear-gradient(135deg,rgba(139,61,255,.15),rgba(79,124,255,.10))}.sub,.meta,.foot,.out small{color:#99a0b6}.head a{color:#b9b4ff}}</style></head><body><main><div class="head"><div><div class="brand"><span class="brandmark">&lt;/&gt;</span>Code Nest</div><div class="sub">Shared Notebook · ${esc(id)}</div></div><div class="actions"><button class="btn" id="copy">URLをコピー</button><button class="btn" id="open">Code Nestで開く</button></div></div><section class="hero"><h1>${esc(data.title||"Untitled Notebook")}</h1><div class="meta">共有Notebook · ${cells.length} cells</div></section>${body}<div class="foot">Shared with Code Nest · Cloudflare Workers + KV</div></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard?.writeText(location.href).then(()=>document.getElementById('copy').textContent='コピーしました ✓');document.getElementById('open').onclick=()=>location.href='https://maru-m4ru-maru.github.io/code-nest/';</script></body></html>`;
}

export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{headers:cors});
  if(url.pathname==="/")return json({ok:true,service:"Code Nest Backend",share:"/share/:id"});
  if(request.method==="POST"&&url.pathname==="/share"){
    try{
      const data=await request.json();
      const payload={title:String(data.title||"Untitled Notebook").slice(0,200),cells:Array.isArray(data.cells)?data.cells.slice(0,200).map(c=>({type:["code","markdown","terminal"].includes(c?.type)?c.type:"code",source:String(c?.source||"").slice(0,50000),output:String(c?.output||"").slice(0,50000)})):[],createdAt:Date.now()};
      if(!payload.cells.length)return json({error:"No cells"},400);
      const id=crypto.randomUUID().replaceAll("-","").slice(0,8);
      await env.CODE_NEST_SHARE.put(id,JSON.stringify(payload));
      return json({id,url:`${url.origin}/share/${id}`});
    }catch(e){return json({error:"Invalid request",detail:String(e)},400)}
  }
  if(request.method==="GET"&&url.pathname.startsWith("/share/")){
    const id=url.pathname.split("/")[2]||"";
    const value=await env.CODE_NEST_SHARE.get(id,"json");
    if(!value)return new Response("Shared notebook not found",{status:404,headers:{"Content-Type":"text/plain;charset=utf-8",...cors}});
    return new Response(sharePage(value,id),{headers:{"Content-Type":"text/html;charset=utf-8",...cors}});
  }
  return json({error:"Not Found"},404);
}};
