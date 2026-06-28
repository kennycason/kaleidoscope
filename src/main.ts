import { fragmentShader, vertexShader } from "./shaders";
import { TRIANGLES } from "./triangles";

const canvas = document.getElementById("gl") as HTMLCanvasElement;
const toastEl = document.getElementById("toast") as HTMLDivElement;
const dropOverlay = document.getElementById("drop") as HTMLDivElement;

let toastTimer = 0;
function toast(msg: string) {
  // Toasts are separate DOM (never captured in recordings), so always show them.
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1100);
}

// ---- seeded randomness ----------------------------------------------------
// Without a seed the scene starts random each load. `?seed=<anything>` makes the
// whole start reproducible. We route ALL randomness through this PRNG (by
// replacing Math.random) so lasers, auto choices, etc. are deterministic per seed.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedParam = new URLSearchParams(location.search).get("seed");
const seedValue = seedParam ?? String(Math.floor(Math.random() * 1e9));
(Math as { random: () => number }).random = mulberry32(hashSeed(seedValue));
console.info(`[seed] ${seedValue} — add ?seed=${seedValue} to the URL to reproduce this start`);

const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
if (!gl) throw new Error("WebGL2 is not available in this browser.");

// ---- shader program -------------------------------------------------------
function compile(type: number, src: string): WebGLShader {
  const sh = gl!.createShader(type)!;
  gl!.shaderSource(sh, src);
  gl!.compileShader(sh);
  if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
    throw new Error(gl!.getShaderInfoLog(sh) ?? "shader compile failed");
  }
  return sh;
}

const program = gl.createProgram()!;
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
}
gl.useProgram(program);

const u = (name: string) => gl.getUniformLocation(program, name);
const loc = {
  res: u("uRes"),
  time: u("uTime"),
  pan: u("uPan"),
  scale: u("uScale"),
  rot: u("uRot"),
  n0: u("uN0"), d0: u("uD0"),
  n1: u("uN1"), d1: u("uD1"),
  n2: u("uN2"), d2: u("uD2"),
  useTex: u("uUseTex"),
  tex: u("uTex"),
  texAspect: u("uTexAspect"),
  texPan: u("uTexPan"),
  warp: u("uWarp"),
  warpSpeed: u("uWarpSpeed"),
  hue: u("uHue"),
  glow: u("uGlow"),
  glowWidth: u("uGlowWidth"),
  laserCount: u("uLaserCount"),
  laserN: u("uLaserN[0]"),
  laserC: u("uLaserC[0]"),
  laserCol: u("uLaserCol[0]"),
  laserGlow: u("uLaserGlow"),
  lens: u("uLens"),
  lensAmt: u("uLensAmt"),
  palette: u("uPalette"),
  foldIters: u("uFoldIters"),
  foldMode: u("uFoldMode"),
  segments: u("uSegments"),
  sat: u("uSat"),
  contrast: u("uContrast"),
  posterize: u("uPosterize"),
  solarize: u("uSolarize"),
  gradMap: u("uGradMap"),
};

// ---- background texture ---------------------------------------------------
const texture = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
  new Uint8Array([0, 0, 0, 255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.uniform1i(loc.tex, 0);

const STORAGE_KEY = "kaleidoscope.bgImages";
const LEGACY_KEY = "kaleidoscope.bgImage"; // earlier single-image key

const state = {
  useTex: false,
  texAspect: [1, 1] as [number, number],
};

// Library of dropped images (data URLs) and which one is showing. `I` cycles.
const images: string[] = [];
let imageIndex = -1;
const hasImages = () => images.length > 0;

function loadImage(src: string, show = true) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img);
    const aspect = img.width / img.height;
    // Undo non-square stretch so the source isn't distorted before folding.
    state.texAspect = aspect >= 1 ? [1, aspect] : [1 / aspect, 1];
    if (show) state.useTex = true;
  };
  img.src = src;
}

// Persist the image library. Data URLs are large and localStorage caps around
// 5MB, so we save only as many of the most-recent images as fit. This works on
// a COPY — the live `images` array is never trimmed, so cycling with `I` still
// sees every image dropped this session even when storage can't hold them all.
function persistImages() {
  let toSave = images.slice();
  while (toSave.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      return;
    } catch {
      toSave = toSave.slice(1); // drop oldest from the saved copy only
    }
  }
  localStorage.removeItem(STORAGE_KEY);
  if (images.length) console.warn("Images too large to remember across reloads.");
}

function addImage(dataUrl: string) {
  images.push(dataUrl);
  imageIndex = images.length - 1;
  persistImages();
  loadImage(dataUrl);
  rebuildImageGrid(); // reflect the new thumbnail in the toolbar
}

// Show the next image in the library, wrapping around.
function cycleImage() {
  if (!hasImages()) { toast("No images yet — drop one"); return; }
  imageIndex = (imageIndex + 1) % images.length;
  loadImage(images[imageIndex], true);
  toast(`Image ${imageIndex + 1}/${images.length}`);
}

// Remove the currently selected image from the library.
function deleteCurrentImage() {
  if (!images.length) return;
  const idx = imageIndex >= 0 ? Math.min(imageIndex, images.length - 1) : images.length - 1;
  images.splice(idx, 1);
  persistImages();
  if (!images.length) {
    imageIndex = -1;
    state.useTex = false; // nothing left to show → fall back to procedural
  } else {
    imageIndex = Math.min(idx, images.length - 1);
    if (state.useTex) loadImage(images[imageIndex], true);
  }
  rebuildImageGrid();
  toast("Image deleted");
}

function clearImages() {
  images.length = 0;
  imageIndex = -1;
  state.useTex = false;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

// `?clearImages` wipes the saved library; otherwise restore it (migrating the
// old single-image key if present) and resume on the last-shown image.
if (new URLSearchParams(location.search).has("clearImages")) {
  clearImages();
} else {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) { localStorage.removeItem(LEGACY_KEY); images.push(legacy); }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(saved)) for (const s of saved) if (typeof s === "string") images.push(s);
  } catch { /* ignore corrupt storage */ }
  if (legacy) persistImages();
  if (hasImages()) { imageIndex = 0; loadImage(images[0], true); }
}

// ---- interaction ----------------------------------------------------------
const view = {
  pan: [0, 0] as [number, number],
  scale: 1.0,        // world half-height
  rot: 0,
  spin: 0.06,        // radians/sec when spinning
  spinning: true,
  autoDrift: true,
  driftAmp: 1.0,     // auto-drift amount
  driftFreq: 1.0,    // auto-drift speed
  shape: 0,          // index into SHAPES
  shapeAuto: false,  // cycle shapes on a timer
  segments: 6,       // wedge count for mandala / spiral folds
};

// Fold shapes: the 8 reflection triangles plus the polar/spiral/box folds.
type Shape = { name: string; mode: number; tri?: (typeof TRIANGLES)[number] };
const SHAPES: Shape[] = [
  ...TRIANGLES.map((t): Shape => ({ name: t.name, mode: 0, tri: t })),
  { name: "mandala (N-fold)", mode: 1 },
  { name: "spiral", mode: 2 },
  { name: "mirror box", mode: 3 },
];

// Coloring post-process (knobs; 0/neutral = off).
const color = {
  sat: 1,        // saturation (1 = neutral)
  contrast: 1,   // contrast (1 = neutral)
  posterize: 0,  // 0 = off, else number of levels
  solarize: 0,   // 0..1
  gradMap: 0,    // 0..1 recolor by luminance through palette bank
};

// Effect toggles. *On flags toggle the effect; the bare value is the eased
// live strength; *Strength/Speed/etc. are the user-tunable targets the arrow
// keys nudge. Strengths ease toward their targets each frame so turning an
// effect on/off fades smoothly instead of popping.
const fx = {
  warpOn: false, warp: 0, warpStrength: 0.5, warpSpeed: 1.0,
  glowOn: false, glow: 0, glowStrength: 1.0, glowWidth: 2.5,
  hueOn: false, hue: 0, hueSpeed: 0.6, hueBase: 0,
  // Roam the sample point across the background image so the kaleidoscope
  // isn't locked onto one fixed section. texPan follows a slow Lissajous loop.
  panImgOn: false, texPhase: 0, texPan: [0, 0] as [number, number],
  panImgSpeed: 0.15, panImgRange: 0.6,
};

