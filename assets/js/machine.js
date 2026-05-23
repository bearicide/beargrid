(() => {
  'use strict';

  const MACHINE = document.body.dataset.machine || 'beargrid-machine';
  const STORAGE_KEY = `mattbear-beargrid-session-${MACHINE}`;
  const GLOBAL_KEY = 'mattbear-beargrid-global-session';
  const padEls = Array.from(document.querySelectorAll('.pad'));
  const isMachinePage = !!document.querySelector('.machine-page');
  const bankUrl = '../assets/audio/kits/basement-thunder/kit.json';

  const state = {
    bpm: 120,
    quantize: '1/4',
    choke: true,
    swing: 0,
    volume: 0.78,
    running: false,
    currentStep: 0,
    activeSources: new Map(),
    activeClips: new Set(),
    heldNotes: new Map(),
    sampleBuffers: new Map(),
    recordedBuffers: new Map(),
    loadPromises: new Map(),
    midiReady: false,
    lastPad: null,
    selectedPad: 0,
    sampleBankLoaded: false,
    recorder: { mediaRecorder: null, stream: null, chunks: [], active: false },
    xy: { x: 0.5, y: 0.5, latch: false, touching: false },
    macros: { filter: 0.82, delay: 0.12, crush: 0.0, pump: 0.0 },
    pattern: Array.from({ length: Math.max(8, padEls.length || 8) }, () => Array(16).fill(false)),
    scheduledLookaheadMs: 25,
    scheduleAheadSec: 0.12,
    nextStepTime: 0,
    timerId: null,
    scopeEnergy: 0
  };

  const MACHINE_PROFILES = {
    'drum-machine': { mode: 'DRUM', base: 80, type: 'drum', labels: ['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Tom', 'Rim', 'Crash', 'Perc'] },
    'kaossilator-pro': { mode: 'XY SYNTH', base: 180, type: 'xy', labels: ['Bass X', 'Lead Y', 'Gate', 'Sweep', 'Hold', 'Scale', 'FX Send', 'Latch'] },
    'op-1': { mode: 'TAPE SYNTH', base: 220, type: 'synth', labels: ['Tape A', 'Tape B', 'Synth', 'Drum', 'Lift', 'Drop', 'Punch', 'Album'] },
    orchid: { mode: 'CHORD', base: 196, type: 'chord', labels: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'Bloom'] },
    reese: { mode: 'BASS', base: 55, type: 'bass', labels: ['Sub', 'Reese', 'Growl', 'Wobble', 'Cut', 'Drive', 'Octave', 'Glide'] },
    'looping-drum-loops': { mode: 'LOOP', base: 100, type: 'loop', labels: ['Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Fill', 'Break', 'Ride', 'Drop'] },
    'the-choppa': { mode: 'CHOP', base: 140, type: 'chop', labels: ['Slice 1', 'Slice 2', 'Slice 3', 'Slice 4', 'Stutter', 'Reverse', 'Gate', 'Scatter'] },
    sampla: { mode: 'SAMPLER', base: 130, type: 'sample', labels: ['One', 'Shot', 'Vox', 'Hit', 'Texture', 'Rise', 'Drop', 'Resample'] },
    launcha: { mode: 'LAUNCH', base: 120, type: 'launch', labels: ['Clip A', 'Clip B', 'Clip C', 'Clip D', 'Scene', 'Stop', 'Mute', 'Arm'] },
    'mono-station': { mode: 'MONO', base: 90, type: 'bass', labels: ['Osc 1', 'Osc 2', 'Filter', 'Env', 'LFO', 'Drive', 'Seq', 'Accent'] },
    mellotron: { mode: 'TAPE', base: 165, type: 'chord', labels: ['Choir', 'Flute', 'Strings', 'Cello', 'Tape Warble', 'Wow', 'Flutter', 'Dust'] },
    'bit-crusher': { mode: 'CRUSH', base: 210, type: 'fx', labels: ['8 Bit', '4 Bit', 'Fold', 'Rate', 'Noise', 'Down', 'Alias', 'Crush'] },
    'fm-station': { mode: 'FM', base: 240, type: 'fm', labels: ['Carrier', 'Mod', 'Ratio', 'Bell', 'Metal', 'Stack', 'Index', 'Feedback'] },
    'delay-station': { mode: 'DELAY', base: 150, type: 'fx', labels: ['Delay 1', 'Delay 2', 'Ping', 'Pong', 'Dub', 'Freeze', 'Feedback', 'Throw'] },
    'filter-station': { mode: 'FILTER', base: 170, type: 'fx', labels: ['Low', 'High', 'Band', 'Notch', 'Sweep', 'Res', 'Open', 'Close'] },
    'master-fx': { mode: 'MASTER FX', base: 200, type: 'fx', labels: ['Punch', 'Wide', 'Pump', 'Gate', 'Crush', 'Delay', 'Filter', 'Kill'] }
  };

  const profile = MACHINE_PROFILES[MACHINE] || { mode: 'LIVE', base: 160, type: 'synth', labels: [] };
  const keyMap = ['1', '2', '3', '4', '5', '6', '7', '8', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
  let ctx;
  let master;
  let filter;
  let delay;
  let delayGain;
  let compressor;
  let crushNode;
  let analyser;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function ensureAudio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      filter = ctx.createBiquadFilter();
      delay = ctx.createDelay(1.5);
      delayGain = ctx.createGain();
      compressor = ctx.createDynamicsCompressor();
      crushNode = ctx.createWaveShaper();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.gain.value = state.volume;
      filter.type = 'lowpass';
      filter.frequency.value = 16000;
      filter.Q.value = 0.7;
      delay.delayTime.value = 0.18;
      delayGain.gain.value = 0.12;
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
      crushNode.curve = makeCrushCurve(0);
      crushNode.oversample = '2x';
      filter.connect(crushNode);
      crushNode.connect(compressor);
      compressor.connect(master);
      filter.connect(delay);
      delay.connect(delayGain);
      delayGain.connect(compressor);
      master.connect(analyser);
      analyser.connect(ctx.destination);
      applyMacros();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function makeCrushCurve(amount = 0) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = 1 + amount * 34;
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }

  function applyMacros() {
    if (!ctx) return;
    const now = ctx.currentTime;
    filter.frequency.setTargetAtTime(220 + state.macros.filter * 15800, now, 0.025);
    filter.Q.setTargetAtTime(0.6 + state.macros.pump * 10, now, 0.025);
    delay.delayTime.setTargetAtTime(0.04 + state.macros.delay * 0.72, now, 0.025);
    delayGain.gain.setTargetAtTime(state.macros.delay * 0.42, now, 0.025);
    master.gain.setTargetAtTime(state.volume * (1 - state.macros.pump * 0.22), now, 0.035);
    crushNode.curve = makeCrushCurve(state.macros.crush);
  }

  function beatSeconds() { return 60 / state.bpm; }
  function quantizeSeconds() {
    const beat = beatSeconds();
    if (state.quantize === '1/8') return beat / 2;
    if (state.quantize === '1/16') return beat / 4;
    return beat;
  }

  function nextQuantizedTime() {
    ensureAudio();
    const grid = quantizeSeconds();
    const now = ctx.currentTime;
    return Math.ceil((now + 0.015) / grid) * grid;
  }

  function clearSource(id) {
    const source = state.activeSources.get(id);
    if (!source || !ctx) return;
    try {
      if (source.gain) {
        source.gain.gain.cancelScheduledValues(ctx.currentTime);
        source.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.025);
      }
      window.setTimeout(() => { try { source.stopper && source.stopper(); } catch (error) {} }, 80);
    } catch (error) {}
    state.activeSources.delete(id);
  }

  function chokeAll(exceptId = null) {
    if (!ctx) return;
    for (const id of Array.from(state.activeSources.keys())) if (id !== exceptId) clearSource(id);
    state.heldNotes.forEach((note) => { try { note.stopper(); } catch (error) {} });
    state.heldNotes.clear();
  }

  function envelope(gain, when, length, peak = 0.82) {
    gain.gain.cancelScheduledValues(when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  }

  function makeNoiseBuffer(duration = 0.18) {
    ensureAudio();
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function connectVoice(output, gain, when, padIndex) {
    const localFilter = ctx.createBiquadFilter();
    const fxAmount = profile.type === 'fx' ? 0.38 : 0.12;
    localFilter.type = padIndex % 2 ? 'bandpass' : 'lowpass';
    localFilter.frequency.setValueAtTime(520 + padIndex * 360 + state.xy.x * 900, when);
    localFilter.Q.value = 0.8 + padIndex * 0.08 + state.xy.y * 1.2;
    output.connect(localFilter).connect(gain).connect(filter);
    if (fxAmount > 0.2) delayGain.gain.setTargetAtTime(fxAmount, when, 0.03);
  }

  async function loadSampleBank() {
    if (state.sampleBankLoaded || state.loadPromises.has('bank')) return state.loadPromises.get('bank');
    const job = fetch(bankUrl, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then(async (bank) => {
        if (!bank || !Array.isArray(bank.pads)) return false;
        ensureAudio();
        await Promise.all(bank.pads.map(async (item, index) => {
          if (!item || !item.file) return;
          const url = new URL(item.file, new URL(bankUrl, window.location.href)).href;
          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const data = await response.arrayBuffer();
            const buffer = await ctx.decodeAudioData(data.slice(0));
            state.sampleBuffers.set(index, buffer);
            if (padEls[index] && item.label) padEls[index].textContent = item.label;
          } catch (error) {}
        }));
        state.sampleBankLoaded = true;
        updateSampleStatus();
        return true;
      })
      .catch(() => false);
    state.loadPromises.set('bank', job);
    return job;
  }

  function playBuffer(buffer, padIndex, when, options = {}) {
    ensureAudio();
    const id = options.id || `buffer-${padIndex}`;
    if (state.choke && !options.layer) chokeAll(id);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.rate || 1;
    connectVoice(source, gain, when, padIndex);
    const length = Math.max(0.08, Math.min(buffer.duration / source.playbackRate.value, options.length || buffer.duration));
    envelope(gain, when, length, options.peak || 0.88);
    source.start(when, options.offset || 0, length);
    source.stop(when + length + 0.05);
    state.activeSources.set(id, { gain, stopper: () => source.stop() });
    window.setTimeout(() => state.activeSources.delete(id), Math.ceil((length + 0.15) * 1000));
    drawWaveform(buffer, padIndex);
    state.scopeEnergy = 1;
    return true;
  }

  function playEnginePad(padIndex, when, options = {}) {
    ensureAudio();
    const recorded = state.recordedBuffers.get(padIndex);
    const sample = state.sampleBuffers.get(padIndex);
    if (!options.forceSynth && (recorded || sample)) {
      playBuffer(recorded || sample, padIndex, when, options);
      return;
    }
    const id = options.id || `pad-${padIndex}`;
    if (state.choke && !options.layer) chokeAll(id);
    const gain = ctx.createGain();
    const base = (options.frequency || profile.base + padIndex * 37) * (options.octave || 1);
    let length = options.length || 0.24;
    let stopper = null;
    if (profile.type === 'drum') {
      if (padIndex === 0) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(125, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.15);
        length = options.length || 0.22;
        connectVoice(osc, gain, when, padIndex);
        envelope(gain, when, length, 0.95);
        osc.start(when); osc.stop(when + length + 0.04);
        stopper = () => osc.stop();
      } else if (padIndex === 1 || padIndex === 3) {
        const noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(0.22);
        length = options.length || 0.2;
        connectVoice(noise, gain, when, padIndex);
        envelope(gain, when, length, 0.55);
        noise.start(when); noise.stop(when + length + 0.04);
        stopper = () => noise.stop();
      } else {
        const noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(0.09);
        length = options.length || 0.08;
        connectVoice(noise, gain, when, padIndex);
        envelope(gain, when, length, 0.35);
        noise.start(when); noise.stop(when + length + 0.03);
        stopper = () => noise.stop();
      }
    } else if (profile.type === 'loop' || profile.type === 'launch' || profile.type === 'chop' || profile.type === 'sample') {
      const osc = ctx.createOscillator();
      osc.type = profile.type === 'chop' ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(base, when);
      if (profile.type === 'chop') osc.frequency.setTargetAtTime(base * 1.5, when + 0.04, 0.03);
      length = options.length || (profile.type === 'loop' || profile.type === 'launch' ? quantizeSeconds() * 1.85 : 0.32);
      connectVoice(osc, gain, when, padIndex);
      envelope(gain, when, length, profile.type === 'launch' ? 0.5 : 0.58);
      osc.start(when); osc.stop(when + length + 0.05);
      stopper = () => osc.stop();
    } else if (profile.type === 'chord') {
      const ratios = options.ratios || [1, 1.25, 1.5];
      const oscs = ratios.map((ratio) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(base * ratio, when);
        connectVoice(osc, gain, when, padIndex);
        osc.start(when); osc.stop(when + 0.78);
        return osc;
      });
      length = options.length || 0.72;
      envelope(gain, when, length, 0.42);
      stopper = () => oscs.forEach((osc) => osc.stop());
    } else if (profile.type === 'fm') {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.type = 'sine';
      mod.type = 'sine';
      carrier.frequency.value = base;
      mod.frequency.value = base * (1 + (padIndex % 4));
      modGain.gain.value = 80 + padIndex * 18 + state.xy.y * 100;
      mod.connect(modGain).connect(carrier.frequency);
      length = options.length || 0.46;
      connectVoice(carrier, gain, when, padIndex);
      envelope(gain, when, length, 0.52);
      mod.start(when); carrier.start(when);
      mod.stop(when + length + 0.05); carrier.stop(when + length + 0.05);
      stopper = () => { mod.stop(); carrier.stop(); };
    } else {
      const osc = ctx.createOscillator();
      osc.type = profile.type === 'bass' ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(base, when);
      length = options.length || (profile.type === 'bass' ? 0.42 : 0.28);
      connectVoice(osc, gain, when, padIndex);
      envelope(gain, when, length, 0.62);
      osc.start(when); osc.stop(when + length + 0.05);
      stopper = () => osc.stop();
    }
    state.activeSources.set(id, { gain, stopper });
    state.scopeEnergy = 1;
    drawSyntheticWave(padIndex);
    window.setTimeout(() => state.activeSources.delete(id), Math.ceil((length + 0.15) * 1000));
  }

  function flashPad(pad, ms = 160) {
    pad.classList.add('on');
    pad.setAttribute('aria-pressed', 'true');
    setTimeout(() => { pad.classList.remove('on'); pad.setAttribute('aria-pressed', 'false'); }, ms);
  }

  function triggerPad(index, immediate = false, options = {}) {
    const pad = padEls[index];
    if (!pad) return;
    ensureAudio();
    const when = immediate ? ctx.currentTime + 0.006 : nextQuantizedTime();
    playEnginePad(index, when, options);
    window.setTimeout(() => flashPad(pad), Math.max(0, (when - ctx.currentTime) * 1000));
    state.selectedPad = index;
    state.lastPad = { machine: MACHINE, index, label: pad.textContent.trim(), at: new Date().toISOString() };
    saveSession();
    updateReadouts();
    updateSampleStatus();
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function scheduler() {
    if (!state.running || !ctx) return;
    while (state.nextStepTime < ctx.currentTime + state.scheduleAheadSec) {
      pulseStep(state.currentStep, state.nextStepTime);
      runMachineStep(state.currentStep, state.nextStepTime);
      const stepLength = beatSeconds() / 4;
      state.nextStepTime += stepLength;
      state.currentStep = (state.currentStep + 1) % 16;
    }
  }

  function pulseStep(step, when) {
    document.documentElement.style.setProperty('--beat-step', step);
    document.querySelectorAll('[data-readout="step"]').forEach((light) => { light.textContent = String(step + 1).padStart(2, '0'); });
    document.querySelectorAll('.seq-step,.launch-clip,.wave-slice').forEach((el) => {
      el.classList.toggle('playing', Number(el.dataset.step) === step || Number(el.dataset.clipStep) === step % 4);
    });
    if (step % 4 === 0) {
      const clickGain = ctx.createGain();
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.value = step === 0 ? 1200 : 820;
      clickGain.gain.setValueAtTime(0.0001, when);
      clickGain.gain.exponentialRampToValueAtTime(0.018, when + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
      click.connect(clickGain).connect(master);
      click.start(when);
      click.stop(when + 0.04);
    }
  }

  function runMachineStep(step, when) {
    if (profile.type === 'drum') {
      state.pattern.forEach((track, trackIndex) => {
        if (track[step] && padEls[trackIndex]) {
          playEnginePad(trackIndex, when, { id: `seq-${trackIndex}-${step}`, layer: true });
          window.setTimeout(() => flashPad(padEls[trackIndex], 90), Math.max(0, (when - ctx.currentTime) * 1000));
        }
      });
    }
    if (profile.type === 'launch' || profile.type === 'loop') {
      state.activeClips.forEach((clip) => { if (step % 4 === 0) playEnginePad(clip, when, { id: `clip-${clip}`, layer: true, length: beatSeconds() * 1.6 }); });
    }
    if ((profile.type === 'bass' || profile.type === 'fm') && step % 4 === 0 && state.activeClips.size) {
      const notes = Array.from(state.activeClips);
      const note = notes[(step / 4) % notes.length] || 0;
      playEnginePad(note, when, { id: `arp-${step}`, layer: true, length: beatSeconds() * 0.7 });
    }
  }

  function startClock() {
    ensureAudio();
    state.running = true;
    state.currentStep = 0;
    state.nextStepTime = ctx.currentTime + 0.05;
    window.clearInterval(state.timerId);
    state.timerId = window.setInterval(scheduler, state.scheduledLookaheadMs);
    updateReadouts();
    saveSession();
  }

  function stopClock() {
    state.running = false;
    window.clearInterval(state.timerId);
    updateReadouts();
    saveSession();
  }

  function serializeState() {
    return {
      bpm: state.bpm, quantize: state.quantize, choke: state.choke, swing: state.swing, volume: state.volume,
      running: state.running, lastPad: state.lastPad, selectedPad: state.selectedPad, xy: state.xy, macros: state.macros, pattern: state.pattern,
      activeClips: Array.from(state.activeClips), machine: MACHINE, profile: profile.mode, updatedAt: new Date().toISOString()
    };
  }

  function saveSession() {
    try {
      const payload = serializeState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(payload));
      localStorage.setItem('mattbear-beargrid-last-pad', JSON.stringify(state.lastPad));
    } catch (error) {}
  }

  function loadSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      ['bpm', 'quantize', 'choke', 'swing', 'volume', 'lastPad', 'selectedPad', 'xy', 'macros'].forEach((key) => { if (saved[key] !== undefined) state[key] = saved[key]; });
      if (Array.isArray(saved.pattern)) state.pattern = saved.pattern;
      if (Array.isArray(saved.activeClips)) state.activeClips = new Set(saved.activeClips);
    } catch (error) {}
  }

  function injectTransport() {
    const panel = document.querySelector('.panel');
    if (!panel || panel.querySelector('.machine-transport')) return;
    const transport = document.createElement('section');
    transport.className = 'machine-transport';
    transport.setAttribute('aria-label', 'BearGrid performance controls');
    transport.innerHTML = `
      <div class="transport-readouts">
        <span><strong>Mode</strong><b data-readout="mode">${profile.mode}</b></span>
        <span><strong>BPM</strong><b data-readout="bpm">${state.bpm}</b></span>
        <span><strong>Step</strong><b data-readout="step">--</b></span>
        <span><strong>Q</strong><b data-readout="quantize">${state.quantize}</b></span>
      </div>
      <canvas class="signal-scope" width="900" height="140" aria-label="Live waveform monitor"></canvas>
      <div class="transport-controls">
        <button class="transport-btn" type="button" data-action="play">PLAY</button>
        <button class="transport-btn" type="button" data-action="stop">STOP</button>
        <button class="transport-btn" type="button" data-action="choke">CHOKE ON</button>
        <button class="transport-btn" type="button" data-action="save">SAVE</button>
      </div>
      <div class="slider-row">
        <label>BPM <input data-control="bpm" type="range" min="60" max="190" step="1" value="${state.bpm}"></label>
        <label>Volume <input data-control="volume" type="range" min="0" max="1" step="0.01" value="${state.volume}"></label>
        <label>Quantize <select data-control="quantize"><option>1/4</option><option>1/8</option><option>1/16</option></select></label>
      </div>
      <p class="machine-hint">Tap/click pads or use keys <strong>1–8</strong>. Launchkey Mini pads map C2–D#3 when Web MIDI is available. Triggers quantize to the clock; CHOKE kills stacked sound.</p>
    `;
    const grid = panel.querySelector('.control-grid');
    if (grid) grid.before(transport); else panel.appendChild(transport);
    transport.querySelector('[data-control="quantize"]').value = state.quantize;
    transport.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'play') startClock();
      if (action === 'stop') { stopClock(); chokeAll(); }
      if (action === 'choke') { state.choke = !state.choke; saveSession(); updateReadouts(); }
      if (action === 'save') { saveSession(); flashSave(event.target); }
    });
    transport.addEventListener('input', (event) => {
      const control = event.target.dataset.control;
      if (control === 'bpm') state.bpm = Number(event.target.value);
      if (control === 'volume') {
        state.volume = Number(event.target.value);
        ensureAudio();
        master.gain.setTargetAtTime(state.volume, ctx.currentTime, 0.02);
      }
      saveSession(); updateReadouts();
    });
    transport.addEventListener('change', (event) => {
      if (event.target.dataset.control === 'quantize') state.quantize = event.target.value;
      saveSession(); updateReadouts();
    });
    drawScopeLoop();
  }

  function injectMachineModule() {
    const panel = document.querySelector('.panel');
    const grid = panel?.querySelector('.control-grid');
    if (!panel || !grid || panel.querySelector('.machine-module')) return;
    if (profile.type === 'drum') grid.after(makeSequencerModule());
    else if (profile.type === 'xy') grid.after(makeXYModule());
    else if (profile.type === 'chop') grid.after(makeChopModule());
    else if (profile.type === 'launch' || profile.type === 'loop') grid.after(makeLaunchModule());
    else if (profile.type === 'fx') grid.after(makeFXModule());
    else if (['synth', 'bass', 'chord', 'fm'].includes(profile.type)) grid.after(makeKeysModule());
    else if (profile.type === 'sample') grid.after(makeSamplerModule());
    grid.after(makeRecorderBay());
  }

  function makeModule(title, body, hint) {
    const mod = document.createElement('section');
    mod.className = `machine-module module-${profile.type}`;
    mod.innerHTML = `<div class="module-head"><strong>${title}</strong><span>${profile.mode}</span></div>${body}<p class="machine-hint">${hint}</p>`;
    return mod;
  }

  function makeSequencerModule() {
    const tracks = Math.min(8, padEls.length || 8);
    const body = `<div class="sequencer-grid" style="--tracks:${tracks}">${Array.from({ length: tracks }, (_, row) => Array.from({ length: 16 }, (_, step) => `<button class="seq-step" type="button" data-row="${row}" data-step="${step}" aria-label="${profile.labels[row] || `Track ${row + 1}`} step ${step + 1}"></button>`).join('')).join('')}</div>
      <div class="module-actions"><button class="transport-btn" type="button" data-seq="clear">CLEAR</button><button class="transport-btn" type="button" data-seq="seed">SEED</button><button class="transport-btn" type="button" data-seq="four">FOUR</button></div>`;
    const mod = makeModule('16-step drum brain', body, 'Click steps to program. PLAY runs the sequencer. SEED gives it a quick dirty starter groove.');
    mod.addEventListener('click', (event) => {
      const stepBtn = event.target.closest('.seq-step');
      const action = event.target.closest('[data-seq]')?.dataset.seq;
      if (stepBtn) {
        const row = Number(stepBtn.dataset.row);
        const step = Number(stepBtn.dataset.step);
        state.pattern[row][step] = !state.pattern[row][step];
        stepBtn.classList.toggle('armed', state.pattern[row][step]);
        saveSession();
      }
      if (action === 'clear') { state.pattern = state.pattern.map((track) => track.map(() => false)); mod.querySelectorAll('.seq-step').forEach((el) => el.classList.remove('armed')); saveSession(); }
      if (action === 'seed') { seedDrums(); syncSequencerUI(mod); }
      if (action === 'four') {
        state.pattern[0] = state.pattern[0].map((_, i) => i % 4 === 0);
        state.pattern[1] = state.pattern[1].map((_, i) => i === 4 || i === 12);
        state.pattern[2] = state.pattern[2].map((_, i) => i % 2 === 0);
        syncSequencerUI(mod); saveSession();
      }
    });
    syncSequencerUI(mod);
    return mod;
  }

  function seedDrums() {
    state.pattern = state.pattern.map((track) => track.map(() => false));
    [0, 4, 8, 12].forEach((step) => { state.pattern[0][step] = true; });
    [4, 12].forEach((step) => { state.pattern[1][step] = true; });
    [2, 6, 10, 14].forEach((step) => { state.pattern[2][step] = true; });
    [15].forEach((step) => { state.pattern[3][step] = true; });
    saveSession();
  }

  function syncSequencerUI(root = document) {
    root.querySelectorAll('.seq-step').forEach((btn) => {
      const row = Number(btn.dataset.row);
      const step = Number(btn.dataset.step);
      btn.classList.toggle('armed', !!state.pattern[row]?.[step]);
    });
  }

  function makeXYModule() {
    const body = `<div class="xy-pad" role="application" aria-label="XY synth pad"><div class="xy-cursor"></div><span class="xy-label x">X: pitch/filter</span><span class="xy-label y">Y: brightness/fx</span></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-xy="latch">LATCH OFF</button><button class="transport-btn" type="button" data-xy="center">CENTER</button></div>`;
    const mod = makeModule('XY touch surface', body, 'Drag the surface. X changes pitch/filter, Y changes brightness/FX. LATCH holds the last tone.');
    const pad = mod.querySelector('.xy-pad');
    const cursor = mod.querySelector('.xy-cursor');
    const latch = mod.querySelector('[data-xy="latch"]');
    const setXY = (event, play = true) => {
      const rect = pad.getBoundingClientRect();
      state.xy.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      state.xy.y = clamp(1 - ((event.clientY - rect.top) / rect.height), 0, 1);
      updateXYCursor(cursor); applyMacros(); if (play) playXYTone(); saveSession();
    };
    pad.addEventListener('pointerdown', (event) => { ensureAudio(); pad.setPointerCapture(event.pointerId); state.xy.touching = true; setXY(event); });
    pad.addEventListener('pointermove', (event) => { if (state.xy.touching) setXY(event, true); });
    pad.addEventListener('pointerup', () => { state.xy.touching = false; if (!state.xy.latch) clearSource('xy-latch'); });
    mod.addEventListener('click', (event) => {
      const action = event.target.closest('[data-xy]')?.dataset.xy;
      if (action === 'latch') { state.xy.latch = !state.xy.latch; latch.textContent = state.xy.latch ? 'LATCH ON' : 'LATCH OFF'; latch.classList.toggle('on', state.xy.latch); saveSession(); }
      if (action === 'center') { state.xy.x = 0.5; state.xy.y = 0.5; updateXYCursor(cursor); saveSession(); }
    });
    updateXYCursor(cursor);
    latch.textContent = state.xy.latch ? 'LATCH ON' : 'LATCH OFF';
    latch.classList.toggle('on', state.xy.latch);
    return mod;
  }

  function updateXYCursor(cursor) { cursor.style.left = `${state.xy.x * 100}%`; cursor.style.top = `${(1 - state.xy.y) * 100}%`; }
  function playXYTone() {
    ensureAudio();
    const freq = 90 + state.xy.x * 920;
    playEnginePad(Math.round(state.xy.x * 7), ctx.currentTime + 0.004, { id: 'xy-latch', frequency: freq, length: state.xy.latch ? 1.2 : 0.18, layer: state.xy.latch, forceSynth: true });
  }

  function makeChopModule() {
    const body = `<div class="wave-strip">${Array.from({ length: 16 }, (_, step) => `<button type="button" class="wave-slice" data-step="${step}" style="--h:${30 + (step * 37) % 64}%" aria-label="Slice ${step + 1}"></button>`).join('')}</div>
      <div class="module-actions"><button class="transport-btn" type="button" data-chop="stutter">STUTTER</button><button class="transport-btn" type="button" data-chop="reverse">REVERSE</button><button class="transport-btn" type="button" data-chop="scatter">SCATTER</button></div>`;
    const mod = makeModule('slice and stutter strip', body, 'Hit slices directly. Stutter repeats on the grid, reverse drops pitch, scatter fires a quick chaos roll.');
    mod.addEventListener('click', (event) => {
      const slice = event.target.closest('.wave-slice');
      const action = event.target.closest('[data-chop]')?.dataset.chop;
      if (slice) { const step = Number(slice.dataset.step); triggerPad(step % Math.max(1, padEls.length), false, { frequency: profile.base + step * 24 }); }
      if (action === 'stutter') repeatBurst(2, 4);
      if (action === 'reverse') triggerPad(5, false, { frequency: profile.base * 0.5, length: 0.45, rate: 0.6 });
      if (action === 'scatter') repeatBurst(0, 8);
    });
    return mod;
  }

  function repeatBurst(startPad, count) {
    ensureAudio();
    const start = nextQuantizedTime();
    for (let i = 0; i < count; i += 1) {
      const pad = (startPad + i) % Math.max(1, padEls.length);
      playEnginePad(pad, start + i * beatSeconds() / 12, { id: `burst-${i}`, layer: true, length: 0.12 });
      window.setTimeout(() => flashPad(padEls[pad], 80), Math.max(0, (start + i * beatSeconds() / 12 - ctx.currentTime) * 1000));
    }
  }

  function makeLaunchModule() {
    const body = `<div class="launch-grid">${Array.from({ length: 8 }, (_, clip) => `<button type="button" class="launch-clip" data-clip="${clip}" data-clip-step="${clip % 4}"><strong>${profile.labels[clip] || `Clip ${clip + 1}`}</strong><span></span></button>`).join('')}</div>
      <div class="module-actions"><button class="transport-btn" type="button" data-launch="scene">SCENE</button><button class="transport-btn" type="button" data-launch="stopclips">STOP CLIPS</button></div>`;
    const mod = makeModule('quantized clip launcher', body, 'Toggle clips. Active clips fire every bar against the shared clock. Scene arms the first four.');
    mod.addEventListener('click', (event) => {
      const clipBtn = event.target.closest('.launch-clip');
      const action = event.target.closest('[data-launch]')?.dataset.launch;
      if (clipBtn) toggleClip(Number(clipBtn.dataset.clip), clipBtn);
      if (action === 'scene') { [0, 1, 2, 3].forEach((clip) => state.activeClips.add(clip)); syncClips(mod); saveSession(); }
      if (action === 'stopclips') { state.activeClips.clear(); syncClips(mod); saveSession(); }
    });
    syncClips(mod); return mod;
  }

  function toggleClip(index, button) {
    if (state.activeClips.has(index)) state.activeClips.delete(index); else state.activeClips.add(index);
    if (button) button.classList.toggle('armed', state.activeClips.has(index));
    triggerPad(index % Math.max(1, padEls.length)); saveSession();
  }
  function syncClips(root = document) { root.querySelectorAll('.launch-clip').forEach((button) => button.classList.toggle('armed', state.activeClips.has(Number(button.dataset.clip)))); }

  function makeFXModule() {
    const body = `<div class="macro-grid">
      ${['filter', 'delay', 'crush', 'pump'].map((name) => `<label>${name}<input type="range" min="0" max="1" step="0.01" value="${state.macros[name]}" data-macro="${name}"></label>`).join('')}
      </div><div class="module-actions"><button class="transport-btn" type="button" data-fx="throw">DELAY THROW</button><button class="transport-btn" type="button" data-fx="panic">PANIC</button></div>`;
    const mod = makeModule('performance FX macros', body, 'Macros affect the shared audio bus: filter, delay, crush, and pump. PANIC kills all active sound.');
    mod.addEventListener('input', (event) => { const macro = event.target.dataset.macro; if (!macro) return; state.macros[macro] = Number(event.target.value); ensureAudio(); applyMacros(); saveSession(); });
    mod.addEventListener('click', (event) => {
      const action = event.target.closest('[data-fx]')?.dataset.fx;
      if (action === 'throw') { ensureAudio(); state.macros.delay = 0.85; applyMacros(); syncMacros(mod); window.setTimeout(() => { state.macros.delay = 0.12; applyMacros(); syncMacros(mod); saveSession(); }, 900); }
      if (action === 'panic') { chokeAll(); stopClock(); }
    });
    return mod;
  }
  function syncMacros(root = document) { root.querySelectorAll('[data-macro]').forEach((input) => { input.value = state.macros[input.dataset.macro]; }); }

  function makeKeysModule() {
    const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
    const body = `<div class="mini-keys">${notes.map((note, index) => `<button type="button" class="mini-key" data-note="${index}">${note}</button>`).join('')}</div>
      <div class="module-actions"><button class="transport-btn" type="button" data-keys="arp">ARP HOLD</button><button class="transport-btn" type="button" data-keys="clear">CLEAR</button></div>`;
    const mod = makeModule('playable tone row', body, 'Mini keys use the machine voice. ARP HOLD lets the clock walk through selected notes.');
    mod.addEventListener('click', (event) => {
      const key = event.target.closest('.mini-key');
      const action = event.target.closest('[data-keys]')?.dataset.keys;
      if (key) {
        const note = Number(key.dataset.note);
        if (state.activeClips.has(note)) state.activeClips.delete(note); else state.activeClips.add(note);
        syncKeys(mod); triggerPad(note % Math.max(1, padEls.length), false, { frequency: profile.base * Math.pow(2, note / 12), forceSynth: true }); saveSession();
      }
      if (action === 'arp') { startClock(); syncKeys(mod); }
      if (action === 'clear') { state.activeClips.clear(); syncKeys(mod); saveSession(); }
    });
    syncKeys(mod); return mod;
  }
  function syncKeys(root = document) { root.querySelectorAll('.mini-key').forEach((key) => key.classList.toggle('armed', state.activeClips.has(Number(key.dataset.note)))); }

  function makeSamplerModule() {
    const body = `<div class="sampler-drop"><strong>Sampler lane</strong><span data-sample-status>Fallback synth active. Load a bank or record a pad.</span></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-sampler="load">LOAD BANK</button><button class="transport-btn" type="button" data-sampler="arm">ARM PAD</button><button class="transport-btn" type="button" data-sampler="resample">RESAMPLE FX</button></div>`;
    const mod = makeModule('sample assignment bay', body, 'LOAD BANK preloads mapped audio when files exist. ARM PAD selects the next triggered pad as recorder target.');
    mod.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-sampler]')?.dataset.sampler;
      if (action === 'load') { event.target.classList.add('on'); await loadSampleBank(); event.target.classList.remove('on'); updateSampleStatus(); }
      if (action === 'arm') { state.selectedPad = state.lastPad?.index ?? state.selectedPad; event.target.classList.toggle('on'); updateSampleStatus(); }
      if (action === 'resample') repeatBurst(2, 6);
    });
    updateSampleStatus(); return mod;
  }

  function makeRecorderBay() {
    const body = `<div class="recorder-bay"><div><strong>Pad recorder</strong><span data-rec-status>Ready. Select pad ${state.selectedPad + 1}.</span></div><select data-rec-pad>${padEls.map((pad, i) => `<option value="${i}">${i + 1} · ${pad.textContent.trim()}</option>`).join('')}</select></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-rec="record">REC PAD</button><button class="transport-btn" type="button" data-rec="play">PLAY PAD</button><button class="transport-btn" type="button" data-rec="clear">CLEAR PAD</button></div>`;
    const mod = makeModule('mic-to-pad recorder', body, 'Records through the browser mic and assigns the take to the selected pad. Chrome/Android desktop works best.');
    mod.classList.add('recorder-module');
    const select = mod.querySelector('[data-rec-pad]');
    select.value = state.selectedPad;
    select.addEventListener('change', () => { state.selectedPad = Number(select.value); saveSession(); updateSampleStatus(); });
    mod.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-rec]')?.dataset.rec;
      if (action === 'record') await toggleRecord(event.target);
      if (action === 'play') triggerPad(state.selectedPad, true);
      if (action === 'clear') { state.recordedBuffers.delete(state.selectedPad); updateSampleStatus(); saveSession(); }
    });
    return mod;
  }

  async function toggleRecord(button) {
    ensureAudio();
    if (state.recorder.active) {
      state.recorder.mediaRecorder?.stop();
      button.textContent = 'REC PAD';
      button.classList.remove('on');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.recorder.stream = stream;
      state.recorder.chunks = [];
      const mediaRecorder = new MediaRecorder(stream);
      state.recorder.mediaRecorder = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) state.recorder.chunks.push(event.data); };
      mediaRecorder.onstop = async () => {
        state.recorder.active = false;
        stream.getTracks().forEach((track) => track.stop());
        try {
          const blob = new Blob(state.recorder.chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          const data = await blob.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data.slice(0));
          state.recordedBuffers.set(state.selectedPad, buffer);
          drawWaveform(buffer, state.selectedPad);
          updateSampleStatus(`Recorded pad ${state.selectedPad + 1}`);
          flashPad(padEls[state.selectedPad], 420);
        } catch (error) { updateSampleStatus('Recording decode failed. Try a shorter take.'); }
      };
      state.recorder.active = true;
      button.textContent = 'STOP REC';
      button.classList.add('on');
      mediaRecorder.start();
      updateSampleStatus(`Recording pad ${state.selectedPad + 1}...`);
    } catch (error) { updateSampleStatus('Mic blocked or unavailable.'); }
  }

  function updateSampleStatus(message = null) {
    const text = message || `${state.recordedBuffers.size} recorded · ${state.sampleBuffers.size} loaded · target pad ${state.selectedPad + 1}`;
    document.querySelectorAll('[data-sample-status],[data-rec-status]').forEach((el) => { el.textContent = text; });
    document.querySelectorAll('[data-rec-pad]').forEach((select) => { select.value = state.selectedPad; });
    padEls.forEach((pad, index) => {
      pad.classList.toggle('sample-loaded', state.sampleBuffers.has(index));
      pad.classList.toggle('sample-recorded', state.recordedBuffers.has(index));
    });
  }

  function flashSave(button) { const old = button.textContent; button.textContent = 'SAVED'; button.classList.add('on'); setTimeout(() => { button.textContent = old; button.classList.remove('on'); }, 700); }

  function hydratePads() {
    padEls.forEach((pad, index) => {
      pad.dataset.padIndex = String(index);
      pad.dataset.machineType = profile.type;
      pad.setAttribute('aria-pressed', 'false');
      if (profile.labels[index]) pad.textContent = profile.labels[index];
      pad.addEventListener('pointerdown', (event) => { event.preventDefault(); triggerPad(index); });
    });
  }

  function updateReadouts() {
    const set = (name, value) => document.querySelectorAll(`[data-readout="${name}"]`).forEach((el) => { el.textContent = value; });
    set('mode', profile.mode); set('bpm', Math.round(state.bpm)); set('quantize', state.quantize);
    const chokeButton = document.querySelector('[data-action="choke"]');
    if (chokeButton) { chokeButton.textContent = state.choke ? 'CHOKE ON' : 'CHOKE OFF'; chokeButton.classList.toggle('on', state.choke); }
    const playButton = document.querySelector('[data-action="play"]');
    if (playButton) playButton.classList.toggle('on', state.running);
    const volume = document.querySelector('[data-control="volume"]'); if (volume) volume.value = state.volume;
    const bpm = document.querySelector('[data-control="bpm"]'); if (bpm) bpm.value = state.bpm;
    document.body.classList.toggle('clock-running', state.running);
  }

  function drawWaveform(buffer, padIndex = 0) {
    const canvas = document.querySelector('.signal-scope');
    if (!canvas || !buffer) return;
    const context = canvas.getContext('2d');
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / canvas.width));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#071019';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00e5ff';
    context.lineWidth = 3;
    context.beginPath();
    for (let x = 0; x < canvas.width; x += 1) {
      let min = 1;
      let max = -1;
      for (let j = 0; j < step; j += 1) {
        const value = data[(x * step) + j] || 0;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      context.moveTo(x, (1 + min) * canvas.height / 2);
      context.lineTo(x, (1 + max) * canvas.height / 2);
    }
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,.82)';
    context.font = '700 24px Arial Narrow, Arial, sans-serif';
    context.fillText(`PAD ${padIndex + 1}`, 18, 34);
  }

  function drawSyntheticWave(padIndex = 0) {
    const canvas = document.querySelector('.signal-scope');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#071019';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00e5ff';
    context.lineWidth = 3;
    context.beginPath();
    for (let x = 0; x < width; x += 6) {
      const y = height / 2 + Math.sin((x * 0.025) + padIndex) * (12 + padIndex * 4) + Math.sin(x * 0.11) * 9;
      if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  }

  function drawScopeLoop() {
    const canvas = document.querySelector('.signal-scope');
    if (!canvas || canvas.dataset.looping) return;
    canvas.dataset.looping = 'true';
    const context = canvas.getContext('2d');
    const bins = new Uint8Array(128);
    const draw = () => {
      if (analyser && ctx) {
        analyser.getByteTimeDomainData(bins);
        context.fillStyle = 'rgba(7,16,25,.22)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00e5ff';
        context.lineWidth = 2;
        context.beginPath();
        bins.forEach((value, i) => {
          const x = (i / (bins.length - 1)) * canvas.width;
          const y = (value / 255) * canvas.height;
          if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.stroke();
      } else if (state.scopeEnergy > 0) {
        state.scopeEnergy *= 0.96;
      }
      requestAnimationFrame(draw);
    };
    drawSyntheticWave(0);
    requestAnimationFrame(draw);
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const index = keyMap.indexOf(key);
      if (index > -1 && padEls[index % padEls.length]) { event.preventDefault(); triggerPad(index % padEls.length); }
      if (key === ' ') { event.preventDefault(); state.running ? stopClock() : startClock(); }
      if (key === 'escape') { stopClock(); chokeAll(); }
    });
  }

  async function initMidi() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const midi = await navigator.requestMIDIAccess();
      state.midiReady = true;
      const noteMap = new Map([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51].map((note, index) => [note, index % Math.max(1, padEls.length)]));
      const handle = (message) => {
        const [status, note, velocity] = message.data;
        const command = status & 0xf0;
        if ((command === 0x90 && velocity > 0) && noteMap.has(note)) triggerPad(noteMap.get(note));
        if (command === 0xb0) {
          if (note === 1) state.bpm = clamp(60 + Math.round((velocity / 127) * 130), 60, 190);
          if (note === 7) state.volume = clamp(velocity / 127, 0, 1);
          if (note === 74) state.macros.filter = velocity / 127;
          if (note === 71) state.macros.delay = velocity / 127;
          ensureAudio(); applyMacros(); updateReadouts(); saveSession();
        }
      };
      midi.inputs.forEach((input) => { input.onmidimessage = handle; });
      midi.onstatechange = () => midi.inputs.forEach((input) => { input.onmidimessage = handle; });
      document.body.classList.add('midi-ready');
    } catch (error) { state.midiReady = false; }
  }

  function boot() {
    if (!isMachinePage) return;
    loadSession(); hydratePads(); injectTransport(); injectMachineModule(); bindKeyboard(); initMidi(); updateReadouts();
    syncSequencerUI(); syncClips(); syncKeys(); syncMacros(); updateSampleStatus(); loadSampleBank();
    document.body.classList.add('beargrid-core-ready');
  }

  boot();
})();
