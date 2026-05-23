const CACHE='beargrid-v1.2.6-kenney-pack';
const DB_NAME='beargrid-pad-memory';
const STORE_NAME='pads';
const ASSETS=[
  './','./index.html','./manifest.json','./assets/css/beargrid-machines.css','./assets/js/machine.js','./assets/js/pad-memory.js','./assets/audio/kits/basement-thunder/kit.json',
  './machines/drum-machine.html','./machines/kaossilator-pro.html','./machines/op-1.html','./machines/orchid.html','./machines/reese.html','./machines/looping-drum-loops.html','./machines/the-choppa.html','./machines/sampla.html','./machines/launcha.html','./machines/mono-station.html','./machines/mellotron.html','./machines/bit-crusher.html','./machines/fm-station.html','./machines/delay-station.html','./machines/filter-station.html','./machines/master-fx.html'
];
const STARTER=[
  ['Kick','https://raw.githubusercontent.com/ChristopherKurcz/Blik.exe/e2173e9a57f42d8d865777860df3efbf83f4294c/Assets/audio/kenney_impact-sounds/impactMining_000.ogg','drums'],
  ['Snare','https://raw.githubusercontent.com/ChristopherKurcz/Blik.exe/e2173e9a57f42d8d865777860df3efbf83f4294c/Assets/audio/kenney_impact-sounds/impactMining_004.ogg','drums'],
  ['Hat','https://raw.githubusercontent.com/JosephGaiser/pachinko/94594e7c027cfa8c27c7976af655f4a106892d74/addons/kenney%20casino%20audio/chip_lay_1.ogg','drums'],
  ['Clap','https://raw.githubusercontent.com/JosephGaiser/pachinko/94594e7c027cfa8c27c7976af655f4a106892d74/addons/kenney%20casino%20audio/chip_lay_3.ogg','drums'],
  ['Perc','https://raw.githubusercontent.com/TrueNarwhak/coocoocoocoo/9e3a8d44ce2c63b8b601c7bc1f96078e4157a839/Circular%20Arena%20Shooter/sounds/kenney_impactsounds/Audio/impactMining_002.ogg','drums'],
  ['Bass','https://raw.githubusercontent.com/JosephGaiser/pachinko/94594e7c027cfa8c27c7976af655f4a106892d74/addons/kenney%20sci-fi%20sounds/space_engine_low_002.ogg','tone'],
  ['Vox','https://raw.githubusercontent.com/hatanuk/SYMBOL/6fe8705aeb05b98ac8be833f50ce15e8535f29b8/addons/kenney%20casino%20audio/chips_stack_2.ogg','voice'],
  ['FX','https://raw.githubusercontent.com/ChristopherKurcz/Blik.exe/e2173e9a57f42d8d865777860df3efbf83f4294c/Assets/audio/kenney_digital-audio/laser3.ogg','fx']
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
  STARTER.forEach(([label,file,choke],index)=>{ pads[index]={ label, file, type:'oneshot', choke }; });
  for(let index=0; index<16; index+=1){
    const item=await dbGet(`${machine}-${index}`);
    if(item&&item.arrayBuffer){
      const label=(item.name||`Local ${index+1}`).replace(/\.[a-z0-9]+$/i,'').slice(0,24);
      pads[index]={ label, file:`local-pad__${machine}__${index}`, type:'oneshot', choke:'local' };
    }
  }
  return new Response(JSON.stringify({ name:`${machine} Kenney starter + local pad bank`, pads }),{
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });
}
async function virtualPadFile(url){
  const local=url.pathname.match(/local-pad__(.+)__(\d+)$/);
  if(!local) return null;
  const machine=local[1];
  const index=Number(local[2]);
  const item=await dbGet(`${machine}-${index}`);
  if(!item||!item.arrayBuffer) return null;
  return new Response(item.arrayBuffer.slice(0),{ headers:{ 'Content-Type':item.type||'application/octet-stream', 'Cache-Control':'no-store' } });
}
self.addEventListener('install',event=>{ event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',event=>{ event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/assets/audio/kits/basement-thunder/kit.json')){ event.respondWith(virtualKit(event).catch(()=>fetch(event.request))); return; }
  if(url.pathname.includes('/assets/audio/kits/basement-thunder/local-pad__')){
    event.respondWith(virtualPadFile(url).then(response=>response||fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{ const clone=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,clone)); return response; }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