// Lasers ("L"): beams that live in fundamental-domain space so the fold makes
// them bounce off the mirror walls, consistent with the pattern. Each beam is a
// line dot(p, n) = c; we sweep c and slowly rotate n over time.
interface Beam {
  angle: number;
  angleSpeed: number;
  phase: number;
  sweepSpeed: number;
  sweepRange: number;
  col: [number, number, number];
}
const LASER_COLORS: [number, number, number][] = [
  [1.0, 0.12, 0.32], [0.1, 0.7, 1.0], [0.35, 1.0, 0.4], [1.0, 0.8, 0.12], [0.7, 0.25, 1.0],
];
const lasers = {
  on: false,
  glow: 0,
  glowTarget: 1.0,
  count: 3,
  speed: 1.0,
  beams: [] as Beam[],
};
function rebuildLasers() {
  lasers.count = Math.max(1, Math.min(5, Math.round(lasers.count)));
  lasers.beams = [];
  for (let i = 0; i < lasers.count; i++) {
    lasers.beams.push({
      angle: Math.random() * Math.PI,
      angleSpeed: (0.04 + Math.random() * 0.08) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      sweepSpeed: 0.12 + Math.random() * 0.16,
      sweepRange: 0.35 + Math.random() * 0.25,
      col: LASER_COLORS[i % LASER_COLORS.length],
    });
  }
}
rebuildLasers();
const laserN = new Float32Array(10);
const laserC = new Float32Array(5);
const laserCol = new Float32Array(15);

// Pre-filter "lens" (V): 0 none, 1 fisheye, 2 fly-eye, 3 prism.
const LENS_NAMES = [
  "off", "round (fisheye)", "compound (fly eye)", "prism",
  "swirl", "tunnel", "ripple", "pinch", "shatter", "glass tiles",
];
const lens = { mode: 0, amt: 1.0, autoCycle: false };

// Procedural palette phase: advances continuously so the plasma background
// drifts smoothly through the shader's palette bank. ~33s per palette.
let palettePhase = 0;
const PALETTE_SPEED = 0.03;
// Offset added to the shader clock so the plasma/warp don't start identically.
let timeSeed = 0;

// Autopilot ("A"): hands-free continual evolution. While on, it drives every
// parameter from slow sine LFOs and fires occasional discrete scene changes
// (switch triangle, cycle image, swap background, change lens). `time` only
// advances while on, so motion pauses and resumes rather than jumping.
const auto = {
  on: false,
  time: 0,
  rate: 0.7, // global tempo for everything auto drives (tune live with Up/Down)
  imgHold: 300, // seconds to stay on each image before auto-advancing (0 = off)
  triTimer: 0,
  lensTimer: 0,
  laserTimer: 0,
  segTimer: 0,
};

// Beat sync ("B"): a musical clock. `phase` counts beats; we drive parameters
// from smooth functions of the phase (never discrete triggers), so it pulses in
// time at any BPM without ever jumping. Tap-tempo ("T") sets the BPM by rhythm.
const beat = {
  on: false,
  bpm: 128,
  phase: 0,
  impact: 1.0,
  taps: [] as number[],
};
function tapTempo() {
  const now = performance.now() / 1000;
  // A gap longer than 2s starts a fresh tap sequence.
  if (beat.taps.length && now - beat.taps[beat.taps.length - 1] > 2) beat.taps = [];
  beat.taps.push(now);
  if (beat.taps.length > 5) beat.taps.shift();
  if (beat.taps.length >= 2) {
    let sum = 0;
    for (let i = 1; i < beat.taps.length; i++) sum += beat.taps[i] - beat.taps[i - 1];
    const avg = sum / (beat.taps.length - 1);
    beat.bpm = Math.min(240, Math.max(40, 60 / avg));
  }
  beat.phase = 0; // align the downbeat to this tap
  beat.on = true;
  toast(`BPM ${Math.round(beat.bpm)} (tap)`);
}

// Randomized start (seeded above) so every load opens on a different view —
// different triangle, rotation, position, zoom, palette, and animation phase.
view.shape = Math.floor(Math.random() * SHAPES.length);
view.segments = 4 + Math.floor(Math.random() * 9); // 4..12
view.rot = Math.random() * Math.PI * 2;
view.pan[0] = (Math.random() - 0.5) * 4;
view.pan[1] = (Math.random() - 0.5) * 4;
view.scale = 0.8 + Math.random() * 0.9;
palettePhase = Math.random() * 8;
timeSeed = Math.random() * 500;

let dragging = false;
let last: [number, number] = [0, 0];

function worldPerPixel() {
  return (2 * view.scale) / canvas.clientHeight;
}

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  view.autoDrift = false;
  last = [e.clientX, e.clientY];
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const k = worldPerPixel();
  const dx = (e.clientX - last[0]) * k;
  const dy = (last[1] - e.clientY) * k; // screen y is down, world y is up → flip
  // Undo the view rotation so a drag is screen-aligned at any angle: Δpan = -R·d
  // where R is the shader's rotation matrix mat2(c,-s,s,c).
  const c = Math.cos(view.rot), s = Math.sin(view.rot);
  view.pan[0] -= c * dx + s * dy;
  view.pan[1] -= -s * dx + c * dy;
  last = [e.clientX, e.clientY];
});
function endDrag(e: PointerEvent) {
  dragging = false;
  canvas.classList.remove("dragging");
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(e.deltaY * 0.001);
  view.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
  autoOverride.add(ADJUST.zoom.primary!); // manual zoom pins it (Auto won't fight)
}, { passive: false });

// Single zoom range shared by the wheel and the zoom knob (kept consistent).
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 80;
// Per-effect oscillation config (zoom auto uses these instead of full min/max).
const zoomCfg = { min: 0.5, max: 3.5, speed: 1.0 };
const shapeCycle = { speed: 1.0 }; // shape auto-cycle rate multiplier
const lensCycle = { speed: 1.0 };  // lens auto-cycle rate multiplier

// ---- adjustable parameters ------------------------------------------------
// A knob exposes a value with bounds + formatting. Optional autoLo/autoHi/
// autoRate override the auto-oscillation range/speed for that knob.
interface Knob {
  label: string;
  get: () => number;
  set: (v: number) => void;
  step: number;
  min: number;
  max: number;
  fmt?: (v: number) => string;
  autoLo?: () => number;
  autoHi?: () => number;
  autoRate?: () => number;
  log?: boolean; // multiplicative knob (e.g. zoom) so it matches the scroll wheel
}
interface Adjustable {
  name: string;
  primary?: Knob;
  secondary?: Knob;
}

const deg = (v: number) => `${Math.round((v * 180) / Math.PI)}°`;
const num = (v: number) => v.toFixed(2);

