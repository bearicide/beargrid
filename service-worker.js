const CACHE='beargrid-v1.1.0-machine-modules';
const ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './assets/css/beargrid-machines.css',
  './assets/js/machine.js',
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
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const clone=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,clone));
    return response;
  }).catch(()=>caches.match('./index.html'))));
});