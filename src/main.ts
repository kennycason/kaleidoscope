import { fragmentShader, vertexShader } from "./shaders";
import { TRIANGLES } from "./triangles";

const canvas = document.getElementById("gl") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const toastEl = document.getElementById("toast") as HTMLDivElement;
const dropOverlay = document.getElementById("drop") as HTMLDivElement;

let toastTimer = 0;
function toast(msg: string) {
  // Suppress toggle notifications while the menu is hidden so they don't
  // interrupt the stream — they only show when the menu is open for tweaking.
  if (hud.classList.contains("hidden")) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1100);
}
const onOff = (b: boolean) => (b ? "ON" : "OFF");
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
}

// Show the next image in the library, wrapping around.
function cycleImage() {
  if (!hasImages()) { toast("No images yet — drop one"); return; }
  imageIndex = (imageIndex + 1) % images.length;
  loadImage(images[imageIndex], true);
  toast(`Image ${imageIndex + 1}/${images.length}`);
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
  triangle: 0,
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
const LENS_NAMES = ["off", "round (fisheye)", "compound (fly eye)", "prism"];
const lens = { mode: 0, amt: 1.0 };

// Procedural palette phase: advances continuously so the plasma background
// drifts smoothly through the shader's palette bank. ~33s per palette.
let palettePhase = 0;
const PALETTE_SPEED = 0.03;

// Autopilot ("A"): hands-free continual evolution. While on, it drives every
// parameter from slow sine LFOs and fires occasional discrete scene changes
// (switch triangle, cycle image, swap background, change lens). `time` only
// advances while on, so motion pauses and resumes rather than jumping.
const auto = {
  on: false,
  time: 0,
  rate: 0.7, // global tempo for everything auto drives (tune live with Up/Down)
  triTimer: 0,
  imgTimer: 0,
  lensTimer: 0,
  laserTimer: 0,
};
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
  const dy = (last[1] - e.clientY) * k; // invert: drag down moves the view down
  // Account for current rotation so dragging feels screen-aligned.
  const c = Math.cos(view.rot), s = Math.sin(view.rot);
  view.pan[0] -= c * dx + s * dy;
  view.pan[1] -= -s * dx + (-c) * dy; // screen y is down; world y is up
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
  view.scale = Math.min(30, Math.max(0.05, view.scale * factor));
}, { passive: false });

