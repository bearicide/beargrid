(() => {
  'use strict';

  const machine = document.body.dataset.machine || 'beargrid-machine';
  const pads = Array.from(document.querySelectorAll('.pad'));
  const panel = document.querySelector('.panel');
  if (!panel || !pads.length) return;

  const dbName = 'beargrid-pad-memory';
  const storeName = 'pads';
  const buffers = new Map();
  let ctx;
  let master;

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
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

  async function save(index, arrayBuffer, name) {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ arrayBuffer, name, time: Date.now() }, key(index));
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
    box.innerHTML = `<div class="module-head"><strong>Pad memory</strong><span>LOCAL</span></div>
      <div class="pad-memory-box"><strong>Choose a local sound</strong><span>Saved to this browser and overrides the selected pad.</span></div>
      <div class="pad-memory-row"><select data-pad-memory-target>${pads.map((pad, i) => `<option value="${i}">${i + 1} · ${pad.textContent.trim()}</option>`).join('')}</select><input data-pad-memory-file type="file" accept="audio/*"></div>
      <div class="module-actions"><button class="transport-btn" type="button" data-pad-memory="play">PLAY</button><button class="transport-btn" type="button" data-pad-memory="clear">CLEAR</button></div>
      <p class="machine-hint" data-pad-memory-status>Ready for local pad samples.</p>`;
    const status = panel.querySelector('.status');
    if (status) status.before(box); else panel.appendChild(box);
    return box;
  }

  function status(text) {
    document.querySelectorAll('[data-pad-memory-status]').forEach((el) => { el.textContent = text; });
  }

  async function importFile(file, index) {
    audio();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      buffers.set(index, decoded);
      await save(index, arrayBuffer, file.name);
      mark();
      status(`Loaded ${file.name} on pad ${index + 1}`);
      play(index);
    } catch (error) {
      status('That sound could not be decoded.');
    }
  }

  function play(index) {
    const buffer = buffers.get(index);
    if (!buffer) {
      status(`No local sound on pad ${index + 1}`);
      return false;
    }
    audio();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.min(buffer.duration, 4));
    source.connect(gain).connect(master);
    source.start();
    source.stop(ctx.currentTime + Math.min(buffer.duration, 4.05));
    pads[index]?.classList.add('on');
    setTimeout(() => pads[index]?.classList.remove('on'), 160);
    return true;
  }

  function mark() {
    pads.forEach((pad, index) => pad.classList.toggle('local-pad', buffers.has(index)));
  }

  async function restore() {
    audio();
    await Promise.all(pads.map(async (_, index) => {
      const item = await load(index);
      if (!item?.arrayBuffer) return;
      try {
        const decoded = await ctx.decodeAudioData(item.arrayBuffer.slice(0));
        buffers.set(index, decoded);
      } catch (error) {}
    }));
    mark();
    if (buffers.size) status(`${buffers.size} local pad sound${buffers.size === 1 ? '' : 's'} restored.`);
  }

  function styles() {
    const style = document.createElement('style');
    style.textContent = `.pad-memory{border-color:color-mix(in srgb,var(--green) 48%,var(--line));}.pad-memory-box{display:grid;gap:6px;place-items:center;min-height:96px;border:1px dashed var(--green);border-radius:18px;background:rgba(156,255,0,.06);padding:16px;text-align:center}.pad-memory-box strong{text-transform:uppercase;letter-spacing:.08em}.pad-memory-box span{color:var(--muted)}.pad-memory-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.pad-memory-row select,.pad-memory-row input{width:100%;min-height:44px;border:1px solid var(--line);border-radius:14px;background:#0c1018;color:var(--ink);padding:8px 10px;font-weight:900}.pad.local-pad::before{content:'LOCAL';position:absolute;right:7px;top:7px;z-index:4;font-size:.56rem;border:1px solid var(--green);border-radius:999px;padding:2px 5px;color:var(--green);background:rgba(0,0,0,.68)}@media(max-width:520px){.pad-memory-row{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  styles();
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
    if (action === 'play') play(index);
    if (action === 'clear') {
      buffers.delete(index);
      await remove(index);
      mark();
      status(`Cleared pad ${index + 1}`);
    }
  });

  pads.forEach((pad, index) => {
    pad.addEventListener('pointerdown', (event) => {
      if (!buffers.has(index)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      play(index);
    }, true);
  });

  restore();
})();