const ADJUST: Record<string, Adjustable> = {
  warp: {
    name: "Warp",
    primary: { label: "degree", get: () => fx.warpStrength, set: (v) => (fx.warpStrength = v), step: 0.05, min: 0, max: 1.5, fmt: num },
    secondary: { label: "speed", get: () => fx.warpSpeed, set: (v) => (fx.warpSpeed = v), step: 0.1, min: 0, max: 4, fmt: num },
  },
  glow: {
    name: "Neon glow",
    primary: { label: "intensity", get: () => fx.glowStrength, set: (v) => (fx.glowStrength = v), step: 0.1, min: 0, max: 3, fmt: num },
    secondary: { label: "thickness", get: () => fx.glowWidth, set: (v) => (fx.glowWidth = v), step: 0.5, min: 0.5, max: 12, fmt: num },
  },
  hue: {
    name: "Hue",
    primary: { label: "speed", get: () => fx.hueSpeed, set: (v) => (fx.hueSpeed = v), step: 0.1, min: -3, max: 3, fmt: num },
    secondary: { label: "tint", get: () => fx.hueBase, set: (v) => (fx.hueBase = v), step: 0.2, min: 0, max: Math.PI * 2, fmt: deg },
  },
  lasers: {
    name: "Lasers",
    primary: { label: "beams", get: () => lasers.count, set: (v) => { lasers.count = v; rebuildLasers(); }, step: 1, min: 1, max: 5, fmt: (v) => `${Math.round(v)}` },
    secondary: { label: "speed", get: () => lasers.speed, set: (v) => (lasers.speed = v), step: 0.1, min: 0.1, max: 3, fmt: num },
  },
  lens: {
    name: "Lens",
    primary: { label: "amount", get: () => lens.amt, set: (v) => (lens.amt = v), step: 0.1, min: 0, max: 2, fmt: num },
  },
  autotempo: {
    name: "Auto speed",
    primary: { label: "rate", get: () => auto.rate, set: (v) => (auto.rate = v), step: 0.05, min: 0.1, max: 2, fmt: num },
  },
  imghold: {
    name: "Image hold",
    primary: { label: "hold", get: () => auto.imgHold, set: (v) => (auto.imgHold = Math.round(v)), step: 1, min: 0, max: 600, fmt: (v) => (v < 0.5 ? "off" : `${Math.round(v)}s`) },
  },
  segments: {
    name: "Segments",
    primary: { label: "seg", get: () => view.segments, set: (v) => (view.segments = Math.round(v)), step: 1, min: 2, max: 24, fmt: (v) => `${Math.round(v)}` },
  },
  gradmap: {
    name: "Gradient map",
    primary: { label: "map", get: () => color.gradMap, set: (v) => (color.gradMap = v), step: 0.05, min: 0, max: 1, fmt: num },
  },
  saturation: {
    name: "Saturation",
    primary: { label: "sat", get: () => color.sat, set: (v) => (color.sat = v), step: 0.05, min: 0, max: 2, fmt: num },
  },
  contrast: {
    name: "Contrast",
    primary: { label: "con", get: () => color.contrast, set: (v) => (color.contrast = v), step: 0.05, min: 0.3, max: 2.5, fmt: num },
  },
  posterize: {
    name: "Posterize",
    primary: { label: "post", get: () => color.posterize, set: (v) => (color.posterize = Math.round(v)), step: 1, min: 0, max: 16, fmt: (v) => (v < 2 ? "off" : `${Math.round(v)}`) },
  },
  solarize: {
    name: "Solarize",
    primary: { label: "sol", get: () => color.solarize, set: (v) => (color.solarize = v), step: 0.05, min: 0, max: 1, fmt: num },
  },
  bpm: {
    name: "BPM",
    primary: { label: "tempo", get: () => beat.bpm, set: (v) => (beat.bpm = v), step: 1, min: 40, max: 240, fmt: (v) => `${Math.round(v)}` },
    secondary: { label: "impact", get: () => beat.impact, set: (v) => (beat.impact = v), step: 0.1, min: 0, max: 2, fmt: num },
  },
  spin: {
    name: "Spin",
    primary: { label: "speed", get: () => view.spin, set: (v) => (view.spin = v), step: 0.02, min: -1, max: 1, fmt: num },
  },
  zoom: {
    name: "Zoom",
    primary: {
      label: "zoom", get: () => view.scale, set: (v) => (view.scale = v), step: 0.01, min: ZOOM_MIN, max: ZOOM_MAX, fmt: num, log: true,
      autoLo: () => zoomCfg.min, autoHi: () => zoomCfg.max, autoRate: () => zoomCfg.speed,
    },
  },
  zoommin: {
    name: "Zoom min",
    primary: { label: "min", get: () => zoomCfg.min, set: (v) => (zoomCfg.min = v), step: 0.01, min: ZOOM_MIN, max: ZOOM_MAX, fmt: num, log: true },
  },
  zoommax: {
    name: "Zoom max",
    primary: { label: "max", get: () => zoomCfg.max, set: (v) => (zoomCfg.max = v), step: 0.01, min: ZOOM_MIN, max: ZOOM_MAX, fmt: num, log: true },
  },
  zoomspeed: {
    name: "Zoom speed",
    primary: { label: "speed", get: () => zoomCfg.speed, set: (v) => (zoomCfg.speed = v), step: 0.05, min: 0.1, max: 4, fmt: num },
  },
  shapespeed: {
    name: "Shape speed",
    primary: { label: "speed", get: () => shapeCycle.speed, set: (v) => (shapeCycle.speed = v), step: 0.05, min: 0.1, max: 4, fmt: num },
  },
  lensspeed: {
    name: "Lens speed",
    primary: { label: "speed", get: () => lensCycle.speed, set: (v) => (lensCycle.speed = v), step: 0.05, min: 0.1, max: 4, fmt: num },
  },
  drift: {
    name: "Auto-drift",
    primary: { label: "amount", get: () => view.driftAmp, set: (v) => (view.driftAmp = v), step: 0.05, min: 0, max: 4, fmt: num },
    secondary: { label: "speed", get: () => view.driftFreq, set: (v) => (view.driftFreq = v), step: 0.1, min: 0.1, max: 4, fmt: num },
  },
  imgdrift: {
    name: "Image drift",
    primary: { label: "range", get: () => fx.panImgRange, set: (v) => (fx.panImgRange = v), step: 0.05, min: 0, max: 2, fmt: num },
    secondary: { label: "speed", get: () => fx.panImgSpeed, set: (v) => (fx.panImgSpeed = v), step: 0.05, min: 0.01, max: 1.5, fmt: num },
  },
};

// Stable string id <-> knob, used to persist which knobs are auto'd.
const idToKnob = new Map<string, Knob>();
const knobToId = new Map<Knob, string>();
for (const [key, a] of Object.entries(ADJUST)) {
  if (a.primary) { idToKnob.set(key + ":p", a.primary); knobToId.set(a.primary, key + ":p"); }
  if (a.secondary) { idToKnob.set(key + ":s", a.secondary); knobToId.set(a.secondary, key + ":s"); }
}

// Snapshot every tunable knob's starting value so "Reset" can restore them.
// Captured now, before any interaction, so these are the true defaults.
const PARAM_DEFAULTS = Object.entries(ADJUST).map(([, a]) => ({
  primary: a.primary, pVal: a.primary?.get(),
  secondary: a.secondary, sVal: a.secondary?.get(),
}));

function resetParams() {
  for (const d of PARAM_DEFAULTS) {
    if (d.primary && d.pVal !== undefined) d.primary.set(d.pVal);
    if (d.secondary && d.sVal !== undefined) d.secondary.set(d.sVal);
  }
}

// ---- video recording ------------------------------------------------------
// MediaRecorder on the canvas's own captureStream: the browser encodes frames
// off the main thread straight from the GPU canvas, so it's far cheaper than a
// screen recorder and captures only the canvas (no UI overlay).
//
// We never buffer the whole recording in RAM (that ballooned to GBs and crashed
// the tab on long takes). Each 1s chunk is persisted as it arrives:
//   1. File System Access API → streamed straight to a file you pick (Chromium);
//   2. otherwise IndexedDB → chunks live on disk off the JS heap, and survive a
//      crash so the recording can be recovered on the next load (works in Arc,
//      Safari, Firefox — anywhere IndexedDB exists).
const recEl = document.getElementById("rec") as HTMLDivElement;
const recLabel = document.getElementById("recLabel") as HTMLSpanElement;
const recoverEl = document.getElementById("recover") as HTMLDivElement;
type DiskWriter = { write: (b: Blob) => Promise<void>; close: () => Promise<void> };
let recorder: MediaRecorder | null = null;
let recWriter: DiskWriter | null = null;
let recDB: IDBDatabase | null = null;
let recDiscard = false; // set when stopping should throw the take away, not save
let pendingShot = false; // request a PNG capture on the next rendered frame
let paused = false;      // freeze the animation clock on the current frame

function pickMime(): string {
  const opts = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const m of opts) if (window.MediaRecorder?.isTypeSupported(m)) return m;
  return "";
}

