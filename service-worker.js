const CACHE='beargrid-v1.2.2-virtual-pad-bank';
const DB_NAME='beargrid-pad-memory';
const STORE_NAME='pads';
const ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './assets/css/beargrid-machines.css',
  './assets/js/machine.js',
  './assets/js/pad-memory.js',
  './assets/audio/kits/basement-thunder/kit.json',
  './machines/drum-machine.html',
  './machines/kaossilator-pro.html',
  './machines/op-1.html',
  './machines/orchid.html',
  './machines/reese.html',
  './machines/looping-drum-loops.html',
  './machines/the-choppa.html',
  './machines/sampla.html',
  './machines/launcha.html',
  './machines/mono-station.html',
  './machines/mellotron.html',
  './machines/bit-crusher.html',
  './machines/fm-station.html',
  './machines/delay-station.html',
  './machines/filter-station.html',
  './machines/master-fx.html'
];

function dbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
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
  const pads=[];
  for(let index=0; index<16; index+=1){
    const item=await dbGet(`${machine}-${index}`);
    if(item&&item.arrayBuffer){
      const label=(item.name||`Local ${index+1}`).replace(/\.[a-z0-9]+$/i,'').slice(0,24);
      pads.push({ label, file:`local-pad__${machine}__${index}` });
    }
  }
  if(!pads.length) return null;
  return new Response(JSON.stringify({ name:`${machine} local pad memory`, pads }),{
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });
}

async function virtualPadFile(url){
  const match=url.pathname.match(/local-pad__(.+)__(\d+)$/);
  if(!match) return null;
  const machine=match[1];
  const index=Number(match[2]);
  const item=await dbGet(`${machine}-${index}`);
  if(!item||!item.arrayBuffer) return null;
  return new Response(item.arrayBuffer.slice(0),{
    headers:{ 'Content-Type':'audio/*', 'Cache-Control':'no-store' }
  });
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/assets/audio/kits/basement-thunder/kit.json')){
    event.respondWith(virtualKit(event).then(response=>response||fetch(event.request)).catch(()=>caches.match(event.request)));
    return;
  }
  if(url.pathname.includes('/assets/audio/kits/basement-thunder/local-pad__')){
    event.respondWith(virtualPadFile(url).then(response=>response||fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    const clone=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,clone));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
