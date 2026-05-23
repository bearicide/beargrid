(() => {
  'use strict';

  const machine = document.body.dataset.machine || 'beargrid-machine';
  const pads = Array.from(document.querySelectorAll('.pad'));
  const panel = document.querySelector('.panel');
  if (!panel || !pads.length || !window.indexedDB) return;

  const personalities = {
    'drum-machine': { family:'beat box', role:'pocket groovebox', voice:'sample drum kit', motion:'16-step pattern', gesture:'tap + sequence', accent:'#ff9d00', behavior:'sample', wave:'noise', length:.18, labels:['KICK','SNARE','HI-HAT','CLAP','PERC','BASS','VOX','FX'] },
    'kaossilator-pro': { family:'touch synth', role:'finger paint melody', voice:'glide lead', motion:'XY sweep', gesture:'drag + latch', accent:'#00eaff', behavior:'tone', wave:'sine', length:.42, labels:['BASS X','LEAD Y','GATE','SWEEP','HOLD','SCALE','FX SEND','LATCH'] },
    'op-1': { family:'tape toy', role:'sketch recorder', voice:'wobbly square tape', motion:'short phrases', gesture:'press + sketch', accent:'#ffe600', behavior:'tone', wave:'square', length:.36, labels:['TAPE A','TAPE B','SYNTH','DRUM','LIFT','DROP','PUNCH','ALBUM'] },
    orchid: { family:'chord garden', role:'harmony pad', voice:'soft triads', motion:'slow bloom', gesture:'hold chords', accent:'#ff7adf', behavior:'chord', wave:'triangle', length:.82, labels:['I','ii','iii','IV','V','vi','vii°','BLOOM'] },
    reese: { family:'bass weapon', role:'sub pressure', voice:'detuned reese', motion:'low growl', gesture:'one bass at a time', accent:'#39ff14', behavior:'bass', wave:'sawtooth', length:.52, labels:['SUB','REESE','GROWL','WOBBLE','CUT','DRIVE','OCTAVE','GLIDE'] },
    'looping-drum-loops': { family:'loop lane', role:'bar builder', voice:'pulse loops', motion:'bar repeats', gesture:'toggle layers', accent:'#3a86ff', behavior:'loop', wave:'sawtooth', length:1.15, labels:['LOOP 1','LOOP 2','LOOP 3','LOOP 4','FILL','BREAK','RIDE','DROP'] },
    'the-choppa': { family:'slice goblin', role:'stutter cutter', voice:'gated squares', motion:'repeat chops', gesture:'slice + scatter', accent:'#ff3131', behavior:'chop', wave:'square', length:.18, labels:['SLICE 1','SLICE 2','SLICE 3','SLICE 4','STUTTER','REVERSE','GATE','SCATTER'] },
    sampla: { family:'sample bay', role:'local file pads', voice:'loaded audio', motion:'one-shots', gesture:'load + assign', accent:'#00eaff', behavior:'sample', wave:'sample', length:.3, labels:['ONE','SHOT','VOX','HIT','TEXTURE','RISE','DROP','RESAMPLE'] },
    launcha: { family:'clip launcher', role:'scene buttons', voice:'clip pulses', motion:'quantized clips', gesture:'arm scenes', accent:'#8b31ff', behavior:'loop', wave:'triangle', length:1.35, labels:['CLIP A','CLIP B','CLIP C','CLIP D','SCENE','STOP','MUTE','ARM'] },
    'mono-station': { family:'mono synth', role:'acid line', voice:'single oscillator bass', motion:'accent steps', gesture:'note + filter', accent:'#ff9d00', behavior:'bass', wave:'square', length:.48, labels:['OSC 1','OSC 2','FILTER','ENV','LFO','DRIVE','SEQ','ACCENT'] },
    mellotron: { family:'tape choir', role:'dusty keys', voice:'warbled chords', motion:'slow tape swell', gesture:'press chords', accent:'#f1e6c8', behavior:'chord', wave:'sine', length:1.05, labels:['CHOIR','FLUTE','STRINGS','CELLO','WARBLE','WOW','FLUTTER','DUST'] },
    'bit-crusher': { family:'bit damage', role:'pixel dirt', voice:'stepped alias tone', motion:'crush bursts', gesture:'break signal', accent:'#9cff00', behavior:'fx', wave:'square', length:.24, labels:['8 BIT','4 BIT','FOLD','RATE','NOISE','DOWN','ALIAS','CRUSH'] },
    'fm-station': { family:'FM lab', role:'metal bells', voice:'modulated carrier', motion:'ratio spikes', gesture:'index control', accent:'#00eaff', behavior:'fm', wave:'sine', length:.56, labels:['CARRIER','MOD','RATIO','BELL','METAL','STACK','INDEX','FEEDBACK'] },
    'delay-station': { family:'echo box', role:'dub throws', voice:'delay pings', motion:'feedback tails', gesture:'throw + freeze', accent:'#5865ff', behavior:'fx', wave:'triangle', length:.64, labels:['DELAY 1','DELAY 2','PING','PONG','DUB','FREEZE','FEEDBACK','THROW'] },
    'filter-station': { family:'filter knife', role:'sweep station', voice:'resonant sweeps', motion:'open close', gesture:'cut the bus', accent:'#ff2bd6', behavior:'fx', wave:'sawtooth', length:.42, labels:['LOW','HIGH','BAND','NOTCH','SWEEP','RES','OPEN','CLOSE'] },
    'master-fx': { family:'final bus', role:'performance panel', voice:'bus punches', motion:'macro moves', gesture:'destroy + recover', accent:'#ffffff', behavior:'fx', wave:'square', length:.28, labels:['PUNCH','WIDE','PUMP','GATE','CRUSH','DELAY','FILTER','KILL'] }
  };

  const persona = personalities[machine] || personalities.sampla;
  const dbName = 'beargrid-pad-memory';
  const storeName = 'pads';
  const sessionKey = `mattbear-beargrid-session-${machine}`;
  const buffers = new Map();
  const activeSources = new Map();
  let ctx;
  let master;
  let sharedStatus;

  function readSession() {
    try { return JSON.parse(localStorage.getItem(sessionKey) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = Number(readSession().volume ?? 0.78);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    const volume = Number(readSession().volume ?? 0.78);
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  }

  function beatSeconds() {
    const bpm = Number(readSession().bpm || document.querySelector('[data-readout="bpm"]')?.textContent || 120);
    return 60 / Math.max(30, Math.min(260, bpm));
  }

  function quantizeSeconds() {
    const q = readSession().quantize || document.querySelector('[data-readout="quantize"]')?.textContent || '1/4';
    const beat = beatSeconds();
    if (q === '1/16') return beat / 4;
    if (q === '1/8') return beat / 2;
    return beat;
  }

  function nextGridTime() {
    audio();
    const grid = quantizeSeconds();
    const now = ctx.currentTime;
    return Math.ceil((now + 0.015) / grid) * grid;
  }

  function key(index) {
    return `${machine}-${index}`;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function save(index, arrayBuffer, name, type = '') {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ arrayBuffer, name, type, time: Date.now() }, key(index));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function load(index) {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key(index));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function remove(index) {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key(index));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  function injectEasyStyles() {
    if (document.querySelector('[data-beargrid-easy-style]')) return;
    const style = document.createElement('style');
    style.dataset.beargridEasyStyle = 'true';
    style.textContent = `
      body{--personality:${persona.accent};}
      .personality-card{display:grid;gap:12px;margin:16px 0;padding:16px;border:2px solid var(--personality);border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--personality) 14%,transparent),rgba(0,0,0,.32));box-shadow:0 0 22px color-mix(in srgb,var(--personality) 32%,transparent)}
      .personality-card strong{font-size:clamp(1.25rem,3vw,2rem);text-transform:uppercase;letter-spacing:.08em;text-shadow:0 0 12px var(--personality)}
      .personality-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0;padding:0;list-style:none}
      .personality-grid li{padding:11px;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(0,0,0,.45);color:#fff;font-weight:900;line-height:1.3}
      .personality-grid b{display:block;margin-bottom:4px;color:var(--personality);font-size:.74rem;letter-spacing:.12em;text-transform:uppercase}
      .easy-play-card{display:grid;gap:14px;margin:20px 0;padding:18px;border:2px solid var(--accent);border-radius:24px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 15%,transparent),rgba(0,0,0,.22));box-shadow:0 0 24px color-mix(in srgb,var(--accent) 18%,transparent)}
      .easy-play-card strong{font-size:clamp(1.3rem,3vw,2rem);text-transform:uppercase;letter-spacing:.06em;color:var(--ink)}
      .easy-play-card p{margin:0;max-width:none;color:var(--soft);font-size:1.08rem;line-height:1.5}
      .easy-play-list{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0;padding:0;list-style:none}
      .easy-play-list li{padding:13px;border:1px solid var(--line);border-radius:16px;background:rgba(0,0,0,.24);color:var(--soft);font-weight:900;line-height:1.35}
      .easy-play-list b{display:block;margin-bottom:4px;color:var(--green);font-size:.78rem;letter-spacing:.1em;text-transform:uppercase}
      .easy-play-note{padding:12px 14px;border-radius:16px;background:rgba(156,255,0,.09);border:1px solid color-mix(in srgb,var(--green) 55%,var(--line));color:var(--soft);font-weight:900}
      .pad-memory .machine-hint{font-size:1.08rem;color:var(--soft)}
      body[data-personality-family] .kicker,body[data-personality-family] .transport-btn.on{border-color:var(--personality)!important;box-shadow:0 0 22px color-mix(in srgb,var(--personality) 42%,transparent)!important}
      body[data-personality-family] .signal-scope,body[data-personality-family] .tile-preview{border-color:var(--personality)!important}
      body[data-personality-family] .pad.on,body[data-personality-family] .pad:active{box-shadow:0 0 30px currentColor,0 0 42px color-mix(in srgb,var(--personality) 52%,transparent),inset 0 0 22px rgba(255,255,255,.12)!important}
      body[data-personality-behavior="bass"] .pad{border-radius:28px 10px 28px 10px;}
      body[data-personality-behavior="chord"] .pad{border-radius:28px;min-height:104px;}
      body[data-personality-behavior="fx"] .pad{border-radius:8px 24px 8px 24px;}
      body[data-personality-behavior="loop"] .pad{border-radius:14px;}
      body[data-personality-behavior="chop"] .pad{border-radius:8px;}
      body[data-personality-behavior="tone"] .pad{border-radius:999px;}
      @media(max-width:900px){.easy-play-list,.personality-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:560px){.easy-play-list,.personality-grid{grid-template-columns:1fr}.easy-play-card,.personality-card{padding:15px}.easy-play-list li,.personality-grid li{font-size:1rem}}
    `;
    document.head.appendChild(style);
  }

  function applyPersonality() {
    document.body.dataset.personalityFamily = persona.family;
    document.body.dataset.personalityBehavior = persona.behavior;
    document.documentElement.style.setProperty('--accent', persona.accent);
    document.documentElement.style.setProperty('--personality', persona.accent);
    persona.labels.forEach((label, index) => {
      if (pads[index]) pads[index].textContent = label;
    });
  }

  function keepLabelsFresh() {
    applyPersonality();
    [250, 700, 1400, 2600].forEach((delay) => setTimeout(applyPersonality, delay));
  }

  function makeUi() {
    injectEasyStyles();
    applyPersonality();
    const box = document.createElement('section');
    box.className = 'machine-module pad-memory';
    box.innerHTML = `<div class="module-head"><strong>Machine DNA</strong><span>${persona.family}</span></div>
      <div class="personality-card"><strong>${persona.role}</strong><ul class="personality-grid"><li><b>Voice</b>${persona.voice}</li><li><b>Motion</b>${persona.motion}</li><li><b>Gesture</b>${persona.gesture}</li><li><b>Color</b>${persona.accent}</li><li><b>Pad logic</b>${persona.behavior === 'sample' ? 'real sample bank' : 'machine synth layer'}</li><li><b>Feel</b>${machine.replace(/-/g,' ')}</li></ul></div>
      <div class="module-head"><strong>Start here</strong><span>PICK UP + PLAY</span></div>
      <div class="easy-play-card"><strong>Quick play</strong><p>This machine now has its own behavior layer. Some machines use the starter audio bank. Synth, bass, chord, FX, loop, launch, and chop machines use their own pad voices so they stop feeling identical.</p><ol class="easy-play-list"><li><b>1 · Tap pads</b>Use the big buttons first. They are the instrument.</li><li><b>2 · Press PLAY</b>Starts the shared clock so loops and sequencers lock in.</li><li><b>3 · Load sound</b>Pick a pad below, choose an audio file, then tap it.</li><li><b>4 · Stop fast</b>Press ESC to stop active sound fast.</li></ol><div class="easy-play-note">This page: ${persona.role}. Voice: ${persona.voice}. Motion: ${persona.motion}.</div></div>
      <div class="module-head"><strong>Pad memory</strong><span>YOUR LOCAL SOUNDS</span></div>
      <div class="pad-memory-box"><strong>Load your own sound</strong><span>Choose a pad, choose an audio file, and BearGrid saves it inside this browser. It queues to the beat grid and survives reloads.</span></div>
      <ol class="pad-memory-steps"><li><b>1 · Pick pad</b>Select the pad slot you want to replace.</li><li><b>2 · Choose file</b>Use WAV, MP3, M4A, WEBM, or another browser-supported audio file.</li><li><b>3 · Play locked</b>QUEUE / PLAY waits for the quantize grid.</li><li><b>4 · Reload</b>Reload once after new imports for full engine-bank mode.</li></ol>
      <div class="pad-memory-row"><select aria-label="Pad memory target pad" data-pad-memory-target>${pads.map((pad, i) => `<option value="${i}">${i + 1} · ${persona.labels[i] || pad.textContent.trim()}</option>`).join('')}</select><input aria-label="Choose local audio file" data-pad-memory-file type="file" accept="audio/*"></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-pad-memory="play">QUEUE / PLAY</button><button class="transport-btn" type="button" data-pad-memory="clear">CLEAR PAD</button></div>
      <p class="machine-hint" aria-live="polite" data-pad-memory-status>Ready. ${persona.role}: ${persona.gesture}.</p>`;
    const status = panel.querySelector('.status');
    if (status) status.before(box); else panel.appendChild(box);
    sharedStatus = box.querySelector('[data-pad-memory-status]');
    keepLabelsFresh();
    return box;
  }

  function status(text) {
    if (sharedStatus) sharedStatus.textContent = text;
    document.querySelectorAll('[data-pad-memory-status]').forEach((el) => { el.textContent = text; });
  }

  function stopSource(id) {
    const item = activeSources.get(id);
    if (!item) return;
    try {
      item.gain.gain.cancelScheduledValues(ctx.currentTime);
      item.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
      setTimeout(() => { try { item.source.stop(); } catch (error) {} }, 70);
    } catch (error) {}
    activeSources.delete(id);
  }

  function stopPersonalityVoices(exceptId = null) {
    for (const id of Array.from(activeSources.keys())) {
      if (id !== exceptId) stopSource(id);
    }
  }

  function flash(index, when) {
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    setTimeout(() => {
      pads[index]?.classList.add('on');
      pads[index]?.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        pads[index]?.classList.remove('on');
        pads[index]?.setAttribute('aria-pressed', 'false');
      }, 160);
    }, delay);
  }

  function noiseBuffer(duration = .18) {
    audio();
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function connectAndShape(source, gain, when, length, peak = .65) {
    gain.gain.cancelScheduledValues(when);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, when + length);
    source.connect(gain).connect(master);
  }

  function playPersonality(index, immediate = false) {
    if (persona.behavior === 'sample') return false;
    audio();
    const when = immediate ? ctx.currentTime + .006 : nextGridTime();
    const id = `personality-${index}`;
    const session = readSession();
    if (session.choke !== false) stopPersonalityVoices(id);
    const gain = ctx.createGain();
    const base = (persona.behavior === 'bass' ? 42 : persona.behavior === 'fm' ? 165 : persona.behavior === 'chord' ? 138 : persona.behavior === 'fx' ? 260 : 120) * Math.pow(2, index / 12);
    let length = persona.length || .32;
    let stoppers = [];

    if (persona.behavior === 'chord') {
      [1, 1.25, 1.5].forEach((ratio, offset) => {
        const osc = ctx.createOscillator();
        osc.type = persona.wave || 'triangle';
        osc.frequency.setValueAtTime(base * ratio, when);
        osc.detune.setValueAtTime((offset - 1) * 5, when);
        connectAndShape(osc, gain, when, length, .22);
        osc.start(when); osc.stop(when + length + .04);
        stoppers.push(() => osc.stop());
      });
    } else if (persona.behavior === 'fm') {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.type = 'sine';
      mod.type = 'sine';
      carrier.frequency.setValueAtTime(base, when);
      mod.frequency.setValueAtTime(base * (1 + (index % 5)), when);
      modGain.gain.setValueAtTime(45 + index * 16, when);
      mod.connect(modGain).connect(carrier.frequency);
      connectAndShape(carrier, gain, when, length, .42);
      mod.start(when); carrier.start(when);
      mod.stop(when + length + .04); carrier.stop(when + length + .04);
      stoppers.push(() => { mod.stop(); carrier.stop(); });
    } else if (persona.behavior === 'fx') {
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      source.buffer = noiseBuffer(length);
      filter.type = index % 2 ? 'bandpass' : 'highpass';
      filter.frequency.setValueAtTime(260 + index * 420, when);
      filter.Q.setValueAtTime(2 + index * .35, when);
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.exponentialRampToValueAtTime(.46, when + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, when + length);
      source.connect(filter).connect(gain).connect(master);
      source.start(when); source.stop(when + length + .04);
      stoppers.push(() => source.stop());
    } else if (persona.behavior === 'loop') {
      const osc = ctx.createOscillator();
      osc.type = persona.wave || 'sawtooth';
      length = Math.max(quantizeSeconds() * 1.5, persona.length || .9);
      osc.frequency.setValueAtTime(base * .55, when);
      osc.frequency.setTargetAtTime(base * (index % 2 ? .75 : 1.25), when + length * .35, .08);
      connectAndShape(osc, gain, when, length, .36);
      osc.start(when); osc.stop(when + length + .04);
      stoppers.push(() => osc.stop());
    } else if (persona.behavior === 'chop') {
      const count = index > 3 ? 3 : 1;
      length = .11;
      for (let step = 0; step < count; step += 1) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = when + step * quantizeSeconds() / 6;
        osc.type = 'square';
        osc.frequency.setValueAtTime(base * (1 + step * .35), t);
        connectAndShape(osc, g, t, length, .48);
        osc.start(t); osc.stop(t + length + .03);
        stoppers.push(() => osc.stop());
      }
    } else if (persona.behavior === 'bass') {
      [0, -7].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = persona.wave || 'sawtooth';
        osc.frequency.setValueAtTime(base * .45, when);
        osc.detune.setValueAtTime(detune, when);
        connectAndShape(osc, gain, when, length, .34);
        osc.start(when); osc.stop(when + length + .04);
        stoppers.push(() => osc.stop());
      });
    } else {
      const osc = ctx.createOscillator();
      osc.type = persona.wave || 'square';
      osc.frequency.setValueAtTime(base, when);
      connectAndShape(osc, gain, when, length, .48);
      osc.start(when); osc.stop(when + length + .04);
      stoppers.push(() => osc.stop());
    }

    activeSources.set(id, { gain, source:null, stopper: () => stoppers.forEach((stop) => { try { stop(); } catch (error) {} }) });
    setTimeout(() => activeSources.delete(id), Math.ceil((length + .18) * 1000));
    flash(index, when);
    status(`${persona.role}: pad ${index + 1} · ${persona.voice} · ${session.quantize || '1/4'} grid.`);
    return true;
  }

  async function importFile(file, index) {
    audio();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      buffers.set(index, decoded);
      await save(index, arrayBuffer, file.name, file.type || '');
      mark();
      status(`Saved ${file.name} to pad ${index + 1}. Tap that pad or use QUEUE / PLAY. Reload once for full engine-bank mode.`);
      play(index, false);
    } catch (error) {
      status('That sound could not be decoded. Try WAV, MP3, M4A, WEBM, or a shorter file.');
    }
  }

  function play(index, immediate = false) {
    const buffer = buffers.get(index);
    if (!buffer) {
      status(`No custom sound on pad ${index + 1}. ${persona.role}: ${persona.gesture}.`);
      return false;
    }
    audio();
    const when = immediate ? ctx.currentTime + 0.006 : nextGridTime();
    const id = `local-${index}`;
    const session = readSession();
    if (session.choke !== false) stopPersonalityVoices(id);

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const maxLength = Math.max(0.08, Math.min(buffer.duration, Math.max(quantizeSeconds(), 4)));
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.9, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + maxLength);
    source.connect(gain).connect(master);
    source.start(when, 0, maxLength);
    source.stop(when + maxLength + 0.05);
    activeSources.set(id, { source, gain, stopper: () => source.stop() });
    setTimeout(() => activeSources.delete(id), Math.ceil((maxLength + 0.15) * 1000));
    flash(index, when);
    status(`Pad ${index + 1} queued on ${session.quantize || '1/4'} grid. Choke is ${session.choke === false ? 'off' : 'on'}.`);
    return true;
  }

  function mark() {
    pads.forEach((pad, index) => pad.classList.toggle('local-pad', buffers.has(index)));
  }

  async function restore() {
    await Promise.all(pads.map(async (_, index) => {
      const item = await load(index);
      if (!item?.arrayBuffer) return;
      try {
        audio();
        const decoded = await ctx.decodeAudioData(item.arrayBuffer.slice(0));
        buffers.set(index, decoded);
      } catch (error) {}
    }));
    mark();
    if (buffers.size) status(`${buffers.size} custom pad sound${buffers.size === 1 ? '' : 's'} restored. Tap a green LOCAL pad or reload once for full engine-bank mode.`);
    keepLabelsFresh();
  }

  const ui = makeUi();
  const select = ui.querySelector('[data-pad-memory-target]');
  const input = ui.querySelector('[data-pad-memory-file]');

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) await importFile(file, Number(select.value));
    input.value = '';
  });

  ui.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-pad-memory]')?.dataset.padMemory;
    const index = Number(select.value);
    if (action === 'play') play(index, false);
    if (action === 'clear') {
      buffers.delete(index);
      stopSource(`local-${index}`);
      await remove(index);
      mark();
      status(`Cleared pad ${index + 1}. Machine voice returns unless another custom file is saved.`);
    }
  });

  pads.forEach((pad, index) => {
    pad.addEventListener('pointerdown', (event) => {
      if (buffers.has(index)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        play(index, false);
        return;
      }
      if (playPersonality(index, false)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  });

  restore();
})();