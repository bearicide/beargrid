# MATTBEAR - BearGrid Machines

BearGrid is a browser-native MATTBEAR music-machine hub: sixteen linked machine pages sharing one performance core.

## Current build

This build turns the grid into a shared instrument system with per-machine pages, local sample memory, and PWA cache support.

Built in:

- shared WebAudio engine
- BPM transport clock
- quantized pad scheduling
- global choke mode
- machine-specific pad profiles
- session save/load through localStorage
- Web MIDI hooks for Launchkey-style pad input
- offline/PWA shell
- reactive module UI
- live signal scope canvas
- sample-bank manifest loader
- local audio file assignment to pads
- browser-side pad memory through IndexedDB
- restored local samples after reload
- mic-to-pad capture flow
- recorded-pad playback fallback
- service worker cache bumped for pad-memory delivery

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

The machine pages stay lightweight. The shared core reads `body[data-machine]`, applies the right machine profile, injects the correct module, and keeps timing/audio/session behavior consistent across the full grid. `pad-memory.js` adds local file assignment and IndexedDB storage without replacing the shared engine.

## Current maintenance notes

- Service worker cache: `beargrid-v1.2.0-pad-memory`
- Live machine pages load both `machine.js` and `pad-memory.js`
- Filter Station labels restored after emergency wiring pass
- Existing archived machine-page copies under `MATTBEAR - BearGrid Machine Pages/` may remain as historical exports

## Next best upgrades

1. Drop actual WAV files into the Basement Thunder folder
2. Add Launchkey visual hardware mirror
3. Integrate local pad memory deeper into the core quantized engine
4. Add clear per-pad loop length controls
5. Add deeper FX routing buses
6. Add a compact admin/edit panel for live page tuning

MATTBEAR · Chaos into signal · bearicide.github.io
