# Kaleidoscope

A live, GPU-rendered mirror kaleidoscope. A triangle of mirrors is mathematically
identical to reflecting the plane across the triangle's three sides forever, which
tiles the whole plane. Instead of simulating bouncing light, the fragment shader does
the inverse: for every screen pixel it "folds" the coordinate back into the fundamental
triangle, then samples the background there. That's a per-pixel GPU operation, so it
runs at 60fps and the whole thing is effectively a real three-mirror scope you scroll a
background through.

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
| `H`            | hide / show the menu (use this while recording) |
| `↑` / `↓`      | tune the **primary** knob of the last setting you touched |
| `←` / `→`      | tune that setting's **secondary** knob |
| `Z`            | reset all arrow-tunable parameters to defaults (images kept) |
| drop file(s)   | drag one or more images onto the page; they're added to the library (remembered across reloads) and the last one shows |

### Query params

- `?clearImages` — wipes the saved image library from `localStorage` on load
  (also clears the legacy single-image key). Open the page once with this param
  to start fresh.

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
  triangle type (~70-150s), swap between the procedural plasma and the image
  library (~75-150s, so the non-image background is in the mix too), cycle the
  lens (~85-160s), change the laser beam count (~45-90s), and — on an image
  background with more than one image — cycle to the next image (~2.5-5min).

Tuned for a slow, chill exploration — long LFO periods and gentle speed caps, so
it morphs continuously without ever feeling fast or strobey. A single global
**tempo** scales everything auto drives: press `A`, then `↑`/`↓` to slow it down
or speed it up live (lower = calmer).

Its motion clock only advances while auto is on, so toggling it pauses and
resumes rather than jumping. Turning it off leaves everything where it landed;
press `Z` to snap parameters back to defaults.

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
