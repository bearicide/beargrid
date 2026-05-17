window.BearGridCore=(function(){
const BG={version:'0.2.0',bpm:96,quantize:true,barLength:16,currentStep:0,machines:{},kits:{},routes:{},midiMap:{36:0,37:1,38:2,39:3,40:4,41:5,42:6,43:7,44:8,45:9,46:10,47:11,48:12,49:13,50:14,51:15},log:[]};
function save(){try{localStorage.setItem('beargrid-core',JSON.stringify({bpm:BG.bpm,kits:BG.kits,routes:BG.routes,midiMap:BG.midiMap}))}catch(e){}}
function load(){try{Object.assign(BG,JSON.parse(localStorage.getItem('beargrid-core')||'{}'))}catch(e){}}
function beatMs(){return 60000/BG.bpm/4}
function nextTick(cb){if(!BG.quantize)return cb();const delay=beatMs()-(performance.now()%beatMs());setTimeout(cb,delay)}
function registerMachine(id,opts={}){BG.machines[id]={id,pads:opts.pads||[],type:opts.type||'generic',muted:false,solo:false,volume:1,...opts};save();return BG.machines[id]}
function trigger(id,pad=0,opts={}){const m=BG.machines[id]||registerMachine(id);if(m.muted)return;const job=()=>{BG.log.unshift({t:Date.now(),id,pad});BG.log=BG.log.slice(0,64);if(window.BearGridPads&&BearGridPads.trigger)BearGridPads.trigger(id,pad,opts.volume||m.volume||.9);if(window.AudioEngine&&!opts.sampleOnly){const p=document.querySelectorAll('.pad')[pad];if(p)p.click();}};nextTick(job)}
function setBpm(v){BG.bpm=Math.max(40,Math.min(220,Number(v)||96));save();return BG.bpm}
function mute(id,v=true){registerMachine(id).muted=v;save()}
function solo(id,v=true){registerMachine(id).solo=v;save()}
function route(from,to){BG.routes[from]=to;save()}
function exportKit(){return JSON.stringify({version:BG.version,bpm:BG.bpm,kits:BG.kits,routes:BG.routes,midiMap:BG.midiMap},null,2)}
function importKit(text){const data=JSON.parse(text);Object.assign(BG,data);save();return BG}
load();return{state:BG,registerMachine,trigger,setBpm,mute,solo,route,save,load,exportKit,importKit,nextTick,beatMs}})();