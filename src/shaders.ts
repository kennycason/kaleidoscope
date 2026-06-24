export const vertexShader = /* glsl */ `#version 300 es
precision highp float;
// Fullscreen triangle; no attributes needed.
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){
  gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPan;
uniform float uScale;   // world half-height in fundamental units
uniform float uRot;

// Three mirror lines of the fundamental triangle: outward normal + offset.
// A point is "outside" edge i when dot(p, nI) > dI.
uniform vec2  uN0; uniform float uD0;
uniform vec2  uN1; uniform float uD1;
uniform vec2  uN2; uniform float uD2;

uniform int       uUseTex;
uniform sampler2D uTex;
uniform vec2      uTexAspect;
uniform vec2      uTexPan;   // drifting sample offset (roam across the image)

uniform float uWarp;      // funhouse domain-warp strength
uniform float uWarpSpeed; // domain-warp animation speed
uniform float uHue;       // hue rotation (radians)
uniform float uGlow;      // neon edge-glow strength
uniform float uGlowWidth; // neon seam thickness (in fwidth units)

// Lasers live in fundamental-domain space (each is a line dot(p,n)=c), so the
// fold replicates them across every mirror image — a beam bouncing inside the
// triangle, consistent with the kaleidoscope, instead of a screen-space overlay.
#define MAX_LASERS 5
uniform int   uLaserCount;
uniform vec2  uLaserN[MAX_LASERS];
uniform float uLaserC[MAX_LASERS];
uniform vec3  uLaserCol[MAX_LASERS];
uniform float uLaserGlow;

uniform int   uLens;     // 0 none, 1 fisheye, 2 fly-eye, 3 prism
uniform float uLensAmt;  // lens strength

uniform int   uFoldIters; // fold passes; scaled with zoom-out so far points still fold

uniform int   uFoldMode;  // 0 triangle mirrors, 1 mandala (N-fold), 2 spiral, 3 mirror box
uniform float uSegments;  // wedge count for mandala / spiral

uniform float uPalette;  // continuous palette phase (blends between presets)

// Coloring post-process (in addition to hue).
uniform float uSat;       // saturation (1 = neutral)
uniform float uContrast;  // contrast (1 = neutral)
uniform float uPosterize; // 0 = off, else number of levels
uniform float uSolarize;  // 0..1 invert-above-threshold blend
uniform float uGradMap;   // 0..1 recolor by luminance through the palette bank

#define PI 3.14159265359
#define TWO_PI 6.28318530718

vec2 reflectOut(vec2 p, vec2 n, float d){
  // Reflect across the line dot(p,n)=d only when the point is outside it.
  float s = dot(p, n) - d;
  return p - 2.0 * max(s, 0.0) * n;
}

// Triangle fold: repeated mirror reflection into the fundamental triangle. The
// triangle's reflection group tiles the plane, so this converges — the exact
// math of a 3-mirror kaleidoscope.
vec2 foldTri(vec2 p){
  for (int i = 0; i < uFoldIters; i++){
    p = reflectOut(p, uN0, uD0);
    p = reflectOut(p, uN1, uD1);
    p = reflectOut(p, uN2, uD2);
  }
  return p;
}

// Mandala fold: dihedral N-fold symmetry about the origin (the classic round
// tube-kaleidoscope). Fold the angle into one wedge and mirror within it.
vec2 foldPolar(vec2 p){
  float r = length(p);
  float a = atan(p.y, p.x);
  float k = TWO_PI / uSegments;
  a = mod(a, k);
  a = abs(a - 0.5 * k);
  return r * vec2(cos(a), sin(a));
}

// Spiral fold: same N-fold mandala but the angle is twisted by log-radius, so
// the wedges wind into an endless spiral.
vec2 foldSpiral(vec2 p){
  float r = length(p);
  float a = atan(p.y, p.x) + log(r + 1e-3) * 0.5;
  float k = TWO_PI / uSegments;
  a = mod(a, k);
  a = abs(a - 0.5 * k);
  return r * vec2(cos(a), sin(a));
}

// Mirror-box fold: reflect across a square grid — a hall-of-mirrors cube.
vec2 foldBox(vec2 p){
  return abs(mod(p, 2.0) - 1.0);
}

vec2 fold(vec2 p){
  if (uFoldMode == 1) return foldPolar(p);
  if (uFoldMode == 2) return foldSpiral(p);
  if (uFoldMode == 3) return foldBox(p);
  return foldTri(p);
}

// Inigo Quilez cosine palettes: colour = a + b*cos(2pi*(c*t + d)). A bank of
// presets we blend between (uPalette advances continuously), so the procedural
// background drifts smoothly through many colour moods rather than one.
#define NPAL 8
const vec3 PAL_A[NPAL] = vec3[NPAL](
  vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5),
  vec3(0.5, 0.5, 0.5), vec3(0.8, 0.5, 0.4), vec3(0.5, 0.5, 0.5), vec3(0.6, 0.4, 0.5));
const vec3 PAL_B[NPAL] = vec3[NPAL](
  vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5),
  vec3(0.5, 0.5, 0.5), vec3(0.2, 0.4, 0.2), vec3(0.5, 0.5, 0.5), vec3(0.4, 0.5, 0.3));
const vec3 PAL_C[NPAL] = vec3[NPAL](
  vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 0.5),
  vec3(2.0, 1.0, 0.0), vec3(2.0, 1.0, 1.0), vec3(1.0, 0.7, 0.4), vec3(1.0, 1.0, 1.0));
const vec3 PAL_D[NPAL] = vec3[NPAL](
  vec3(0.00, 0.33, 0.67), vec3(0.00, 0.10, 0.20), vec3(0.30, 0.20, 0.20), vec3(0.80, 0.90, 0.30),
  vec3(0.50, 0.20, 0.25), vec3(0.00, 0.25, 0.25), vec3(0.00, 0.15, 0.20), vec3(0.55, 0.70, 0.85));

vec3 cosPal(float t, int i){
  return PAL_A[i] + PAL_B[i] * cos(2.0 * PI * (PAL_C[i] * t + PAL_D[i]));
}

vec3 palette(float t){
  float ph = uPalette;
  float fl = floor(ph);
  int i = int(mod(fl, float(NPAL)));
  int j = int(mod(fl + 1.0, float(NPAL)));
  float f = smoothstep(0.0, 1.0, fract(ph));
  return mix(cosPal(t, i), cosPal(t, j), f);
}

vec3 proceduralBg(vec2 q){
  float t = uTime * 0.25;
  float v = 0.0;
  v += sin(q.x * 3.0 + t);
  v += sin(q.y * 3.7 - t * 1.2);
  v += sin((q.x + q.y) * 2.3 + t * 0.8);
  v += sin(length(q) * 5.0 - t * 2.0);
  v += sin(length(q * 1.7 + vec2(2.0)) * 4.0 + t * 1.5);
  v *= 0.2;
  vec3 col = palette(v + 0.5 * length(q) + t * 0.1);
  col += 0.15 * palette(v * 3.0 - t).bgr;
  return col;
}

vec3 sampleBg(vec2 q){
  if (uUseTex == 1){
    vec2 uv = q * 0.18 * uTexAspect + uTexPan;
    return texture(uTex, uv).rgb;
  }
  return proceduralBg(q);
}

// Rotate a color around the (1,1,1) luminance axis (Rodrigues rotation).
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float cosA = cos(a);
  return c * cosA + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cosA);
}

// Funhouse ripple, applied to a world point before folding.
vec2 warpWorld(vec2 w){
  if (uWarp > 0.0001){
    w += uWarp * vec2(
      sin(w.y * 3.0 + uTime * 1.3 * uWarpSpeed),
      sin(w.x * 3.0 - uTime * 1.1 * uWarpSpeed));
  }
  return w;
}

// Fold + sample the background at a world point (one full kaleidoscope lookup).
vec3 sceneAt(vec2 w){
  return sampleBg(fold(warpWorld(w)));
}

// Nearest hexagonal lattice centre to p (for the compound fly-eye lens).
vec2 hexNearest(vec2 p){
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = 0.5 * r;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  return dot(a, a) < dot(b, b) ? p - a : p - b;
}

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Voronoi "shatter": pull each point toward the nearest random cell centre, so
// the view fractures into irregular glass shards.
vec2 voronoiWarp(vec2 uv, float amt){
  vec2 sp = uv * 6.0;
  vec2 g = floor(sp);
  vec2 f = fract(sp);
  float md = 8.0;
  vec2 mCenter = sp;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 c = o + hash2(g + o) - f;
      float d = dot(c, c);
      if (d < md){ md = d; mCenter = g + o + hash2(g + o); }
    }
  }
  return mix(uv, mCenter / 6.0, clamp(amt, 0.0, 1.0) * 0.85);
}

// Glass tiles: a grid of little convex facets that magnify + bevel.
vec2 glassTiles(vec2 uv, float amt){
  float sc = 6.0;
  vec2 g = uv * sc;
  vec2 cell = floor(g) + 0.5;
  vec2 local = g - cell;
  local *= 1.0 - clamp(amt, 0.0, 1.0) * 0.6;
  local += 0.12 * amt * sin(local * TWO_PI);
  return (cell + local) / sc;
}

// Pre-filter "lens" distortions applied to the screen coordinate before it
// becomes a world point — like looking into the scope through a shaped lens.
vec2 applyLens(vec2 uv){
  if (uLens == 1){            // round fisheye (barrel)
    float r2 = dot(uv, uv);
    uv *= 1.0 - uLensAmt * 0.55 * r2;
  } else if (uLens == 2){     // compound hexagonal fly eye
    float sc = 7.0;
    vec2 q = uv * sc;
    vec2 c = hexNearest(q);
    vec2 local = q - c;
    uv = (c + local * (1.0 - clamp(uLensAmt, 0.0, 1.0) * 0.7)) / sc;
  } else if (uLens == 4){     // swirl / vortex
    float r = length(uv);
    float a = uLensAmt * 2.5 * r;
    float cs = cos(a), sn = sin(a);
    uv = mat2(cs, -sn, sn, cs) * uv;
  } else if (uLens == 5){     // tunnel (log-polar)
    float r = length(uv) + 1e-4;
    float a = atan(uv.y, uv.x);
    uv = vec2(a / PI, -log(r)) * (0.55 + uLensAmt * 0.5);
  } else if (uLens == 6){     // ripple / droplet
    float r = length(uv);
    float w = sin(r * 22.0 - uTime * 2.0) * 0.03 * uLensAmt;
    uv += normalize(uv + 1e-5) * w;
  } else if (uLens == 7){     // pinch / bulge
    float r2 = dot(uv, uv);
    uv *= 1.0 + uLensAmt * 0.7 * r2;
  } else if (uLens == 8){     // voronoi shatter
    uv = voronoiWarp(uv, uLensAmt);
  } else if (uLens == 9){     // glass tiles
    uv = glassTiles(uv, uLensAmt);
  }
  return uv;
}

void main(){
  // Aspect-correct screen coords, y in [-0.5, 0.5].
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float c = cos(uRot), s = sin(uRot);
  uv = mat2(c, -s, s, c) * uv;

  uv = applyLens(uv);

  vec2 world = uv * (2.0 * uScale) + uPan;
  vec2 p = fold(warpWorld(world));

  vec3 col;
  if (uLens == 3){
    // Prism: split the RGB channels along the view direction (chromatic
    // refraction) so the scope fringes like light through glass.
    vec2 dir = length(uv) > 1e-4 ? normalize(uv) : vec2(1.0, 0.0);
    float a = 0.012 * (1.0 + uLensAmt) * (2.0 * uScale);
    col = vec3(
      sceneAt(world + dir * a).r,
      sampleBg(p).g,
      sceneAt(world - dir * a).b);
  } else {
    col = sampleBg(p);
  }

  // Neon edge glow: light up the triangle's mirror seams (only meaningful for
  // the triangle fold, whose edges are uN/uD).
  if (uGlow > 0.0001 && uFoldMode == 0){
    float eDist = min(uD0 - dot(p, uN0), min(uD1 - dot(p, uN1), uD2 - dot(p, uN2)));
    float w = fwidth(eDist) + 1e-5;
    float line = 1.0 - smoothstep(0.0, uGlowWidth * w, eDist);
    vec3 neon = hueShift(vec3(0.25, 0.85, 1.0), uHue);
    col += uGlow * 1.4 * line * neon;
  }

  // Recolor by luminance through the palette bank (works on any source).
  if (uGradMap > 0.001){
    float l = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col = mix(col, palette(l), uGradMap);
  }
  if (abs(uHue) > 0.0001) col = hueShift(col, uHue);
  // Saturation, contrast, posterize, solarize.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  if (uPosterize >= 2.0){
    col = floor(col * (uPosterize - 1.0) + 0.5) / (uPosterize - 1.0);
  }
  if (uSolarize > 0.001){
    vec3 sol = mix(col, 1.0 - col, step(vec3(0.5), col));
    col = mix(col, sol, uSolarize);
  }
  col = clamp(col, 0.0, 1.0);

  // Lasers: each is a line in fundamental-domain space, so testing the folded
  // point makes the beam reflect off the mirror walls and tile through the
  // whole scope — aligned with the pattern instead of floating on top.
  if (uLaserGlow > 0.0001 && uLaserCount > 0){
    vec3 beams = vec3(0.0);
    for (int i = 0; i < MAX_LASERS; i++){
      if (i >= uLaserCount) break;
      float d = abs(dot(p, uLaserN[i]) - uLaserC[i]);
      float w = fwidth(d) + 1e-5;
      float core = 1.0 - smoothstep(0.0, 1.6 * w, d);
      float halo = 1.0 - smoothstep(0.0, 9.0 * w, d);
      beams += uLaserCol[i] * (core + 0.3 * halo);
    }
    col += uLaserGlow * beams;
  }

  float vig = smoothstep(1.3, 0.2, length(uv));
  col *= 0.55 + 0.45 * vig;

  fragColor = vec4(col, 1.0);
}
`;
