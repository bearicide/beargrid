(() => {
  'use strict';

  const machine = document.body.dataset.machine || 'beargrid-machine';
  const pads = Array.from(document.querySelectorAll('.pad'));
  const panel = document.querySelector('.panel');
  if (!panel || !pads.length || !window.indexedDB) return;

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

  function makeUi() {
    const box = document.createElement('section');
    box.className = 'machine-module pad-memory';
    box.innerHTML = `<div class="module-head"><strong>Pad memory</strong><span>QUANTIZED LOCAL</span></div>
      <div class="pad-memory-box"><strong>Load your own sound</strong><span>Pick a pad, choose an audio file, then BearGrid saves it inside this browser. It queues to the beat grid and survives reloads.</span></div>
      <ol class="pad-memory-steps"><li><b>1 · Pick pad</b>Select the pad slot you want to replace.</li><li><b>2 · Choose file</b>Load WAV, MP3, M4A, WEBM, or another browser-supported audio file.</li><li><b>3 · Play locked</b>QUEUE / PLAY waits for the quantize grid instead of firing sloppy.</li><li><b>4 · Reload</b>After reload, saved pads feed the virtual kit bank for engine playback.</li></ol>
      <div class="pad-memory-row"><select aria-label="Pad memory target pad" data-pad-memory-target>${pads.map((pad, i) => `<option value="${i}">${i + 1} · ${pad.textContent.trim()}</option>`).join('')}</select><input aria-label="Choose local audio file" data-pad-memory-file type="file" accept="audio/*"></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-pad-memory="play">QUEUE / PLAY</button><button class="transport-btn" type="button" data-pad-memory="clear">CLEAR PAD</button></div>
      <p class="machine-hint" data-pad-memory-status>Ready. Loaded files stay local to this browser/device.</p>`;
    const status = panel.querySelector('.status');
    if (status) status.before(box); else panel.appendChild(box);
    sharedStatus = box.querySelector('[data-pad-memory-status]');
    return box;
  }

  function status(text) {
    if (sharedStatus) sharedStatus.textContent = text;
    document.querySelectorAll('[data-pad-memory-status]').forEach((el) => { el.textContent = text; });
  }

  async function importFile(file, index) {
    audio();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      buffers.set(index, decoded);
      await save(index, arrayBuffer, file.name, file.type || '');
      mark();
      status(`Loaded ${file.name} on pad ${index + 1}. It is saved locally; reload once for full virtual-bank engine ingest.`);
      play(index, false);
    } catch (error) {
      status('That sound could not be decoded. Try WAV, MP3, M4A, or a shorter file.');
    }
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

  function chokeAll(exceptId = null) {
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

  function play(index, immediate = false) {
    const buffer = buffers.get(index);
    if (!buffer) {
      status(`No local sound on pad ${index + 1}. Choose a file first.`);
      return false;
    }
    audio();
    const when = immediate ? ctx.currentTime + 0.006 : nextGridTime();
    const id = `local-${index}`;
    const session = readSession();
    if (session.choke !== false) chokeAll(id);

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
    activeSources.set(id, { source, gain });
    setTimeout(() => activeSources.delete(id), Math.ceil((maxLength + 0.15) * 1000));
    flash(index, when);
    status(`Pad ${index + 1} queued on ${session.quantize || '1/4'} grid. Choke ${session.choke === false ? 'off' : 'on'}.`);
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
    if (buffers.size) status(`${buffers.size} saved local pad sound${buffers.size === 1 ? '' : 's'} restored. Reload once after new imports for full engine-bank mode.`);
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
      status(`Cleared pad ${index + 1}. Reload to remove it from virtual-bank mode.`);
    }
  });

  pads.forEach((pad, index) => {
    pad.addEventListener('pointerdown', (event) => {
      if (!buffers.has(index)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      play(index, false);
    }, true);
  });

  restore();
})();
