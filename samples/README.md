# BearGrid Sample Pack Layer

This folder documents BearGrid's sample-source layer.

## Current status

BearGrid now has a working starter audio layer through `service-worker.js`.

When a machine requests:

```text
assets/audio/kits/basement-thunder/kit.json
```

the service worker returns a virtual 16-pad bank. Pads 1-8 are wired to real Kenney `.ogg` sounds from public raw GitHub mirrors:

```text
Kick  = Kenney Impact sound
Snare = Kenney Impact sound
Hat   = Kenney Casino chip sound
Clap  = Kenney Casino chip sound
Perc  = Kenney Impact sound
Bass  = Kenney Sci-fi engine sound
Vox   = Kenney Casino chips-stack sound
FX    = Kenney Digital laser sound
```

Local Pad Memory samples override any starter slot after the user saves a local file in the browser.

## Why this folder still exists

This folder is for future organized sample-pack work, including vendor-copying files directly into the repo when binary transfer is available.

Recommended future local structure:

```text
samples/
  drums/
  loops/
  synths/
  bass/
  glitch/
  drones/
  fx/
```

## Machine mapping

- Drum Machine → processed drum hits and one-shots
- Looping Drum Loops → loop-ready rhythmic material
- OP-1 → synth and sampler material
- Kaossilator Pro → synth + FX loops
- Orchid → melodic / generative textures
- Reese → bass layers
- The Choppa → glitch textures and chop-ready loops
- Sampla → one-shots / sampler material
- Launcha → tempo-labeled clips
- Mono Station → mono synth bass/lead material
- Mellotron → tape-ish keys, pads, and textures
- Bit Crusher → glitch textures
- FM Station → FM-style synths
- Delay Station → drones and ambience
- Filter Station → drones and filtered textures
- Master FX → drones, glitches, risers, beds

## Next step

Vendor-copy the selected Kenney `.ogg` binaries into:

```text
assets/audio/kits/basement-thunder/
```

Then switch the virtual kit paths from raw GitHub URLs to local repo paths.