// --- tiny IndexedDB helpers (chunk store keeps frames off the JS heap) ---
const REC_DB = "kaleidoscope-rec";
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REC_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function recStore(db: IDBDatabase, name: string, mode: IDBTransactionMode) {
  return db.transaction(name, mode).objectStore(name);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Snapshot: flagged here, captured in the render loop right after the draw (a
// WebGL canvas reads back black once the frame has composited, so timing matters).
function takeScreenshot() {
  pendingShot = true;
}

async function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder || !("captureStream" in canvas)) {
    toast("Recording not supported in this browser");
    return;
  }
  const mime = pickMime();
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `kaleidoscope-${stamp}.${ext}`;

  // 1) Prefer a real file on disk (Chromium). The keypress is the user gesture.
  recWriter = null;
  recDB = null;
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<DiskWriter> }> }).showSaveFilePicker;
  if (picker) {
    try {
      // The picker's accept key must be a bare MIME type — a parameterised one
      // like "video/webm;codecs=vp9" makes it throw (which silently fell back to
      // cache even though the API was available).
      const acceptType = ext === "mp4" ? "video/mp4" : "video/webm";
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "Video", accept: { [acceptType]: ["." + ext] } }],
      });
      recWriter = await handle.createWritable();
      console.info("[rec] streaming to disk via File System Access API");
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return; // user cancelled
      console.warn("[rec] file picker failed, using IndexedDB instead:", err);
    }
  }

  // 2) Otherwise stream to IndexedDB (flat memory + crash-recoverable).
  if (!recWriter) {
    try {
      recDB = await idbOpen();
      await idbReq(recStore(recDB, "chunks", "readwrite").clear());
      const meta = recStore(recDB, "meta", "readwrite");
      meta.put(mime || "video/webm", "mime");
      meta.put(filename, "filename");
      console.info("[rec] streaming to IndexedDB (recoverable after a crash)");
    } catch (err) {
      recDB = null;
      console.warn("[rec] IndexedDB unavailable; this take won't be crash-safe:", err);
    }
  }

  let memChunks: Blob[] = []; // absolute last resort if both above fail

  const stream = (canvas as HTMLCanvasElement).captureStream(60);
  recorder = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: 16_000_000,
  });

  recorder.ondataavailable = async (e) => {
    if (!e.data.size) return;
    try {
      if (recWriter) await recWriter.write(e.data);
      else if (recDB) await idbReq(recStore(recDB, "chunks", "readwrite").add(e.data));
      else memChunks.push(e.data);
    } catch { /* keep recording even if a single write fails */ }
  };
  recorder.onstop = async () => {
    recEl.classList.remove("show");
    recLabel.textContent = "REC";
    const discard = recDiscard;
    recDiscard = false;
    const type = recorder?.mimeType || mime || "video/webm";
    try {
      if (recWriter) {
        // The picked file is already on disk; on discard we just close it (the
        // File System Access API can't delete it — remove it manually if unwanted).
        await recWriter.close();
      } else if (recDB) {
        if (!discard) {
          const parts = await idbReq(recStore(recDB, "chunks", "readonly").getAll());
          downloadBlob(new Blob(parts as Blob[], { type }), filename);
        }
        await idbReq(recStore(recDB, "chunks", "readwrite").clear());
        recDB.close();
      } else if (!discard) {
        downloadBlob(new Blob(memChunks, { type }), filename);
      }
    } catch (err) {
      console.warn("[rec] error finalizing recording:", err);
    }
    recWriter = null;
    recDB = null;
    memChunks = [];
    recorder = null;
    recoverEl.classList.remove("show");
    toast(discard ? "Recording discarded" : "Recording saved");
  };

  // 1s timeslice → a chunk is persisted every second, so almost nothing is ever
  // held in memory or lost on a crash.
  recorder.start(1000);
  recLabel.textContent = recWriter ? "REC → disk" : recDB ? "REC → cache" : "REC (memory)";
  recEl.classList.add("show");
  toast(recWriter ? "Recording to disk…" : recDB ? "Recording (crash-safe)…" : "Recording in memory…");
}

// On load, offer to recover a recording left behind by a crash.
async function checkRecovery() {
  try {
    const db = await idbOpen();
    const n = await idbReq(recStore(db, "chunks", "readonly").count());
    db.close();
    if (n > 0) recoverEl.classList.add("show");
  } catch { /* no IndexedDB, nothing to recover */ }
}
async function recoverRecording() {
  try {
    const db = await idbOpen();
    const parts = await idbReq(recStore(db, "chunks", "readonly").getAll());
    if (!parts.length) { recoverEl.classList.remove("show"); db.close(); return; }
    const mime = (await idbReq(recStore(db, "meta", "readonly").get("mime"))) as string || "video/webm";
    const name = (await idbReq(recStore(db, "meta", "readonly").get("filename"))) as string
      || `kaleidoscope-recovered.${mime.includes("mp4") ? "mp4" : "webm"}`;
    downloadBlob(new Blob(parts as Blob[], { type: mime }), name);
    await idbReq(recStore(db, "chunks", "readwrite").clear());
    db.close();
    recoverEl.classList.remove("show");
    toast("Recovered recording downloaded");
  } catch (err) {
    console.warn("[rec] recovery failed:", err);
  }
}
(document.getElementById("recoverGo") as HTMLSpanElement).addEventListener("click", recoverRecording);
// Dismiss the prompt without deleting the cached recording (Shift+O clears it).
(document.getElementById("recoverX") as HTMLSpanElement).addEventListener("click", (e) => {
  e.stopPropagation();
  recoverEl.classList.remove("show");
});
checkRecovery();

// Discard / reset: while recording, stop the take without saving; otherwise wipe
// any cached/recoverable recording so you start clean. (Shift+O)
async function discardRecording() {
  if (recorder) {
    recDiscard = true;
    recorder.stop(); // onstop sees the flag and skips the download
    return;
  }
  try {
    const db = await idbOpen();
    await idbReq(recStore(db, "chunks", "readwrite").clear());
    db.close();
  } catch { /* nothing to clear */ }
  recoverEl.classList.remove("show");
  toast("Recording cache cleared");
}

// ---- toolbar UI -----------------------------------------------------------
// Draggable, compact control surface. Each effect is a row: a toggle button plus
// its parameter knobs inline, so you can dial a setting in BEFORE enabling it.
// Knobs (vertical drag; hold Shift for fine control) scale to many params better
// than sliders. Shape/Lens are dropdowns; images are a thumbnail grid. Everything
// refreshes ~8 Hz so it reflects live values (e.g. knobs turn while Auto runs).
const toolbar = document.getElementById("toolbar") as HTMLDivElement;
const tbBody = document.getElementById("tbBody") as HTMLDivElement;
const tbHead = document.getElementById("tbHead") as HTMLDivElement;
const refreshers: (() => void)[] = [];
let draggingKnob: HTMLElement | null = null;

// Per-parameter auto: double-click a knob to make that one parameter evolve on
// its own LFO (independent of global Auto mode, which overrides everything while
// it's on). Tracked by the Knob object itself.
const paramAuto = new Set<Knob>();
// Knobs the user has grabbed/pinned to manual — global Auto mode won't overwrite
// these, so manual tweaks persist (and survive toggling Auto on/off).
const autoOverride = new Set<Knob>();
const autoKnobs: { knob: Knob; el: HTMLElement; phase: number; period: number }[] = [];

