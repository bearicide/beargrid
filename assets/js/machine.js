(() => {
  'use strict';

  const MACHINE = document.body.dataset.machine || 'beargrid-machine';
  const STORAGE_KEY = `mattbear-beargrid-session-${MACHINE}`;
  const GLOBAL_KEY = 'mattbear-beargrid-global-session';
  const padEls = Array.from(document.querySelectorAll('.pad'));

  const state = {
    bpm: 120,
    quantize: '1/4',
    choke: true,
    swing: 0,
    volume: 0.78,
    running: false,
    currentStep: 0,
    activeSources: new Map(),
    midiReady: false,
    lastPad: null,
    scheduledLookaheadMs: 25,
    scheduleAheadSec: 0.12,
    nextStepTime: 0,
    timerId: null
  };

  const MACHINE_PROFILES = {
    'drum-machine': { mode: 'DRUM', base: 80, type: 'drum', labels: ['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Tom', 'Rim', 'Crash', 'Perc'] },
    'kaossilator-pro': { mode: 'XY SYNTH', base: 180, type: 'synth', labels: ['Bass X', 'Lead Y', 'Gate', 'Sweep', 'Hold', 'Scale', 'FX Send', 'Latch'] },
    'op-1': { mode: 'TAPE SYNTH', base: 220, type: 'synth', labels: ['Tape A', 'Tape B', 'Synth', 'Drum', 'Lift', 'Drop', 'Punch', 'Album'] },
    orchid: { mode: 'CHORD', base: 196, type: 'chord', labels: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'Bloom'] },
    reese: { mode: 'BASS', base: 55, type: 'bass', labels: ['Sub', 'Reese', 'Growl', 'Wobble', 'Cut', 'Drive', 'Octave', 'Glide'] },
    'looping-drum-loops': { mode: 'LOOP', base: 100, type: 'loop', labels: ['Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Fill', 'Break', 'Ride', 'Drop'] },
    'the-choppa': { mode: 'CHOP', base: 140, type: 'chop', labels: ['Slice 1', 'Slice 2', 'Slice 3', 'Slice 4', 'Stutter', 'Reverse', 'Gate', 'Scatter'] },
    sampla: { mode: 'SAMPLER', base: 130, type: 'sample', labels: ['One', 'Shot', 'Vox', 'Hit', 'Texture', 'Rise', 'Drop', 'Resample'] },
    launcha: { mode: 'LAUNCH', base: 120, type: 'loop', labels: ['Clip A', 'Clip B', 'Clip C', 'Clip D', 'Scene', 'Stop', 'Mute', 'Arm'] },
    'mono-station': { mode: 'MONO', base: 90, type: 'bass', labels: ['Osc 1', 'Osc 2', 'Filter', 'Env', 'LFO', 'Drive', 'Seq', 'Accent'] },
    mellotron: { mode: 'TAPE', base: 165, type: 'chord', labels: ['Choir', 'Flute', 'Strings', 'Cello', 'Tape Warble', 'Wow', 'Flutter', 'Dust'] },
    'bit-crusher': { mode: 'CRUSH', base: 210, type: 'fx', labels: ['8 Bit', '4 Bit', 'Fold', 'Rate', 'Noise', 'Down', 'Alias', 'Crush'] },
    'fm-station': { mode: 'FM', base: 240, type: 'fm', labels: ['Carrier', 'Mod', 'Ratio', 'Bell', 'Metal', 'Stack', 'Index', 'Feedback'] },
    'delay-station': { mode: 'DELAY', base: 150, type: 'fx', labels: ['Delay 1', 'Delay 2', 'Ping', 'Pong', 'Dub', 'Freeze', 'Feedback', 'Throw'] },
    'filter-station': { mode: 'FILTER', base: 170, type: 'fx', labels: ['Low', 'High', 'Band', 'Notch', 'Sweep', 'Res', 'Open', 'Close'] },
    'master-fx': { mode: 'MASTER FX', base: 200, type: 'fx', labels: ['Punch', 'Wide', 'Pump', 'Gate', 'Crush', 'Delay', 'Filter', 'Kill'] }
  };

  const profile = MACHINE_PROFILES[MACHINE] || { mode: 'LIVE', base: 160, type: 'synth', labels: [] };
  let ctx;
  let master;
  let filter;
  let delay;
  let delayGain;
  let compressor;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ensureAudio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      filter = ctx.createBiquadFilter();
      delay = ctx.createDelay(1.5);
      delayGain = ctx.createGain();
      compressor = ctx.createDynamicsCompressor();

      master.gain.value = state.volume;
      filter.type = 'lowpass';
      filter.frequency.value = 16000;
      filter.Q.value = 0.7;
      delay.delayTime.value = 0.18;
      delayGain.gain.value = 0.12;

      filter.connect(compressor);
      compressor.connect(master);
      filter.connect(delay);
      delay.connect(delayGain);
      delayGain.connect(compressor);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function beatSeconds() {
    return 60 / state.bpm;
  }

  function quantizeSeconds() {
    const beat = beatSeconds();
    return state.quantize === '1/8' ? beat / 2 : state.quantize === '1/16' ? beat / 4 : beat;
  }

  function nextQuantizedTime() {
    ensureAudio();
    const grid = quantizeSeconds();
    const now = ctx.currentTime;
    return Math.ceil((now + 0.015) / grid) * grid;
  }

  function clearSource(id) {
    const source = state.activeSources.get(id);
    if (!source) return;
    try {
      if (source.gain) {
        source.gain.gain.cancelScheduledValues(ctx.currentTime);
        source.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.025);
      }
      setTimeout(() => {
        try { source.stopper && source.stopper(); } catch (error) {}
      }, 80);
    } catch (error) {}
    state.activeSources.delete(id);
  }

  function chokeAll(exceptId = null) {
    if (!ctx) return;
    for (const id of Array.from(state.activeSources.keys())) {
      if (id !== exceptId) clearSource(id);
    }
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

  function connectVoice(output, gain, when, length, padIndex) {
    const localFilter = ctx.createBiquadFilter();
    const fxAmount = profile.type === 'fx' ? 0.38 : 0.12;
    localFilter.type = padIndex % 2 ? 'bandpass' : 'lowpass';
    localFilter.frequency.setValueAtTime(600 + padIndex * 320, when);
    localFilter.Q.value = 0.8 + padIndex * 0.08;
    output.connect(localFilter).connect(gain).connect(filter);
    if (fxAmount > 0.2) delayGain.gain.setTargetAtTime(fxAmount, when, 0.03);
  }

  function playEnginePad(padIndex, when) {
    ensureAudio();
    const id = `pad-${padIndex}`;
    if (state.choke) chokeAll(id);

    const gain = ctx.createGain();
    const base = profile.base + padIndex * 37;
    let length = 0.24;
    let stopper = null;

    if (profile.type === 'drum') {
      if (padIndex === 0) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.15);
        length = 0.22;
        connectVoice(osc, gain, when, length, padIndex);
        envelope(gain, when, length, 0.95);
        osc.start(when); osc.stop(when + length + 0.04);
        stopper = () => osc.stop();
      } else if (padIndex === 1 || padIndex === 3) {
        const noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(0.22);
        length = 0.2;
        connectVoice(noise, gain, when, length, padIndex);
        envelope(gain, when, length, 0.55);
        noise.start(when); noise.stop(when + length + 0.04);
        stopper = () => noise.stop();
      } else {
        const noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(0.09);
        length = 0.08;
        connectVoice(noise, gain, when, length, padIndex);
        envelope(gain, when, length, 0.35);
        noise.start(when); noise.stop(when + length + 0.03);
        stopper = () => noise.stop();
      }
    } else if (profile.type === 'loop' || profile.type === 'chop' || profile.type === 'sample') {
      const osc = ctx.createOscillator();
      osc.type = profile.type === 'chop' ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(base, when);
      if (profile.type === 'chop') osc.frequency.setTargetAtTime(base * 1.5, when + 0.04, 0.03);
      length = profile.type === 'loop' ? quantizeSeconds() * 1.85 : 0.32;
      connectVoice(osc, gain, when, length, padIndex);
      envelope(gain, when, length, 0.58);
      osc.start(when); osc.stop(when + length + 0.05);
      stopper = () => osc.stop();
    } else if (profile.type === 'chord') {
      const ratios = [1, 1.25, 1.5];
      const oscs = ratios.map((ratio) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(base * ratio, when);
        connectVoice(osc, gain, when, 0.72, padIndex);
        osc.start(when); osc.stop(when + 0.78);
        return osc;
      });
      length = 0.72;
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
      modGain.gain.value = 80 + padIndex * 18;
      mod.connect(modGain).connect(carrier.frequency);
      length = 0.46;
      connectVoice(carrier, gain, when, length, padIndex);
      envelope(gain, when, length, 0.52);
      mod.start(when); carrier.start(when);
      mod.stop(when + length + 0.05); carrier.stop(when + length + 0.05);
      stopper = () => { mod.stop(); carrier.stop(); };
    } else {
      const osc = ctx.createOscillator();
      osc.type = profile.type === 'bass' ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(base, when);
      length = profile.type === 'bass' ? 0.42 : 0.28;
      connectVoice(osc, gain, when, length, padIndex);
      envelope(gain, when, length, 0.62);
      osc.start(when); osc.stop(when + length + 0.05);
      stopper = () => osc.stop();
    }

    state.activeSources.set(id, { gain, stopper });
    window.setTimeout(() => state.activeSources.delete(id), Math.ceil((length + 0.15) * 1000));
  }

  function flashPad(pad, ms = 160) {
    pad.classList.add('on');
    pad.setAttribute('aria-pressed', 'true');
    setTimeout(() => {
      pad.classList.remove('on');
      pad.setAttribute('aria-pressed', 'false');
    }, ms);
  }

  function triggerPad(index, immediate = false) {
    const pad = padEls[index];
    if (!pad) return;
    ensureAudio();
    const when = immediate ? ctx.currentTime + 0.006 : nextQuantizedTime();
    playEnginePad(index, when);
    window.setTimeout(() => flashPad(pad), Math.max(0, (when - ctx.currentTime) * 1000));
    state.lastPad = { machine: MACHINE, index, label: pad.textContent.trim(), at: new Date().toISOString() };
    saveSession();
    updateReadouts();
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function scheduler() {
    if (!state.running || !ctx) return;
    while (state.nextStepTime < ctx.currentTime + state.scheduleAheadSec) {
      pulseStep(state.currentStep, state.nextStepTime);
      const stepLength = beatSeconds() / 4;
      state.nextStepTime += stepLength;
      state.currentStep = (state.currentStep + 1) % 16;
    }
  }

  function pulseStep(step, when) {
    document.documentElement.style.setProperty('--beat-step', step);
    const light = document.querySelector('[data-readout="step"]');
    if (light) light.textContent = String(step + 1).padStart(2, '0');
    if (step % 4 === 0) {
      const clickGain = ctx.createGain();
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.value = step === 0 ? 1200 : 820;
      clickGain.gain.setValueAtTime(0.0001, when);
      clickGain.gain.exponentialRampToValueAtTime(0.025, when + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
      click.connect(clickGain).connect(master);
      click.start(when);
      click.stop(when + 0.04);
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

  function saveSession() {
    try {
      const payload = {
        bpm: state.bpm,
        quantize: state.quantize,
        choke: state.choke,
        swing: state.swing,
        volume: state.volume,
        running: state.running,
        lastPad: state.lastPad,
        machine: MACHINE,
        profile: profile.mode,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(payload));
      localStorage.setItem('mattbear-beargrid-last-pad', JSON.stringify(state.lastPad));
    } catch (error) {}
  }

  function loadSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      ['bpm', 'quantize', 'choke', 'swing', 'volume', 'lastPad'].forEach((key) => {
        if (saved[key] !== undefined) state[key] = saved[key];
      });
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
      saveSession();
      updateReadouts();
    });
    transport.addEventListener('change', (event) => {
      if (event.target.dataset.control === 'quantize') state.quantize = event.target.value;
      saveSession();
      updateReadouts();
    });
  }

  function flashSave(button) {
    const old = button.textContent;
    button.textContent = 'SAVED';
    button.classList.add('on');
    setTimeout(() => { button.textContent = old; button.classList.remove('on'); }, 700);
  }

  function hydratePads() {
    padEls.forEach((pad, index) => {
      pad.dataset.padIndex = String(index);
      pad.dataset.machineType = profile.type;
      pad.setAttribute('aria-pressed', 'false');
      if (profile.labels[index]) pad.textContent = profile.labels[index];
      pad.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        triggerPad(index);
      });
    });
  }

  function updateReadouts() {
    const set = (name, value) => document.querySelectorAll(`[data-readout="${name}"]`).forEach((el) => { el.textContent = value; });
    set('mode', profile.mode);
    set('bpm', Math.round(state.bpm));
    set('quantize', state.quantize);
    const chokeButton = document.querySelector('[data-action="choke"]');
    if (chokeButton) {
      chokeButton.textContent = state.choke ? 'CHOKE ON' : 'CHOKE OFF';
      chokeButton.classList.toggle('on', state.choke);
    }
    const playButton = document.querySelector('[data-action="play"]');
    if (playButton) playButton.classList.toggle('on', state.running);
    document.body.classList.toggle('clock-running', state.running);
  }

  function bindKeyboard() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const index = keys.indexOf(key);
      if (index > -1 && padEls[index % padEls.length]) {
        event.preventDefault();
        triggerPad(index % padEls.length);
      }
      if (key === ' ') {
        event.preventDefault();
        state.running ? stopClock() : startClock();
      }
      if (key === 'escape') {
        stopClock();
        chokeAll();
      }
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
          updateReadouts();
          saveSession();
        }
      };
      midi.inputs.forEach((input) => { input.onmidimessage = handle; });
      midi.onstatechange = () => midi.inputs.forEach((input) => { input.onmidimessage = handle; });
      document.body.classList.add('midi-ready');
    } catch (error) {
      state.midiReady = false;
    }
  }

  function boot() {
    loadSession();
    hydratePads();
    injectTransport();
    bindKeyboard();
    initMidi();
    updateReadouts();
    document.body.classList.add('beargrid-core-ready');
  }

  boot();
})();
