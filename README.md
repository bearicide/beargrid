# MATTBEAR - BearGrid Machines

BearGrid is a browser-native MATTBEAR music-machine hub: sixteen linked machine pages sharing one performance core.

## Current build

This build turns the grid into a shared instrument system with per-machine pages, bigger readable controls, local sample memory, and PWA cache support.

Built in:

- shared WebAudio engine
- BPM transport clock
- quantized pad scheduling
- global choke mode
- machine-specific pad profiles
- session save/load through localStorage
- Web MIDI hooks for Launchkey-style pad input
- offline/PWA shell
- larger touch-friendly control surface
- clearer pad-memory instructions and status messages
- reactive module UI
- live signal scope canvas
- sample-bank manifest loader
- local audio file assignment to pads
- browser-side pad memory through IndexedDB
- virtual sample-bank bridge through the service worker
- restored local samples after reload
- mic-to-pad capture flow
- recorded-pad playback fallback

## Quick start

1. Open `index.html` or the GitHub Pages site.
2. Pick a machine.
3. Tap pads or use keyboard keys `1-8`.
4. Use `PLAY` to start the clock.
5. Set `BPM`, `Volume`, and `Quantize`.
6. Use `CHOKE ON` for tight one-sound-at-a-time behavior.
7. Use `Escape` for panic stop.

## Pad memory instructions

Pad Memory lets you put your own local audio file on a pad.

1. Pick the pad slot from the Pad Memory dropdown.
2. Choose a local audio file such as WAV, MP3, M4A, WEBM, or another browser-supported audio file.
3. The file is saved only inside that browser/device through IndexedDB.
4. `QUEUE / PLAY` waits for the quantize grid, so the sample lands on time.
5. Reload once after importing a new file if you want the service-worker virtual bank to feed the sample into the normal engine bank path.
6. Use `CLEAR PAD` to remove the saved local sample from that pad, then reload to fully clear virtual-bank mode.

Privacy note: local pad-memory files are not uploaded anywhere by this build. They stay in the browser storage for that device/profile.

## Machine modules

- Drum Machine: 16-step sequencer with seed/four-on-floor controls
- Kaossilator Pro: XY synth surface with latch and center controls
- OP-1: tape-synth sketchbox style page
- Orchid: chord and melody control page
- Reese: bass synth control page
- Looping Drum Loops: loop launcher page
- The Choppa: waveform slice strip with stutter/reverse/scatter actions
- Sampla: sample assignment bay with bank loading and pad capture controls
- Launcha: quantized clip launcher page
- Mono Station: single-voice synth page
- Mellotron: tape-style sample/synth page
- Bit Crusher: lo-fi texture and FX page
- FM Station: FM synth page
- Delay Station: delay FX page
- Filter Station: cutoff/resonance/mode/drive page
- Master FX: final multi-FX performance page

## Controls

- Pads: click, touch, or keyboard 1-8
- Transport: Space toggles play/stop
- Panic stop: Escape
- MIDI: Launchkey Mini pad note range C2-D#3 is mapped when Web MIDI is available
- Pad capture: choose a target pad, press REC PAD, stop, then PLAY PAD
- Local pad memory: choose a local audio file for a pad; the browser stores and restores it locally

## Sample bank path

```text
assets/audio/kits/basement-thunder/kit.json
assets/audio/kits/basement-thunder/kick.wav
assets/audio/kits/basement-thunder/snare.wav
assets/audio/kits/basement-thunder/hat.wav
assets/audio/kits/basement-thunder/clap.wav
assets/audio/kits/basement-thunder/perc.wav
assets/audio/kits/basement-thunder/bass.wav
assets/audio/kits/basement-thunder/vox.wav
assets/audio/kits/basement-thunder/fx.wav
```

The JSON manifest is wired. If WAV files are not present, the shared synth fallback keeps all machines playable.

## Architecture

```text
index.html
machines/*.html
assets/css/beargrid-machines.css
assets/js/machine.js
assets/js/pad-memory.js
assets/audio/kits/basement-thunder/kit.json
manifest.json
service-worker.js
```

The machine pages stay lightweight. The shared core reads `body[data-machine]`, applies the right machine profile, injects the correct module, and keeps timing/audio/session behavior consistent across the full grid. `pad-memory.js` adds local file assignment and IndexedDB storage. `service-worker.js` can expose saved pad-memory files as a virtual sample bank so reloaded pages can ingest local pads through the normal sample-bank route.

## Current maintenance notes

- Service worker cache: `beargrid-v1.2.4-readable-qol`
- Live machine pages load both `machine.js` and `pad-memory.js`
- Main CSS scaled for larger readable controls and mobile touch comfort
- Pad Memory panel has inline instructions and clearer status messages
- Existing archived machine-page copies under `MATTBEAR - BearGrid Machine Pages/` may remain as historical exports

## Next best upgrades

1. Add Launchkey visual hardware mirror
2. Add clear per-pad loop length controls
3. Add deeper FX routing buses
4. Add a compact admin/edit panel for live page tuning
5. Add export/import for saved pad-memory kits
6. Add actual WAV files into the Basement Thunder folder for a built-in starter kit

MATTBEAR · Chaos into signal · bearicide.github.io
