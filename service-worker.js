const CACHE='beargrid-v1.2.0-pad-memory';
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
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request).then(response=>{
    const clone=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,clone));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