function tbSection(title: string) {
  const d = document.createElement("div");
  d.className = "tb-sec";
  d.textContent = title;
  tbBody.appendChild(d);
}
function tbRow(...els: HTMLElement[]): HTMLDivElement {
  const r = document.createElement("div");
  r.className = "tb-row";
  els.forEach((e) => r.appendChild(e));
  tbBody.appendChild(r);
  return r;
}
function tbButton(label: () => string, onClick: () => void, isOn?: () => boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "tb-btn";
  b.onclick = onClick;
  refreshers.push(() => {
    b.textContent = label();
    if (isOn) b.classList.toggle("on", isOn());
  });
  return b;
}
function tbKnob(knob: Knob, short: string): HTMLElement {
  const col = document.createElement("div");
  col.className = "tb-knob-col";
  const k = document.createElement("div");
  k.className = "tb-knob";
  const ind = document.createElement("div");
  ind.className = "ind";
  k.appendChild(ind);
  const val = document.createElement("div");
  val.className = "tb-knob-val";
  const nm = document.createElement("div");
  nm.className = "tb-knob-name";
  nm.textContent = short;
  col.append(k, val, nm);

  const show = (v: number) => {
    const t = knob.log
      ? (Math.log(v) - Math.log(knob.min)) / (Math.log(knob.max) - Math.log(knob.min))
      : (v - knob.min) / (knob.max - knob.min);
    ind.style.transform = `rotate(${-135 + Math.min(1, Math.max(0, t)) * 270}deg)`;
    val.textContent = knob.fmt ? knob.fmt(v) : v.toFixed(2);
  };
  let startY = 0;
  let startVal = 0;
  k.addEventListener("pointerdown", (e) => {
    draggingKnob = k;
    startY = e.clientY;
    startVal = knob.get();
    // Grabbing a knob takes manual control: pin it (Auto won't overwrite) and
    // drop any per-param auto, so your change sticks.
    autoOverride.add(knob);
    paramAuto.delete(knob);
    k.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  k.addEventListener("pointermove", (e) => {
    if (draggingKnob !== k) return;
    const fine = e.shiftKey ? 0.25 : 1;
    const frac = ((startY - e.clientY) / 180) * fine; // ~180px = full sweep
    let v: number;
    if (knob.log) {
      // Multiplicative drag, like the scroll wheel.
      const lmin = Math.log(knob.min), lmax = Math.log(knob.max);
      const lv = Math.min(lmax, Math.max(lmin, Math.log(Math.max(knob.min, startVal)) + frac * (lmax - lmin)));
      v = Math.exp(lv);
    } else {
      v = Math.min(knob.max, Math.max(knob.min, startVal + frac * (knob.max - knob.min)));
      if (knob.step >= 1) v = Math.round(v / knob.step) * knob.step;
    }
    knob.set(v);
    show(v);
  });
  const end = (e: PointerEvent) => {
    if (draggingKnob === k) draggingKnob = null;
    try { k.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  k.addEventListener("pointerup", end);
  k.addEventListener("pointercancel", end);
  // Double-click toggles auto for this knob. In global Auto mode it un-pins the
  // knob (hands it back to Auto); otherwise it toggles the knob's own per-param auto.
  k.addEventListener("dblclick", () => {
    if (auto.on) {
      if (autoOverride.has(knob)) autoOverride.delete(knob);
      else autoOverride.add(knob);
    } else if (paramAuto.has(knob)) {
      paramAuto.delete(knob);
    } else {
      paramAuto.add(knob);
      autoOverride.delete(knob);
    }
  });
  autoKnobs.push({ knob, el: k, phase: Math.random() * Math.PI * 2, period: 24 + Math.random() * 24 });
  refreshers.push(() => {
    // Cyan = per-param auto (Auto off). Amber = pinned manual (Auto on).
    k.classList.toggle("auto", !auto.on && paramAuto.has(knob));
    k.classList.toggle("pinned", auto.on && autoOverride.has(knob));
    if (draggingKnob !== k) show(knob.get());
  });
  return col;
}
interface AutoFlag { get: () => boolean; set: (b: boolean) => void; }
function tbSelect(
  options: string[],
  getIndex: () => number,
  setIndex: (i: number) => void,
  autoFlag?: AutoFlag,
): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "tb-select";
  if (autoFlag) {
    const opt = document.createElement("option");
    opt.value = "auto";
    opt.textContent = "🔄 Auto";
    sel.appendChild(opt);
  }
  options.forEach((o, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    if (sel.value === "auto") { autoFlag?.set(true); return; }
    autoFlag?.set(false);
    setIndex(parseInt(sel.value));
  };
  refreshers.push(() => {
    if (document.activeElement === sel) return;
    sel.value = autoFlag?.get() ? "auto" : String(getIndex());
    sel.classList.toggle("auto", !!autoFlag?.get());
  });
  return sel;
}
const nextBg = () => {
  if (state.useTex) state.useTex = false;
  else if (hasImages()) state.useTex = true;
  else toast("Drop an image first");
};

// Thumbnail grid of loaded images — click to select. Rebuilt when images change.
const imgGridEl = document.createElement("div");
imgGridEl.className = "tb-imgs";
function rebuildImageGrid() {
  imgGridEl.innerHTML = "";
  if (!images.length) {
    const e = document.createElement("div");
    e.className = "tb-empty";
    e.textContent = "drop image(s) anywhere";
    imgGridEl.appendChild(e);
    return;
  }
  images.forEach((src, i) => {
    const im = document.createElement("img");
    im.src = src;
    im.className = "tb-thumb";
    im.title = `image ${i + 1}`;
    im.onclick = () => { imageIndex = i; loadImage(images[i], true); rebuildImageGrid(); };
    if (i === imageIndex && state.useTex) im.classList.add("sel");
    imgGridEl.appendChild(im);
  });
  // Trashcan flows as the last grid cell — wraps to the next row like a thumbnail.
  const trash = document.createElement("button");
  trash.className = "tb-trash";
  trash.textContent = "🗑";
  trash.title = "delete the selected image";
  trash.onclick = () => deleteCurrentImage();
  imgGridEl.appendChild(trash);
}

tbRow(tbButton(() => (paused ? "▶ Play" : "⏸ Pause"), () => (paused = !paused), () => paused));

tbSection("Modes");
tbRow(tbButton(() => "Auto", () => toggleAuto(), () => auto.on), tbKnob(ADJUST.autotempo.primary!, "rate"));
tbRow(tbButton(() => "Spin", () => (view.spinning = !view.spinning), () => view.spinning), tbKnob(ADJUST.spin.primary!, "speed"));
tbRow(
  tbButton(() => "Drift", () => (view.autoDrift = !view.autoDrift), () => view.autoDrift),
  tbKnob(ADJUST.drift.primary!, "amt"),
  tbKnob(ADJUST.drift.secondary!, "speed"),
);

// Zoom: current level + the range/speed used when zoom is auto'd (double-click
// the zoom knob to auto it; it oscillates between min and max at "speed").
tbSection("Zoom");
tbRow(
  tbKnob(ADJUST.zoom.primary!, "zoom"),
  tbKnob(ADJUST.zoommin.primary!, "min"),
  tbKnob(ADJUST.zoommax.primary!, "max"),
  tbKnob(ADJUST.zoomspeed.primary!, "speed"),
);

tbSection("Beat");
tbRow(
  tbButton(() => "Beat", () => { beat.on = !beat.on; if (beat.on) beat.phase = 0; }, () => beat.on),
  tbKnob(ADJUST.bpm.primary!, "bpm"),
  tbKnob(ADJUST.bpm.secondary!, "hit"),
);
tbRow(tbButton(() => "Tap tempo", () => tapTempo()));

tbSection("Effects");
tbRow(
  tbButton(() => "Warp", () => (fx.warpOn = !fx.warpOn), () => fx.warpOn),
  tbKnob(ADJUST.warp.primary!, "deg"),
  tbKnob(ADJUST.warp.secondary!, "speed"),
);
tbRow(
  tbButton(() => "Glow", () => (fx.glowOn = !fx.glowOn), () => fx.glowOn),
  tbKnob(ADJUST.glow.primary!, "int"),
  tbKnob(ADJUST.glow.secondary!, "thk"),
);
tbRow(
  tbButton(() => "Lasers", () => (lasers.on = !lasers.on), () => lasers.on),
  tbKnob(ADJUST.lasers.primary!, "n"),
  tbKnob(ADJUST.lasers.secondary!, "speed"),
);

tbSection("Lens");
tbRow(
  tbSelect(LENS_NAMES, () => lens.mode, (i) => (lens.mode = i),
    { get: () => lens.autoCycle, set: (b) => (lens.autoCycle = b) }),
  tbKnob(ADJUST.lens.primary!, "amt"),
  tbKnob(ADJUST.lensspeed.primary!, "speed"),
);

tbSection("Shape");
tbRow(
  tbSelect(SHAPES.map((s) => s.name), () => view.shape, (i) => (view.shape = i),
    { get: () => view.shapeAuto, set: (b) => (view.shapeAuto = b) }),
  tbKnob(ADJUST.segments.primary!, "seg"),
  tbKnob(ADJUST.shapespeed.primary!, "speed"),
);

tbSection("Color");
tbRow(
  tbButton(() => "Hue", () => { fx.hueOn = !fx.hueOn; if (!fx.hueOn) fx.hue = 0; }, () => fx.hueOn),
  tbKnob(ADJUST.hue.primary!, "speed"),
  tbKnob(ADJUST.hue.secondary!, "tint"),
);
tbRow(
  tbKnob(ADJUST.gradmap.primary!, "map"),
  tbKnob(ADJUST.saturation.primary!, "sat"),
  tbKnob(ADJUST.contrast.primary!, "con"),
  tbKnob(ADJUST.posterize.primary!, "post"),
  tbKnob(ADJUST.solarize.primary!, "sol"),
);

tbSection("Background");
tbRow(
  tbButton(() => `BG: ${state.useTex ? "image" : "plasma"}`, nextBg),
  tbButton(() => "Img drift", () => (fx.panImgOn = !fx.panImgOn), () => fx.panImgOn),
);
tbRow(
  tbKnob(ADJUST.imgdrift.primary!, "range"),
  tbKnob(ADJUST.imgdrift.secondary!, "speed"),
  tbKnob(ADJUST.imghold.primary!, "hold"),
);
tbBody.appendChild(imgGridEl);
rebuildImageGrid();
refreshers.push(() => {
  const kids = imgGridEl.children;
  for (let i = 0; i < kids.length; i++) {
    (kids[i] as HTMLElement).classList.toggle("sel", i === imageIndex && state.useTex);
  }
});

// Reset every control to factory defaults — but keep the dropped images.
function resetAll() {
  resetParams();            // all knob values
  paramAuto.clear();        // per-param autos
  autoOverride.clear();     // manual pins
  view.spinning = true; view.autoDrift = true;
  view.shape = 0; view.shapeAuto = false;
  fx.warpOn = false; fx.glowOn = false; fx.hueOn = false; fx.hue = 0; fx.panImgOn = false;
  lasers.on = false;
  beat.on = false;
  lens.mode = 0; lens.autoCycle = false;
  auto.on = false;
  toast("Reset to defaults");
}

// Output size: render at an exact resolution (letterboxed) so screenshots and
// recordings come out at that size, or "fit" the window.
const dims = { mode: "fit" as "fit" | "fixed", w: 1920, h: 1080 };
const SIZES: [string, number, number][] = [
  ["Fit window", 0, 0],
  ["1920 × 1080", 1920, 1080],
  ["1280 × 720", 1280, 720],
  ["3840 × 2160 (4K)", 3840, 2160],
  ["1080 × 1080 (square)", 1080, 1080],
  ["1080 × 1920 (vertical)", 1080, 1920],
  ["1280 × 960 (4:3)", 1280, 960],
  ["640 × 480", 640, 480],
];

tbSection("Output size");
const sizeSel = document.createElement("select");
sizeSel.className = "tb-select";
SIZES.forEach(([name], i) => {
  const o = document.createElement("option");
  o.value = String(i);
  o.textContent = name;
  sizeSel.appendChild(o);
});
const customOpt = document.createElement("option");
customOpt.value = "custom";
customOpt.textContent = "Custom";
sizeSel.appendChild(customOpt);

const wIn = document.createElement("input");
wIn.type = "number"; wIn.className = "tb-num"; wIn.min = "16"; wIn.step = "1";
const hIn = document.createElement("input");
hIn.type = "number"; hIn.className = "tb-num"; hIn.min = "16"; hIn.step = "1";
const xSpan = document.createElement("span");
xSpan.className = "tb-x"; xSpan.textContent = "×";

function matchSizePreset() {
  if (dims.mode === "fit") { sizeSel.value = "0"; return; }
  const idx = SIZES.findIndex(([, w, h]) => w === dims.w && h === dims.h);
  sizeSel.value = idx >= 0 ? String(idx) : "custom";
}
sizeSel.onchange = () => {
  if (sizeSel.value !== "custom") {
    const [, w, h] = SIZES[+sizeSel.value];
    if (w === 0) dims.mode = "fit";
    else { dims.mode = "fixed"; dims.w = w; dims.h = h; }
  } else {
    dims.mode = "fixed";
  }
  resize();
};
const applyManual = () => {
  const w = Math.max(16, Math.round(+wIn.value || 0));
  const h = Math.max(16, Math.round(+hIn.value || 0));
  if (w >= 16 && h >= 16) { dims.mode = "fixed"; dims.w = w; dims.h = h; resize(); matchSizePreset(); }
};
wIn.onchange = applyManual;
hIn.onchange = applyManual;
tbRow(sizeSel);
tbRow(wIn, xSpan, hIn);
refreshers.push(() => {
  if (document.activeElement !== sizeSel) matchSizePreset();
  if (document.activeElement !== wIn) wIn.value = String(dims.w);
  if (document.activeElement !== hIn) hIn.value = String(dims.h);
});

tbSection("Capture");
tbRow(tbButton(() => "📷 Screenshot (PNG)", () => takeScreenshot()));
const recBtn = tbButton(() => (recorder ? "■ Stop & save" : "● Record"), () => toggleRecord());
refreshers.push(() => recBtn.classList.toggle("rec", !!recorder));
tbRow(recBtn);
tbRow(
  tbButton(() => "Discard", () => discardRecording()),
  tbButton(() => "Reset", () => resetAll()),
);

// Drag the toolbar by its header.
let tbDrag = false;
let tbOff: [number, number] = [0, 0];
tbHead.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).id === "tbHide") return;
  tbDrag = true;
  const r = toolbar.getBoundingClientRect();
  tbOff = [e.clientX - r.left, e.clientY - r.top];
  tbHead.setPointerCapture(e.pointerId);
});
tbHead.addEventListener("pointermove", (e) => {
  if (!tbDrag) return;
  toolbar.style.left = `${e.clientX - tbOff[0]}px`;
  toolbar.style.top = `${e.clientY - tbOff[1]}px`;
  toolbar.style.right = "auto";
});
tbHead.addEventListener("pointerup", (e) => {
  tbDrag = false;
  try { tbHead.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
});

function toggleToolbar() {
  toolbar.classList.toggle("hidden");
}
(document.getElementById("tbHide") as HTMLSpanElement).addEventListener("click", toggleToolbar);
window.addEventListener("keydown", (e) => {
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT") return; // don't steal keys while typing
  if (e.key.toLowerCase() === "t") toggleToolbar();
});
// ---- settings persistence -------------------------------------------------
// Save the full control state to localStorage so a refresh restores your setup.
// (Pan/rotation/palette stay random each load for a fresh composition.)
const SETTINGS_KEY = "kaleidoscope.settings";
function saveSettings() {
  try {
    const s = {
      view: {
        scale: view.scale, spin: view.spin, spinning: view.spinning, autoDrift: view.autoDrift,
        driftAmp: view.driftAmp, driftFreq: view.driftFreq, shape: view.shape,
        shapeAuto: view.shapeAuto, segments: view.segments,
      },
      fx: {
        warpOn: fx.warpOn, warpStrength: fx.warpStrength, warpSpeed: fx.warpSpeed,
        glowOn: fx.glowOn, glowStrength: fx.glowStrength, glowWidth: fx.glowWidth,
        hueOn: fx.hueOn, hueSpeed: fx.hueSpeed, hueBase: fx.hueBase,
        panImgOn: fx.panImgOn, panImgSpeed: fx.panImgSpeed, panImgRange: fx.panImgRange,
      },
      lasers: { on: lasers.on, count: lasers.count, speed: lasers.speed, glowTarget: lasers.glowTarget },
      lens: { mode: lens.mode, amt: lens.amt, autoCycle: lens.autoCycle },
      color: { ...color },
      beat: { on: beat.on, bpm: beat.bpm, impact: beat.impact },
      auto: { on: auto.on, rate: auto.rate, imgHold: auto.imgHold },
      zoomCfg: { ...zoomCfg }, shapeCycle: { ...shapeCycle }, lensCycle: { ...lensCycle },
      dims: { ...dims },
      paramAuto: [...paramAuto].map((k) => knobToId.get(k)).filter(Boolean),
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* storage full / unavailable — ignore */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.view) Object.assign(view, s.view);
    if (s.fx) Object.assign(fx, s.fx);
    if (s.lasers) Object.assign(lasers, s.lasers);
    if (s.lens) Object.assign(lens, s.lens);
    if (s.color) Object.assign(color, s.color);
    if (s.beat) Object.assign(beat, s.beat);
    if (s.zoomCfg) Object.assign(zoomCfg, s.zoomCfg);
    if (s.shapeCycle) Object.assign(shapeCycle, s.shapeCycle);
    if (s.lensCycle) Object.assign(lensCycle, s.lensCycle);
    if (s.dims) Object.assign(dims, s.dims);
    // Don't auto-resume global Auto mode on load — it would silently override
    // manual controls (e.g. zoom). Restore its tunables only.
    if (s.auto) { auto.rate = s.auto.rate ?? auto.rate; auto.imgHold = s.auto.imgHold ?? auto.imgHold; }
    if (Array.isArray(s.paramAuto)) for (const id of s.paramAuto) { const k = idToKnob.get(id); if (k) paramAuto.add(k); }
    rebuildLasers();
  } catch { /* corrupt — ignore */ }
}
// `?reset` opens with factory defaults; otherwise restore the saved setup.
if (new URLSearchParams(location.search).has("reset")) localStorage.removeItem(SETTINGS_KEY);
else loadSettings();
setInterval(saveSettings, 1500);
window.addEventListener("beforeunload", saveSettings);

refreshers.forEach((r) => r()); // initial paint

// drag & drop an image as the background
window.addEventListener("dragover", (e) => { e.preventDefault(); dropOverlay.classList.add("show"); });
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) dropOverlay.classList.remove("show");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dropOverlay.classList.remove("show");
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result as string);
    reader.readAsDataURL(file);
  }
});