// ---- adjustable parameters ------------------------------------------------
// Each setting can expose a primary knob (Up/Down) and a secondary knob
// (Left/Right). Pressing a setting's toggle key makes it the active target, so
// the arrow keys always tune whatever you touched last.
interface Knob {
  label: string;
  get: () => number;
  set: (v: number) => void;
  step: number;
  min: number;
  max: number;
  fmt?: (v: number) => string;
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
  spin: {
    name: "Spin",
    primary: { label: "speed", get: () => view.spin, set: (v) => (view.spin = v), step: 0.02, min: -1, max: 1, fmt: num },
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

let activeSetting: keyof typeof ADJUST | null = null;

function bumpKnob(knob: Knob | undefined, dir: number, settingName: string) {
  if (!knob) return;
  const next = Math.min(knob.max, Math.max(knob.min, knob.get() + dir * knob.step));
  knob.set(next);
  const shown = knob.fmt ? knob.fmt(next) : num(next);
  toast(`${settingName} ${knob.label}: ${shown}`);
}

function adjustActive(primary: boolean, dir: number) {
  if (!activeSetting) { toast("Pick a setting first (W/G/C/L/R/Space/M)"); return; }
  const a = ADJUST[activeSetting];
  bumpKnob(primary ? a.primary : a.secondary, dir, a.name);
}

// Snapshot every arrow-tunable knob's starting value so `Z` can restore them.
// Captured now, before any keypress, so these are the true defaults.
const PARAM_DEFAULTS = Object.entries(ADJUST).map(([, a]) => ({
  primary: a.primary, pVal: a.primary?.get(),
  secondary: a.secondary, sVal: a.secondary?.get(),
}));

function resetParams() {
  for (const d of PARAM_DEFAULTS) {
    if (d.primary && d.pVal !== undefined) d.primary.set(d.pVal);
    if (d.secondary && d.sVal !== undefined) d.secondary.set(d.sVal);
  }
  toast("Parameters reset");
}

window.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup": e.preventDefault(); adjustActive(true, 1); return;
    case "arrowdown": e.preventDefault(); adjustActive(true, -1); return;
    case "arrowright": e.preventDefault(); adjustActive(false, 1); return;
    case "arrowleft": e.preventDefault(); adjustActive(false, -1); return;
    case " ":
      view.autoDrift = !view.autoDrift; e.preventDefault();
      activeSetting = "drift";
      toast(`Auto-drift: ${onOff(view.autoDrift)}`); break;
    case "r":
      view.spinning = !view.spinning; activeSetting = "spin";
      toast(`Spin: ${onOff(view.spinning)}`); break;
    case "1":
      view.triangle = (view.triangle + TRIANGLES.length - 1) % TRIANGLES.length;
      toast(TRIANGLES[view.triangle].name); break;
    case "2":
      view.triangle = (view.triangle + 1) % TRIANGLES.length;
      toast(TRIANGLES[view.triangle].name); break;
    case "l":
      lasers.on = !lasers.on; activeSetting = "lasers";
      toast(`Lasers: ${onOff(lasers.on)}`); break;
    case "v":
      lens.mode = (lens.mode + 1) % LENS_NAMES.length; activeSetting = "lens";
      toast(`Lens: ${LENS_NAMES[lens.mode]}`); break;
    case "w":
      fx.warpOn = !fx.warpOn; activeSetting = "warp";
      toast(`Warp mirror: ${onOff(fx.warpOn)}`); break;
    case "g":
      fx.glowOn = !fx.glowOn; activeSetting = "glow";
      toast(`Neon glow: ${onOff(fx.glowOn)}`); break;
    case "c":
      fx.hueOn = !fx.hueOn; activeSetting = "hue";
      if (!fx.hueOn) fx.hue = 0; // drop the cycling component, keep the base tint
      toast(`Hue cycle: ${onOff(fx.hueOn)}`); break;
    case "p":
      if (state.useTex) {
        state.useTex = false; toast("Background: procedural");
      } else if (hasImages()) {
        state.useTex = true; toast("Background: image");
      } else {
        toast("Background: procedural (drop an image)");
      }
      break;
    case "i":
      cycleImage(); break;
    case "m":
      fx.panImgOn = !fx.panImgOn; activeSetting = "imgdrift";
      toast(`Image drift: ${onOff(fx.panImgOn)}`); break;
    case "a":
      toggleAuto(); break;
    case "z":
      resetParams(); break;
    case "h":
      hud.classList.toggle("hidden");
      toast(hud.classList.contains("hidden") ? "Menu hidden — press H to show" : "Menu shown"); break;
  }
});

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
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
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

