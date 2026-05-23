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

## Machine modules

- Drum Machine: 16-step sequencer with seed/four-on-floor controls
- Kaossilator Pro: XY synth surface with latch and center controls
- The Choppa: waveform slice strip with stutter/reverse/scatter actions
- Launcha / Looping Drum Loops: quantized clip launcher
- Master FX / FX machines: filter, delay, crush, and pump macro controls
- Synth/Bass/FM/Chord machines: mini key row with arp-hold behavior
- Sampla: sampler assignment bay staged for recorder/sample loading

## Controls

- Pads: click, touch, or keyboard 1-8
- Transport: Space toggles play/stop
- Panic stop: Escape
- MIDI: Launchkey Mini pad note range C2-D#3 is mapped when Web MIDI is available

## Architecture

```text
index.html
machines/*.html
assets/css/beargrid-machines.css
assets/js/machine.js
manifest.json
service-worker.js
```

The machine pages stay lightweight. The shared core reads `body[data-machine]`, applies the right machine profile, injects the correct module, and keeps timing/audio/session behavior consistent across the full grid.

## Next best upgrades

1. Real WAV sample bank loader
2. Waveform renderer for sample/chop pages
3. Mic recorder with assign-to-pad flow
4. Launchkey visual hardware mirror
5. Deeper FX routing buses
6. Optional WASM DSP core later

MATTBEAR · Chaos into signal · bearicide.github.io
