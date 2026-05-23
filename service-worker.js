const CACHE='beargrid-v1.2.5-starter-sound-pack';
const DB_NAME='beargrid-pad-memory';
const STORE_NAME='pads';
const ASSETS=[
  './','./index.html','./manifest.json','./assets/css/beargrid-machines.css','./assets/js/machine.js','./assets/js/pad-memory.js','./assets/audio/kits/basement-thunder/kit.json',
  './machines/drum-machine.html','./machines/kaossilator-pro.html','./machines/op-1.html','./machines/orchid.html','./machines/reese.html','./machines/looping-drum-loops.html','./machines/the-choppa.html','./machines/sampla.html','./machines/launcha.html','./machines/mono-station.html','./machines/mellotron.html','./machines/bit-crusher.html','./machines/fm-station.html','./machines/delay-station.html','./machines/filter-station.html','./machines/master-fx.html'
];
const STARTER=[
  ['kick','Kick','drums'],['snare','Snare','drums'],['hat','Hat','drums'],['clap','Clap','drums'],
  ['perc','Perc','drums'],['bass','Bass','tone'],['vox','Vox','voice'],['fx','FX','fx']
];

function dbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function dbGet(key){
  try{
    const db=await dbOpen();
    return await new Promise(resolve=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=tx.objectStore(STORE_NAME).get(key);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>resolve(null);
    });
  }catch(error){ return null; }
}
function inferMachine(event){
  try{
    const ref=event.request.referrer ? new URL(event.request.referrer) : null;
    const file=ref ? ref.pathname.split('/').filter(Boolean).pop() : '';
    return (file||'').replace(/\.html$/,'') || 'beargrid-machine';
  }catch(error){ return 'beargrid-machine'; }
}
async function virtualKit(event){
  const machine=inferMachine(event);
  const pads=Array.from({length:16},()=>null);
  STARTER.forEach(([key,label,choke],index)=>{ pads[index]={ label, file:`generated-pad__${key}`, type:'oneshot', choke }; });
  for(let index=0; index<16; index+=1){
    const item=await dbGet(`${machine}-${index}`);
    if(item&&item.arrayBuffer){
      const label=(item.name||`Local ${index+1}`).replace(/\.[a-z0-9]+$/i,'').slice(0,24);
      pads[index]={ label, file:`local-pad__${machine}__${index}`, type:'oneshot', choke:'local' };
    }
  }
  return new Response(JSON.stringify({ name:`${machine} BearGrid starter + local pad bank`, pads }),{
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });
}
function nse(i){ const x=Math.sin(i*12.9898+78.233)*43758.5453; return ((x-Math.floor(x))*2)-1; }
function env(t,a,d){ return Math.min(1,t/a)*Math.exp(-t/d); }
function starterSamples(key){
  const sr=8000;
  const make=(seconds,fn)=>Array.from({length:Math.max(1,Math.floor(sr*seconds))},(_,i)=>fn(i,i/sr,sr));
  if(key==='kick'){
    let phase=0;
    return make(.35,(i,t)=>{ const f=140*Math.exp(-t*16)+42; phase+=2*Math.PI*f/sr; return (Math.sin(phase)*.95+nse(i)*Math.exp(-t*100)*.25)*env(t,.002,.13); });
  }
  if(key==='snare') return make(.22,(i,t)=>(nse(i)*.8*Math.exp(-t*13)+Math.sin(2*Math.PI*190*t)*.25*Math.exp(-t*18))*env(t,.001,.1));
  if(key==='hat') return make(.08,(i,t)=>nse(i*7)*.45*env(t,.001,.025));
  if(key==='clap') return make(.16,(i,t)=>{ const burst=[0,.026,.052].reduce((s,c)=>s+Math.exp(-(((t-c)/.012)**2)),0); return nse(i*3)*burst*.6*Math.exp(-t*2); });
  if(key==='perc') return make(.16,(i,t)=>{ const f=620*Math.exp(-t*8)+180; return (Math.sin(2*Math.PI*f*t)+.3*Math.sin(2*Math.PI*f*1.7*t))*.5*env(t,.001,.07); });
  if(key==='bass') return make(.45,(i,t)=>{ const f=55; const saw=2*((t*f)%1)-1; const sub=Math.sin(2*Math.PI*f*t); return (sub*.75+saw*.14)*env(t,.008,.27); });
  if(key==='vox') return make(.25,(i,t)=>{ const f=170+18*Math.sin(2*Math.PI*5*t); const vowel=Math.sin(2*Math.PI*f*t)+.45*Math.sin(2*Math.PI*f*2*t)+.22*Math.sin(2*Math.PI*f*3*t); return vowel*.38*env(t,.01,.13); });
  return make(.35,(i,t)=>{ const f=1200-850*(t/.35)+70*Math.sin(2*Math.PI*18*t); return (Math.round(Math.sin(2*Math.PI*f*t)*4)/4)*.48*env(t,.002,.16); });
}
function wavBytes(samples,sr=8000){
  const bytes=new ArrayBuffer(44+samples.length*2);
  const view=new DataView(bytes);
  const write=(offset,text)=>{ for(let i=0;i<text.length;i+=1) view.setUint8(offset+i,text.charCodeAt(i)); };
  write(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); write(8,'WAVE'); write(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sr,true); view.setUint32(28,sr*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,index)=>{ const clamped=Math.max(-1,Math.min(1,sample)); view.setInt16(44+index*2,Math.round(clamped*32767),true); });
  return bytes;
}
async function virtualPadFile(url){
  const local=url.pathname.match(/local-pad__(.+)__(\d+)$/);
  if(local){
    const machine=local[1]; const index=Number(local[2]); const item=await dbGet(`${machine}-${index}`);
    if(!item||!item.arrayBuffer) return null;
    return new Response(item.arrayBuffer.slice(0),{ headers:{ 'Content-Type':item.type||'application/octet-stream', 'Cache-Control':'no-store' } });
  }
  const generated=url.pathname.match(/generated-pad__(kick|snare|hat|clap|perc|bass|vox|fx)$/);
  if(generated){
    return new Response(wavBytes(starterSamples(generated[1])),{ headers:{ 'Content-Type':'audio/wav', 'Cache-Control':'no-store' } });
  }
  return null;
}
self.addEventListener('install',event=>{ event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',event=>{ event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/assets/audio/kits/basement-thunder/kit.json')){ event.respondWith(virtualKit(event).catch(()=>fetch(event.request))); return; }
  if(url.pathname.includes('/assets/audio/kits/basement-thunder/local-pad__')||url.pathname.includes('/assets/audio/kits/basement-thunder/generated-pad__')){
    event.respondWith(virtualPadFile(url).then(response=>response||fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{ const clone=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,clone)); return response; }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