function toggleAuto() {
  auto.on = !auto.on;
  activeSetting = "autotempo"; // so Up/Down tunes the auto speed right away
  if (auto.on) {
    // Stagger first scene changes so they don't all fire at once on start.
    auto.triTimer = 60 + Math.random() * 40;
    auto.imgTimer = 120 + Math.random() * 90;
    auto.lensTimer = 80 + Math.random() * 70;
    auto.laserTimer = 40 + Math.random() * 40;
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
  view.scale = lfo(125, 0.6, 1.6, 0.0);
  view.spin = lfo(150, -0.045, 0.045, 1.3) * r;
  // Roam across the background; layered long periods avoid retracing the path.
  view.pan[0] = Math.sin(auto.time / 85) * 2.4 + Math.sin(auto.time / 40) * 0.4;
  view.pan[1] = Math.cos(auto.time / 100) * 2.4 + Math.cos(auto.time / 46) * 0.4;

  // Effects stay enabled and breathe via their strength targets (which dip to
  // ~0 for stretches, reading as off) instead of hard on/off flips.
  fx.warpOn = true;
  fx.warpStrength = Math.max(0, lfo(95, -0.7, 0.7, 0.0)); // off ~half the time, gentler bulge
  fx.warpSpeed = lfo(130, 0.04, 0.2, 1.0) * r;            // very slow ripple, not a vibration
  fx.glowOn = true;
  fx.glowStrength = Math.max(0, lfo(70, -0.6, 2.0, 2.1));
  fx.glowWidth = lfo(95, 1.5, 5.5, 0.5);
  fx.hueOn = true;
  fx.hueSpeed = lfo(165, -0.15, 0.22, 0.7) * r;           // slow colour drift
  fx.panImgOn = true;
  fx.panImgRange = lfo(90, 0.2, 1.0, 0.0);
  fx.panImgSpeed = lfo(175, 0.02, 0.085, 1.4) * r;

  // Lasers ride along, breathing in and out so they're an accent, not constant.
  lasers.on = true;
  lasers.glowTarget = Math.max(0, lfo(60, -0.7, 1.1, 1.0));
  lasers.speed = lfo(120, 0.18, 0.5, 0.3) * r;

  // Discrete scene changes on independent random timers.
  if ((auto.triTimer -= dt) <= 0) {
    view.triangle = (view.triangle + 1) % TRIANGLES.length;
    auto.triTimer = 70 + Math.random() * 80;
  }
  if ((auto.imgTimer -= dt) <= 0) {
    if (state.useTex && images.length > 1) cycleImage();
    auto.imgTimer = 150 + Math.random() * 150;
  }
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
  if ((auto.lensTimer -= dt) <= 0) {
    lens.mode = (lens.mode + 1) % LENS_NAMES.length;
    auto.lensTimer = 85 + Math.random() * 75;
  }
  lens.amt = lfo(70, 0.4, 1.3, 0.6);
  if ((auto.laserTimer -= dt) <= 0) {
    lasers.count = 2 + ((Math.random() * 3) | 0);
    rebuildLasers();
    auto.laserTimer = 45 + Math.random() * 45;
  }
}

// ---- render loop ----------------------------------------------------------
let start = performance.now();
function frame(now: number) {
  const t = (now - start) / 1000;
  const dt = Math.min(0.05, (now - (frame as any).prev || 0) / 1000 || 0);
  (frame as any).prev = now;

  resize();

  if (auto.on) updateAuto(dt);

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

  const tri = TRIANGLES[view.triangle];
  gl!.uniform2f(loc.res, canvas.width, canvas.height);
  gl!.uniform1f(loc.time, t);
  gl!.uniform2f(loc.pan, view.pan[0], view.pan[1]);
  gl!.uniform1f(loc.scale, view.scale);
  // Use more fold passes the farther out/panned we are, so distant points still
  // reflect all the way into the fundamental triangle. Cheap when zoomed in.
  const extent = 1.6 * view.scale + Math.hypot(view.pan[0], view.pan[1]) + fx.warp;
  gl!.uniform1i(loc.foldIters, Math.max(10, Math.min(48, Math.ceil(extent / 0.75) + 2)));
  gl!.uniform1f(loc.rot, view.rot);
  gl!.uniform2f(loc.n0, tri.n[0][0], tri.n[0][1]); gl!.uniform1f(loc.d0, tri.d[0]);
  gl!.uniform2f(loc.n1, tri.n[1][0], tri.n[1][1]); gl!.uniform1f(loc.d1, tri.d[1]);
  gl!.uniform2f(loc.n2, tri.n[2][0], tri.n[2][1]); gl!.uniform1f(loc.d2, tri.d[2]);
  gl!.uniform1i(loc.useTex, state.useTex ? 1 : 0);
  gl!.uniform2f(loc.texAspect, state.texAspect[0], state.texAspect[1]);
  gl!.uniform2f(loc.texPan, fx.texPan[0], fx.texPan[1]);
  gl!.uniform1f(loc.warp, fx.warp);
  gl!.uniform1f(loc.warpSpeed, fx.warpSpeed);
  gl!.uniform1f(loc.hue, fx.hue + fx.hueBase);
  gl!.uniform1f(loc.glow, fx.glow);
  gl!.uniform1f(loc.glowWidth, fx.glowWidth);
  gl!.uniform1i(loc.laserCount, beamCount);
  gl!.uniform2fv(loc.laserN, laserN);
  gl!.uniform1fv(loc.laserC, laserC);
  gl!.uniform3fv(loc.laserCol, laserCol);
  gl!.uniform1f(loc.laserGlow, lasers.glow);
  gl!.uniform1i(loc.lens, lens.mode);
  gl!.uniform1f(loc.lensAmt, lens.amt);
  palettePhase += dt * PALETTE_SPEED;
  gl!.uniform1f(loc.palette, palettePhase);

  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, texture);

  gl!.drawArrays(gl!.TRIANGLES, 0, 3);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
