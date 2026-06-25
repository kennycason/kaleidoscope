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
npm run dev      # open the printed http://localhost:5173
npm run build    # typecheck + production build into dist/
```

Press the browser's fullscreen (F11 / ⌃⌘F) for recording.

## Controls

| Input          | Action |
|----------------|--------|
| `A`            | auto mode — hands-free continual evolution (see below) |
| drag           | pan the object chamber across the background |
| scroll wheel   | zoom in / out |
| `Space`        | toggle auto-drift (hands-free panning) |
| `R`            | toggle slow spin |
| `1` / `2`      | cycle the mirror-triangle type |
| `L`            | toggle lasers |
| `V`            | cycle lens pre-filter (off / fisheye / fly-eye / prism) |
| `W`            | toggle warped ("funhouse") mirror |
| `G`            | toggle neon edge glow |
| `C`            | toggle hue cycling |
| `I`            | cycle to the next image in the dropped library |
| `M`            | toggle image drift (roam the sample point across the image) |
| `P`            | cycle background: procedural ↔ dropped image |
| `B`            | toggle beat sync (tempo-locked pulsing — see below) |
| `T`            | tap tempo — tap in rhythm to set the BPM |
| `O`            | start / stop (and save) recording the canvas to a video file |
| `Shift`+`O`    | discard the current take without saving / clear cached recording |
| `H`            | hide / show the menu (use this while recording) |
| `↑` / `↓`      | tune the **primary** knob of the last setting you touched |
| `←` / `→`      | tune that setting's **secondary** knob |
| `Z`            | reset all arrow-tunable parameters to defaults (images kept) |
| drop file(s)   | drag one or more images onto the page; they're added to the library (remembered across reloads) and the last one shows |

### Query params

- `?clearImages` — wipes the saved image library from `localStorage` on load
  (also clears the legacy single-image key). Open the page once with this param
  to start fresh.
- `?seed=<anything>` — makes the random start reproducible. Without it, every load
  opens on a different random view (triangle, rotation, position, zoom, palette,
  animation phase) and lasers/auto choices also vary. The seed used each load is
  printed to the console (`[seed] …`), so if you land on a start you love, copy it
  into `?seed=` to get it back. All randomness is routed through this seed.

Every toggle flashes a small confirmation toast at the bottom of the screen
(suppressed while the menu is hidden, for clean recordings).

### Tuning (arrow keys)

Pressing any setting's toggle key makes it the *active* target; the arrow keys
then tune whatever you touched last. Up/Down = primary, Left/Right = secondary.

| Setting (key)        | `↑`/`↓` primary | `←`/`→` secondary |
|----------------------|-----------------|-------------------|
| Warp (`W`)           | degree          | speed             |
| Neon glow (`G`)      | intensity       | seam thickness    |
| Hue (`C`)            | cycle speed     | static tint       |
| Lasers (`L`)         | beam count      | sweep speed       |
| Lens (`V`)           | amount          | —                 |
| Auto speed (`A`)     | rate (tempo)    | —                 |
| BPM (`B`)            | tempo           | impact            |
| Spin (`R`)           | speed (signed)  | —                 |
| Auto-drift (`Space`) | amount          | speed             |
| Image drift (`M`)    | range           | speed             |

## Effects

- **Mirror-triangle types** (`1`/`2`) — eight triangles. The first three are the
  Euclidean triangles whose reflections tile the plane seamlessly: equilateral
  (6-fold mandala), right isosceles 45-45-90, and 30-60-90. The remaining five are
  irregular (golden, gnomon, scalene, …) — they don't tile cleanly, so the fold
  never fully converges and the result reads busier and more chaotic.
- **Lasers** (`L`) — beams defined as lines in *fundamental-domain space*
  (`dot(p, n) = c`). Because they're tested against the folded point, the mirror
  reflections make each beam bounce off the triangle walls and tile through the
  entire scope — so they move in lock-step with the pattern instead of floating
  on top like the old screen-space arcs. Each beam slowly rotates and sweeps; the
  glow is a crisp `fwidth`-based core plus a soft halo.
- **Lens** (`V`) — a pre-filter applied to the view *before* the kaleidoscope
  fold, like looking into the scope through a shaped front element. Cycles:
  off → **fisheye** (round barrel) → **fly-eye** (compound hexagonal facets) →
  **prism** (per-channel chromatic refraction / RGB fringing).
- **Warped mirror** (`W`) — a time-animated domain warp ripples the plane before
  folding, so the rigid tiling bulges and breathes like a liquid mirror.
- **Neon edge glow** (`G`) — lights up the true mirror seams using each pixel's
  distance to the nearest fundamental-triangle edge (constant on-screen thickness
  at any zoom).
- **Hue cycle** (`C`) — continuously rotates all colors around the luminance axis;
  the secondary knob adds a fixed tint on top.
- **Image drift** (`M`) — slowly roams the sample point across a dropped image on a
  Lissajous loop, so the scope isn't locked onto one fixed section.
- **Background** (`P`) — a layered animated plasma (default, zero assets), or any
  image you drop in (persisted to `localStorage` across reloads). The procedural
  plasma drifts continuously through a bank of 8 cosine palettes, cross-fading
  smoothly (~33s each) so the colour mood keeps evolving on its own.

All of the above are live-tunable with the arrow keys — see the Tuning table above.

### Auto mode (`A`)

Hands-free VJ autopilot for continual evolution — good for recording or leaving
on a screen. While active it:

- drives most parameters (warp, glow, hue, spin, zoom, image drift, lens amount,
  lasers) from slow sine LFOs on distinct periods, so the motion never visibly
  repeats and effects breathe smoothly in and out;
- roams the sample point across the background on a layered Lissajous path;
- fires occasional discrete scene changes on independent random timers: switch
  triangle type (~70-150s), cycle the lens (~85-160s), change the laser beam
  count (~45-90s), and cycle to the next image (~2.5-5min);
- background follows your library: if any images are loaded, auto stays on them
  and only cycles between them; with none, it stays on the procedural plasma.

Tuned for a slow, chill exploration — long LFO periods and gentle speed caps, so
it morphs continuously without ever feeling fast or strobey. A single global
**tempo** scales everything auto drives: press `A`, then `↑`/`↓` to slow it down
or speed it up live (lower = calmer).

Its motion clock only advances while auto is on, so toggling it pauses and
resumes rather than jumping. Turning it off leaves everything where it landed;
press `Z` to snap parameters back to defaults.

### Beat sync (`B`) / tap tempo (`T`)

Tempo-locked pulsing for playing along to music. `B` toggles it; set the tempo by
nudging BPM (`B` then `↑`/`↓`) or by tapping `T` in rhythm (3-4 taps; tapping also
re-aligns the downbeat). `←`/`→` set the **impact** (how hard the pulse hits).

The trick to staying smooth at any BPM: it drives a continuous **beat phase**, not
discrete triggers. Parameters are smooth functions of that phase — a gentle inward
**zoom swell** and seam/laser flash on each beat (`sin²`, zero at beat boundaries
so it never jumps) and a slower **warp swell** on each bar (4 beats). Even at fast
techno tempos it breathes in time rather than strobing. Beat flashes only brighten
glow/lasers when those effects are already on; the zoom/warp swell is always felt.

This is the manual foundation; mic/app-audio beat detection can later phase-lock
this same clock.

### Recording (`O`)

`O` starts/stops recording straight from the canvas via `MediaRecorder` +
`captureStream` — the browser encodes off the main thread from the GPU canvas, so
it's far lighter than a screen recorder and **captures only the kaleidoscope**, not
the UI overlay. A red ● REC badge shows while active (even with the menu hidden).
Tip: hide the menu with `H` before recording for a clean shot.

**It never buffers the whole recording in RAM** (that ballooned to gigabytes and
crashed the tab on long takes). Each 1-second chunk is persisted as it arrives, via
one of two paths — the REC badge tells you which:

- **`REC → disk`** — File System Access API: `O` opens a save dialog and chunks
  stream straight to that file (Chromium / Chrome / Edge over `localhost` or HTTPS).
- **`REC → cache`** — IndexedDB: chunks are written to on-disk browser storage off
  the JS heap, then assembled and downloaded when you stop. Works anywhere IndexedDB
  exists (Arc, Safari, Firefox). **Crash-safe:** if the tab dies mid-take, the next
  load shows a green **"⤓ recover last recording"** button (top-right) to download
  what was captured.
- **`REC (memory)`** — last-resort in-RAM buffer (only if both above fail); keep
  takes short.

If a Chromium disk recording crashes, the partial file is also recoverable from the
sibling `*.crswap` file Chrome leaves behind (remux with `ffmpeg -i in -c copy out`).

**Reset / discard** (`Shift`+`O`): while recording, stops the take *without* saving;
when not recording, clears any cached/recoverable recording so you start clean. (For
the `REC → disk` path the file you picked already exists on disk, so a discarded one
stays there — delete it manually.)

## Ideas for more effects (backlog)

- **Beat / audio reactivity** — drive zoom, spin, hue, and laser sweep from a
  mic or audio file via the Web Audio API for music-synced visuals.
- **Bloom post-pass** — render to a framebuffer, blur the bright parts, add back
  for a true glow instead of the cheap edge trick.
- **Tumbling object chamber** — simulate falling glass beads (sprites/metaballs)
  as the source instead of a flat image, for an authentic "wand" scope feel.
- **Feedback / trails** — sample the previous frame so motion smears into infinite
  zoom tunnels.
- **More mirror geometries** — N-fold polar mandalas, the other wallpaper groups,
  hyperbolic (Poincaré disk) tilings, and 3D mirror tubes.
- **Color palettes / presets** — curated palette LUTs and a one-key cycle through
  saved "looks."
- **Recording helpers** — a clean capture mode (auto-hide UI), and WebM export via
  `MediaRecorder`.
- **Chromatic aberration & kaleidoscopic glitch** — per-channel offset and
  occasional symmetry-order jumps for a trippier edge.

## How it works (files)

- `src/shaders.ts` — vertex (fullscreen triangle) + fragment shader: the `fold`
  loop, procedural plasma, warp, hue shift, edge glow, fold-space lasers, and the
  lens pre-filters.
- `src/triangles.ts` — builds the three mirror lines (normal + offset) for each
  triangle type from its vertices, recentered on the incenter.
- `src/main.ts` — WebGL2 setup, input handling, effect state, autopilot, and the
  render loop.
