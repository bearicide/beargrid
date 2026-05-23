# MATTBEAR - BearGrid Machines

BearGrid is a browser-native MATTBEAR music-machine hub: sixteen machine pages sharing one performance core.

## Current build

This pass upgrades the repo from static machine pages into a shared instrument system.

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
- mic-to-pad capture flow
- recorded-pad playback fallback

## Machine modules

- Drum Machine: 16-step sequencer with seed/four-on-floor controls
- Kaossilator Pro: XY synth surface with latch and center controls
- The Choppa: waveform slice strip with stutter/reverse/scatter actions
- Launcha / Looping Drum Loops: quantized clip launcher
- Master FX / FX machines: filter, delay, crush, and pump macro controls
- Synth/Bass/FM/Chord machines: mini key row with arp-hold behavior
- Sampla: sample assignment bay with bank loading and pad capture controls

## Controls

- Pads: click, touch, or keyboard 1-8
- Transport: Space toggles play/stop
- Panic stop: Escape
- MIDI: Launchkey Mini pad note range C2-D#3 is mapped when Web MIDI is available
- Pad capture: choose a target pad, press REC PAD, stop, then PLAY PAD

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

The JSON manifest is already wired. If the WAV files are not present, the shared synth fallback keeps all machines playable.

## Architecture

```text
index.html
machines/*.html
assets/css/beargrid-machines.css
assets/js/machine.js
assets/audio/kits/basement-thunder/kit.json
manifest.json
service-worker.js
```

The machine pages stay lightweight. The shared core reads `body[data-machine]`, applies the right machine profile, injects the correct module, and keeps timing/audio/session behavior consistent across the full grid.

## Next best upgrades

1. Drop actual WAV files into the Basement Thunder folder
2. Add drag-and-drop local sample assignment
3. Add persistent IndexedDB storage for recorded pads
4. Launchkey visual hardware mirror
5. Deeper FX routing buses
6. Optional WASM DSP core later

MATTBEAR · Chaos into signal · bearicide.github.io