// ---- resize ---------------------------------------------------------------
// "fit" fills the window (buffer = window × dpr). "fixed" renders at an exact
// resolution (so screenshots/recordings are exactly that size), scaled to fit the
// window and letterboxed on the black background — browsers can't resize the real
// window, so we size the canvas instead.
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let bufW: number, bufH: number, cssW: number, cssH: number;
  if (dims.mode === "fixed") {
    bufW = dims.w;
    bufH = dims.h;
    const scale = Math.min(vw / bufW, vh / bufH);
    cssW = Math.round(bufW * scale);
    cssH = Math.round(bufH * scale);
  } else {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bufW = Math.floor(vw * dpr);
    bufH = Math.floor(vh * dpr);
    cssW = vw;
    cssH = vh;
  }
  if (canvas.width !== bufW || canvas.height !== bufH) {
    canvas.width = bufW;
    canvas.height = bufH;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.left = `${Math.round((vw - cssW) / 2)}px`;
  canvas.style.top = `${Math.round((vh - cssH) / 2)}px`;
  gl!.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

// ---- autopilot ------------------------------------------------------------
// Sine LFO mapped to [min,max]. Distinct prime-ish periods keep the combined
// motion from visibly repeating.
function lfo(period: number, min: number, max: number, phase = 0) {
  const s = 0.5 + 0.5 * Math.sin((auto.time * 2 * Math.PI) / period + phase);
  return min + (max - min) * s;
}
// Like lfo but with a rate multiplier (for knobs with their own speed control).
function lfoRange(period: number, lo: number, hi: number, rateMul: number, phase = 0) {
  const s = 0.5 + 0.5 * Math.sin((auto.time * 2 * Math.PI * rateMul) / period + phase);
  return lo + (hi - lo) * s;
}

// Auto writes a knob only if the user hasn't pinned it — so manual tweaks stick.
function drive(knob: Knob, v: number) {
  if (!autoOverride.has(knob)) knob.set(v);
}

function toggleAuto() {
  auto.on = !auto.on;
  if (auto.on) {
    // Stagger first scene changes so they don't all fire at once on start.
    auto.triTimer = 60 + Math.random() * 40;
    auto.lensTimer = 80 + Math.random() * 70;
    auto.laserTimer = 40 + Math.random() * 40;
    auto.segTimer = 30 + Math.random() * 40;
    lasers.on = true;
  } else {
    lasers.on = false; // don't leave beams running after autopilot ends
  }
  toast(auto.on ? "Auto mode: ON — sit back" : "Auto mode: OFF");
}

function updateAuto(dt: number) {
  const r = auto.rate;
  auto.time += dt * r;

  // Continuous, smoothly-evolving parameters. Long periods + gentle speed caps
  // keep it a slow, chill exploration rather than a fast strobe. Every "speed"
  // param (which drives how fast things shimmer/move) is also multiplied by the
  // global auto.rate so a single knob slows the whole mood down.
  // Zoom breathes from fairly tight all the way out to wide, so big tiled
  // patterns get revealed (it used to top out at 1.6 and never really pan out).
  drive(ADJUST.zoom.primary!, lfoRange(140, zoomCfg.min, zoomCfg.max, zoomCfg.speed, 0));
  drive(ADJUST.spin.primary!, lfo(150, -0.045, 0.045, 1.3) * r);
  // Roam across the background; layered long periods avoid retracing the path.
  view.pan[0] = Math.sin(auto.time / 85) * 2.4 + Math.sin(auto.time / 40) * 0.4;
  view.pan[1] = Math.cos(auto.time / 100) * 2.4 + Math.cos(auto.time / 46) * 0.4;

  // Effects stay enabled and breathe via their strength targets (which dip to
  // ~0 for stretches, reading as off) instead of hard on/off flips.
  // Warp has a big visual impact, so keep it gentle: lower-mid strength, off much
  // of the time, and a slow ripple — fast wobble reads as aggressive, especially
  // while the image is panning.
  fx.warpOn = true;
  drive(ADJUST.warp.primary!, Math.max(0, lfo(150, -0.9, 0.45, 0.0)));
  drive(ADJUST.warp.secondary!, lfo(190, 0.025, 0.085, 1.0) * r);
  fx.glowOn = true;
  drive(ADJUST.glow.primary!, Math.max(0, lfo(70, -0.6, 2.0, 2.1)));
  drive(ADJUST.glow.secondary!, lfo(95, 1.5, 5.5, 0.5));
  fx.hueOn = true;
  drive(ADJUST.hue.primary!, lfo(165, -0.15, 0.22, 0.7) * r);
  fx.panImgOn = true;
  drive(ADJUST.imgdrift.primary!, lfo(90, 0.2, 1.0, 0.0));
  drive(ADJUST.imgdrift.secondary!, lfo(175, 0.02, 0.085, 1.4) * r);

  // Lasers ride along, breathing in and out so they're an accent, not constant.
  lasers.on = true;
  lasers.glowTarget = Math.max(0, lfo(60, -0.7, 1.1, 1.0));
  drive(ADJUST.lasers.secondary!, lfo(120, 0.18, 0.5, 0.3) * r);

  // Coloring drifts gently — gradient-map breathes in and out, saturation and
  // contrast wander mildly around neutral. (Posterize/solarize are left manual:
  // they're strobe-y and would fight the chill vibe.)
  drive(ADJUST.gradmap.primary!, Math.max(0, lfo(110, -0.6, 0.55, 1.7)));
  drive(ADJUST.saturation.primary!, lfo(95, 0.85, 1.35, 0.4));
  drive(ADJUST.contrast.primary!, lfo(135, 0.92, 1.28, 1.1));

  // Discrete scene changes on independent random timers, scaled by Auto Rate so
  // lowering the rate also makes scene changes less frequent.
  if ((auto.triTimer -= dt * r * shapeCycle.speed) <= 0) {
    view.shape = (view.shape + 1) % SHAPES.length;
    auto.triTimer = 70 + Math.random() * 80;
  }
  // (Image cycling runs in the main loop so the HOLD knob works outside Auto too.)
  // Background lock: if any images exist, auto stays on the image library and
  // only cycles between them (never the procedural plasma); with none, it stays
  // on the procedural plasma.
  if (images.length > 0) {
    if (!state.useTex) {
      imageIndex = Math.max(0, imageIndex);
      loadImage(images[imageIndex], true);
    }
  } else {
    state.useTex = false;
  }
  if ((auto.lensTimer -= dt * r * lensCycle.speed) <= 0) {
    lens.mode = (lens.mode + 1) % LENS_NAMES.length;
    auto.lensTimer = 85 + Math.random() * 75;
  }
  drive(ADJUST.lens.primary!, lfo(70, 0.4, 1.3, 0.6));
  if ((auto.laserTimer -= dt * r) <= 0) {
    drive(ADJUST.lasers.primary!, 2 + ((Math.random() * 3) | 0)); // set rounds + rebuilds
    auto.laserTimer = 60 + Math.random() * 60; // less frequent count changes
  }
  // Vary the mandala/spiral wedge count now and then (a pleasant set of symmetries).
  if ((auto.segTimer -= dt * r) <= 0) {
    const choices = [4, 5, 6, 8, 10, 12];
    drive(ADJUST.segments.primary!, choices[(Math.random() * choices.length) | 0]);
    auto.segTimer = 35 + Math.random() * 45;
  }
}

// ---- render loop ----------------------------------------------------------
let animTime = 0;   // accumulated animation time; only advances when not paused
let framePrev = 0;
let lastUiRefresh = 0;
let imgCycleTimer = 0; // counts down to the next image transition (HOLD knob)
let lensCycleTimer = 0;
let shapeCycleTimer = 0;
function frame(now: number) {
  const raw = Math.min(0.05, framePrev ? (now - framePrev) / 1000 : 0);
  framePrev = now;
  // Pause freezes the clock: dt = 0 stops all integration, and the frozen
  // animTime stops the shader's time-driven motion (plasma, warp, lasers).
  const dt = paused ? 0 : raw;
  animTime += dt;
  const t = animTime;

  resize();

  if (auto.on) updateAuto(dt);

  // Per-parameter auto (double-clicked knobs + "Auto" dropdowns). Global Auto
  // mode overrides everything, so these only drive when it's off.
  if (!auto.on) {
    // Per-param speed scales with the Auto Rate knob, so the same control slows
    // everything down (lower rate = gentler sweeps and rarer scene changes).
    const ar = auto.rate;
    for (const ak of autoKnobs) {
      if (!paramAuto.has(ak.knob) || draggingKnob === ak.el) continue;
      const k = ak.knob;
      const lo = k.autoLo ? k.autoLo() : k.min;
      const hi = k.autoHi ? k.autoHi() : k.max;
      const rate = ar * (k.autoRate ? k.autoRate() : 1);
      let v = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((animTime * 2 * Math.PI * rate) / ak.period + ak.phase));
      if (k.step >= 1) v = Math.round(v / k.step) * k.step;
      if (v !== k.get()) k.set(v); // only set on change (cheap for structural knobs)
    }
    if (lens.autoCycle && (lensCycleTimer -= dt * ar * lensCycle.speed) <= 0) {
      lens.mode = (lens.mode + 1) % LENS_NAMES.length;
      lensCycleTimer = 20 + Math.random() * 20;
    }
    if (view.shapeAuto && (shapeCycleTimer -= dt * ar * shapeCycle.speed) <= 0) {
      view.shape = (view.shape + 1) % SHAPES.length;
      shapeCycleTimer = 28 + Math.random() * 24;
    }
  }

  // Auto-advance images on the HOLD knob — works in or out of Auto mode. 0 = off.
  if (auto.imgHold > 0 && state.useTex && images.length > 1) {
    imgCycleTimer -= dt;
    if (imgCycleTimer <= 0) {
      cycleImage();
      imgCycleTimer = auto.imgHold;
    }
  } else {
    imgCycleTimer = auto.imgHold; // armed for when conditions are met again
  }

  // Keep the toolbar in sync with live values (~8 Hz is plenty, skips dragging).
  if (!toolbar.classList.contains("hidden") && now - lastUiRefresh > 120) {
    lastUiRefresh = now;
    for (const r of refreshers) r();
  }

  if (view.spinning) view.rot += view.spin * dt;
  if (view.autoDrift && !auto.on) {
    view.pan[0] += Math.cos(t * 0.31 * view.driftFreq) * 0.12 * view.driftAmp * dt;
    view.pan[1] += Math.sin(t * 0.23 * view.driftFreq) * 0.12 * view.driftAmp * dt;
  }

  // Ease effect strengths toward their on/off targets.
  const ease = Math.min(1, dt * 5);
  fx.warp += ((fx.warpOn ? fx.warpStrength : 0) - fx.warp) * ease;
  fx.glow += ((fx.glowOn ? fx.glowStrength : 0) - fx.glow) * ease;
  if (fx.hueOn) fx.hue = (fx.hue + dt * fx.hueSpeed) % (Math.PI * 2);
  if (fx.panImgOn) {
    fx.texPhase += dt * fx.panImgSpeed;
    fx.texPan[0] = Math.cos(fx.texPhase) * fx.panImgRange;
    fx.texPan[1] = Math.sin(fx.texPhase * 0.8) * fx.panImgRange;
  }

  // Lasers: ease the glow, drift each beam's angle, and pack the uniforms. The
  // sweep offset c oscillates so each beam slides back and forth across the
  // fundamental triangle (and thus bounces around the whole scope).
  lasers.glow += ((lasers.on ? lasers.glowTarget : 0) - lasers.glow) * ease;
  const beamCount = lasers.beams.length;
  for (let i = 0; i < beamCount; i++) {
    const b = lasers.beams[i];
    b.angle += b.angleSpeed * lasers.speed * dt;
    laserN[i * 2] = Math.cos(b.angle);
    laserN[i * 2 + 1] = Math.sin(b.angle);
    laserC[i] = Math.sin(t * b.sweepSpeed * lasers.speed + b.phase) * b.sweepRange;
    laserCol[i * 3] = b.col[0];
    laserCol[i * 3 + 1] = b.col[1];
    laserCol[i * 3 + 2] = b.col[2];
  }

  // Beat sync: advance the musical clock and derive smooth pulses. sin(pi*f)^2
  // is 0 at the beat boundaries and peaks mid-beat, so it's continuous across
  // beats — a pulse you feel, never a jump, at any BPM.
  if (beat.on) beat.phase = (beat.phase + dt * beat.bpm / 60) % 1024;
  const beatF = beat.phase - Math.floor(beat.phase);
  const barF = beat.phase * 0.25 - Math.floor(beat.phase * 0.25);
  const beatPulse = beat.on ? Math.sin(Math.PI * beatF) ** 2 : 0;
  const barPulse = beat.on ? Math.sin(Math.PI * barF) ** 2 : 0;
  const imp = beat.impact;
  // A gentle inward zoom swell on each beat, plus a slower bar swell.
  const beatScale = view.scale * (1 - 0.05 * imp * beatPulse);

  const shape = SHAPES[view.shape];
  const tri = shape.tri ?? TRIANGLES[0];
  gl!.uniform2f(loc.res, canvas.width, canvas.height);
  gl!.uniform1f(loc.time, t + timeSeed);
  gl!.uniform2f(loc.pan, view.pan[0], view.pan[1]);
  gl!.uniform1f(loc.scale, beatScale);
  gl!.uniform1i(loc.foldMode, shape.mode);
  gl!.uniform1f(loc.segments, view.segments);
  // Use more fold passes the farther out/panned we are, so distant points still
  // reflect all the way into the fundamental triangle. Cheap when zoomed in.
  const extent = 1.6 * view.scale + Math.hypot(view.pan[0], view.pan[1]) + fx.warp;
  gl!.uniform1i(loc.foldIters, Math.max(10, Math.min(96, Math.ceil(extent / 0.75) + 2)));
  gl!.uniform1f(loc.rot, view.rot);
  gl!.uniform2f(loc.n0, tri.n[0][0], tri.n[0][1]); gl!.uniform1f(loc.d0, tri.d[0]);
  gl!.uniform2f(loc.n1, tri.n[1][0], tri.n[1][1]); gl!.uniform1f(loc.d1, tri.d[1]);
  gl!.uniform2f(loc.n2, tri.n[2][0], tri.n[2][1]); gl!.uniform1f(loc.d2, tri.d[2]);
  gl!.uniform1i(loc.useTex, state.useTex ? 1 : 0);
  gl!.uniform2f(loc.texAspect, state.texAspect[0], state.texAspect[1]);
  gl!.uniform2f(loc.texPan, fx.texPan[0], fx.texPan[1]);
  gl!.uniform1f(loc.warp, fx.warp + 0.12 * imp * barPulse); // bar-synced warp swell
  gl!.uniform1f(loc.warpSpeed, fx.warpSpeed);
  gl!.uniform1f(loc.hue, fx.hue + fx.hueBase);
  // Beat flashes augment glow/lasers only when those effects are already on.
  gl!.uniform1f(loc.glow, fx.glow + (fx.glowOn ? 0.9 * imp * beatPulse : 0));
  gl!.uniform1f(loc.glowWidth, fx.glowWidth);
  gl!.uniform1i(loc.laserCount, beamCount);
  gl!.uniform2fv(loc.laserN, laserN);
  gl!.uniform1fv(loc.laserC, laserC);
  gl!.uniform3fv(loc.laserCol, laserCol);
  gl!.uniform1f(loc.laserGlow, lasers.glow + (lasers.on ? 0.6 * imp * beatPulse : 0));
  gl!.uniform1i(loc.lens, lens.mode);
  gl!.uniform1f(loc.lensAmt, lens.amt);
  palettePhase += dt * PALETTE_SPEED;
  gl!.uniform1f(loc.palette, palettePhase);
  gl!.uniform1f(loc.sat, color.sat);
  gl!.uniform1f(loc.contrast, color.contrast);
  gl!.uniform1f(loc.posterize, color.posterize);
  gl!.uniform1f(loc.solarize, color.solarize);
  gl!.uniform1f(loc.gradMap, color.gradMap);

  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, texture);

  gl!.drawArrays(gl!.TRIANGLES, 0, 3);

  if (pendingShot) {
    pendingShot = false;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const s = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadBlob(blob, `kaleidoscope-${s}.png`);
      toast("Screenshot saved");
    }, "image/png");
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
