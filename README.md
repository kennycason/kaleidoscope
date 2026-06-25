# Kaleidoscope

**▶ [Live demo: kennycason.com/kaleidoscope](https://kennycason.com/kaleidoscope/)**

A live, GPU-rendered mirror kaleidoscope. A triangle of mirrors is mathematically
identical to reflecting the plane across the triangle's three sides forever, which
tiles the whole plane. Instead of simulating bouncing light, the fragment shader does
the inverse: for every screen pixel it "folds" the coordinate back into the fundamental
triangle, then samples the background there. That's a per-pixel GPU operation, so it
runs at 60fps and the whole thing is effectively a real three-mirror scope you scroll a
background through.

## Gallery

<img src="screenshots/Kaleidoscope_Metroid_01.png" width="49%"/><img src="screenshots/Kaleidoscope_Metroid.png" width="49%"/>
<img src="screenshots/Kaleidoscope_Metroid_02.png" width="49%"/><img src="screenshots/Kaleidoscope_Metroid_03.png" width="49%"/>
<img src="screenshots/Kaleidoscope_Metroid_04.png" width="49%"/><img src="screenshots/Kaleidoscope_Metroid_05.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_22_2026_1.png" width="49%"/><img src="screenshots/Kaleidoscope_June_22_2026_2.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_2.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_3.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_5.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_11.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_13.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_14.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_17.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_18.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_19.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_20.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_21.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_22.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_23.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_23_2026_24.png" width="49%"/><img src="screenshots/Kaleidoscope_June_23_2026_25.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026.png" width="49%"/><img src="screenshots/Kaleidoscope_June_24_2026_1.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026_2.png" width="49%"/><img src="screenshots/Kaleidoscope_June_24_2026_3.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026_4.png" width="49%"/><img src="screenshots/Kaleidoscope_June_24_2026_5.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026_6.png" width="49%"/><img src="screenshots/Kaleidoscope_June_24_2026_7.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026_9.png" width="49%"/><img src="screenshots/Kaleidoscope_June_24_2026_10.png" width="49%"/>
<img src="screenshots/Kaleidoscope_June_24_2026_11.png" width="49%"/>

## Run

```bash
npm install
npm run dev      # opens the printed http://localhost:6410
npm run build    # typecheck + production build into dist/
```

For a clean recording, hide the toolbar with `T` and/or use the browser's
fullscreen (F11 / ⌃⌘F).

## Controls

The entire UI is one **draggable toolbar** (drag its title bar to move it). Press
**`T`** to show/hide it — that's the only keyboard shortcut; everything else is
buttons, dropdowns, and knobs.

On the canvas:

- **drag** — pan the object chamber across the background
- **scroll wheel** — zoom in / out (multiplicative; the Zoom knob does the exact same thing)
- **drop image file(s)** — add them to the image library (remembered across reloads)

**Knobs** (the little dials):

- **drag up/down** to change the value; hold **Shift** for fine control. The Zoom
  knob is logarithmic, so turning it feels exactly like scrolling.
- **double-click** a knob to put *that one parameter* on auto — it evolves on its
  own slow LFO and the knob lights up **cyan**. Double-click again to stop.
- while global **Auto** is on, grabbing a knob **pins it to manual** (lights
  **amber**) so Auto won't overwrite your tweak; double-click to hand it back.

**Buttons** toggle effects (green = on). The **Lens** and **Shape** dropdowns each
have a **"🔄 Auto"** option that cycles them on their own (at a tweakable speed
knob). **⏸ Pause** freezes the animation on the current frame — handy for lining
up a **📷 Screenshot (PNG)**, which saves only the canvas at your window resolution.

Your full setup — every knob, toggle, dropdown, and which params are auto'd — is
saved to `localStorage` and restored on refresh. Pan, rotation, and palette start
fresh-random each load (so you get a new composition with *your* settings). **Reset**
restores factory defaults while keeping your images.

### Query params

- `?seed=<anything>` — reproduce a random start. Without it, every load opens on a
  different random view (shape, rotation, position, zoom, palette, segments…). The
  seed used is printed to the console (`[seed] …`); copy one you like into `?seed=`
  to get it back. All randomness routes through this seed.
- `?reset` — open with factory defaults, ignoring saved settings.
- `?clearImages` — wipe the saved image library from `localStorage`.

## Toolbar reference

- **Pause** — freeze / resume the animation clock.
- **Modes** — *Auto* (hands-free VJ mode, below) with a **rate** knob; *Spin* with a
  speed knob; *Drift* (slow auto-pan) with amount/speed knobs.
- **Zoom** — *zoom* level (log, = wheel) plus the *min* / *max* / *speed* used when
  zoom is auto'd.
- **Beat** — beat sync + *BPM* / *impact* knobs + *Tap tempo* button (below).
- **Effects** — *Warp* (funhouse domain ripple), *Glow* (neon mirror seams),
  *Lasers*, each with their tuning knobs.
- **Lens** — a pre-filter applied *before* the fold: off / fisheye / fly-eye /
  prism / swirl / tunnel / ripple / pinch / shatter / glass tiles, with *amount*
  and auto-cycle *speed*.
- **Shape** — the fold geometry: 8 mirror triangles (3 that tile cleanly + 5
  irregular), plus **mandala (N-fold)**, **spiral**, and **mirror box**, with a
  *segments* knob (for mandala/spiral) and auto-cycle *speed*.
- **Color** — *Hue* rotate (speed + static tint), *gradient map* (recolor by
  luminance through the palette bank), *saturation*, *contrast*, *posterize*,
  *solarize*.
- **Background** — toggle procedural plasma ↔ your image; *Img drift* roams the
  sample point across an image; *hold* auto-advances images every N seconds (0 =
  off); a thumbnail grid (click to select, 🗑 to delete the selected one).
- **Capture** — Screenshot (PNG), Record / Stop, Discard, Reset.

## Effects (how they work)

- **Shapes / folds** — the triangle fold reflects the plane across three mirror
  lines until the point lands in the fundamental triangle (the exact math of a
  3-mirror scope). The first three triangles tile the plane seamlessly; the
  irregular five don't, so the fold never fully converges and reads busier.
  **Mandala** folds the *angle* into one of N wedges (the classic round tube scope);
  **spiral** twists that by log-radius; **mirror box** reflects across a square grid.
- **Lasers** — beams defined as lines in *fundamental-domain space* (`dot(p, n) = c`).
  Tested against the folded point, the mirror reflections make each beam bounce off
  the walls and tile through the whole scope, in lock-step with the pattern. Each
  beam slowly rotates and sweeps; the glow is a crisp `fwidth` core plus a soft halo.
- **Lens** — distorts the screen coordinate *before* the fold, like a shaped front
  element (barrel, hex facets, chromatic prism, vortex swirl, log-polar tunnel,
  animated ripple, pinch, voronoi shatter, beveled glass tiles).
- **Warp** — a time-animated domain warp ripples the plane before folding, so the
  rigid tiling bulges and breathes like liquid mirror.
- **Neon glow** — lights the true mirror seams via each pixel's distance to the
  nearest fundamental-triangle edge (constant on-screen thickness at any zoom; only
  meaningful on the triangle folds).
- **Color** — hue rotates around the luminance axis; the **gradient map** remaps any
  source (images included) through the cosine-palette bank for vivid duotone/neon;
  plus saturation, contrast, posterize, and solarize.
- **Background** — a layered animated plasma (default, zero assets) that drifts
  continuously through a bank of 8 cosine palettes (~33s each), or any image you drop
  in (persisted to `localStorage`).

Every knob can be auto'd individually (double-click) — see Controls.

## Auto mode

Hands-free VJ autopilot for continual evolution — good for recording or leaving on
a screen. While active it:

- drives most parameters (warp, glow, hue, spin, zoom, image drift, lens amount,
  lasers, gradient map, saturation, contrast) from slow sine LFOs on distinct
  periods, so the motion never visibly repeats and effects breathe in and out;
- roams the sample point across the background on a layered Lissajous path;
- fires occasional discrete scene changes: switch shape, cycle the lens, change the
  laser count, vary the mandala segments, and (on an image background) cycle images;
- background follows your library: if any images are loaded it stays on them and
  cycles between them; with none, it stays on the procedural plasma.

Tuned for a slow, chill exploration — long LFO periods and gentle caps. A single
**rate** knob scales *everything* auto drives (lower = calmer); per-section
**speed** knobs (lens, shape) fine-tune individual cycle rates on top of it.

Auto respects manual control: **grab any knob to pin it** and Auto won't touch that
parameter (amber ring); double-click to release it back. Its motion clock only
advances while Auto is on, so toggling it pauses and resumes rather than jumping.

## Beat sync / tap tempo

Tempo-locked pulsing for playing along to music. Toggle **Beat**; set the tempo with
the **BPM** knob or the **Tap tempo** button (tap 3-4 times in rhythm; tapping also
re-aligns the downbeat). The **impact** knob sets how hard the pulse hits.

The trick to staying smooth at any BPM: it drives a continuous **beat phase**, not
discrete triggers. Parameters are smooth functions of that phase — a gentle inward
**zoom swell** and seam/laser flash on each beat (`sin²`, zero at beat boundaries so
it never jumps), plus a slower **warp swell** on each bar (4 beats). Even at fast
techno tempos it breathes in time rather than strobing. (Mic/app-audio beat detection
can later phase-lock this same clock.)

## Recording & screenshots

**Record** captures straight from the canvas via `MediaRecorder` + `captureStream` —
the browser encodes off the main thread from the GPU canvas, so it's far lighter than
a screen recorder and **captures only the kaleidoscope**, not the toolbar. A red ●
REC badge shows while active. **Screenshot (PNG)** grabs the current frame at window
resolution.

**It never buffers the whole recording in RAM** (that ballooned to gigabytes and
crashed the tab on long takes). Each 1-second chunk is persisted as it arrives — the
REC badge tells you which path:

- **`REC → disk`** — File System Access API: pick a file and chunks stream straight
  to it (Chromium over `localhost` or HTTPS). Best for huge/long takes.
- **`REC → cache`** — IndexedDB: chunks go to on-disk browser storage off the JS
  heap, then assemble + download on stop (Arc, Safari, Firefox). **Crash-safe:** if
  the tab dies mid-take, the next load shows a green **"⤓ recover last recording"**
  button to download what was captured.
- **`REC (memory)`** — last-resort in-RAM buffer (only if both above fail).

**Discard** stops a take without saving (or clears the cached recording when not
recording). If a Chromium disk recording crashes, the partial file is also
recoverable from the sibling `*.crswap` file Chrome leaves behind (`ffmpeg -i in
-c copy out`).

## Ideas (backlog)

- **Audio reactivity** — drive zoom, spin, hue, lasers from a mic or app audio via
  the Web Audio API, phase-locking the existing beat clock.
- **Bloom post-pass** — render to a framebuffer, blur the bright parts, add back for
  a true glow instead of the cheap edge trick.
- **Feedback / trails** — sample the previous frame so motion smears into infinite
  zoom tunnels.
- **Hyperbolic tilings** — {p,q} Poincaré-disk folds with infinite detail toward the
  rim; 3D mirror tubes.
- **Tumbling object chamber** — simulate falling glass beads as the source instead of
  a flat image, for an authentic "wand" scope feel.
- **Named presets** — save/recall whole setups to slots (the live state is already
  serialized to `localStorage`).

## How it works (files)

- `src/shaders.ts` — fragment shader: the fold dispatch (triangle / mandala / spiral
  / box), procedural plasma + cosine-palette bank, warp, hue, edge glow, fold-space
  lasers, lens pre-filters, and the coloring post-process.
- `src/triangles.ts` — builds the three mirror lines (normal + offset) for each
  triangle type from its vertices, recentered on the incenter.
- `src/main.ts` — WebGL2 setup, the draggable knob/button toolbar, the per-param +
  global auto system, the beat clock, recording/screenshots, settings persistence,
  and the render loop.
