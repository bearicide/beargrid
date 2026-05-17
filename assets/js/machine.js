const pads=[...document.querySelectorAll('.pad')];
let audioCtx;
function ensureAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
}
function tone(i){
  ensureAudio();
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type=i%3===0?'sawtooth':i%3===1?'square':'triangle';
  osc.frequency.value=150+(i*53);
  gain.gain.setValueAtTime(.001,audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.15,audioCtx.currentTime+.01);
  gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.2);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime+.22);
}
pads.forEach((pad,i)=>pad.addEventListener('click',()=>{
  pad.classList.add('on'); tone(i);
  try{localStorage.setItem('mattbear-beargrid-last-pad', JSON.stringify({machine:document.body.dataset.machine,pad:pad.textContent,time:new Date().toISOString()}));}catch(e){}
  setTimeout(()=>pad.classList.remove('on'),160);
}));
window.addEventListener('keydown',e=>{
  const keys=['1','2','3','4','q','w','e','r'];
  const i=keys.indexOf(e.key.toLowerCase());
  if(i>-1 && pads[i]){e.preventDefault(); pads[i].click();}
});