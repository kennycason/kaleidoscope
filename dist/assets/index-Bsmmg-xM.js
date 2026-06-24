(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const m of i)if(m.type==="childList")for(const S of m.addedNodes)S.tagName==="LINK"&&S.rel==="modulepreload"&&o(S)}).observe(document,{childList:!0,subtree:!0});function a(i){const m={};return i.integrity&&(m.integrity=i.integrity),i.referrerPolicy&&(m.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?m.credentials="include":i.crossOrigin==="anonymous"?m.credentials="omit":m.credentials="same-origin",m}function o(i){if(i.ep)return;i.ep=!0;const m=a(i);fetch(i.href,m)}})();const rt=`#version 300 es
precision highp float;
// Fullscreen triangle; no attributes needed.
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){
  gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0);
}
`,st=`#version 300 es
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
`;function X(e,t){return[e[0]-t[0],e[1]-t[1]]}function Ge(e,t){return e[0]*t[0]+e[1]*t[1]}function le(e){return Math.hypot(e[0],e[1])}function it(e){const t=le(e)||1;return[e[0]/t,e[1]/t]}function ce(e,t,a,o,i){const m=le(X(a,o)),S=le(X(t,o)),p=le(X(t,a)),R=m+S+p,k=[(m*t[0]+S*a[0]+p*o[0])/R,(m*t[1]+S*a[1]+p*o[1])/R],_=X(t,k),T=X(a,k),W=X(o,k),D=[[_,T,W],[T,W,_],[W,_,T]],z=[[0,0],[0,0],[0,0]],b=[0,0,0];return D.forEach(([y,U,K],_e)=>{const ze=X(U,y);let J=it([-ze[1],ze[0]]);Ge(J,X(K,y))>0&&(J=[-J[0],-J[1]]),z[_e]=J,b[_e]=Ge(y,J)}),{name:e,n:z,d:b,order:i}}function ae(e,t,a,o){const i=t*Math.PI/180,m=a*Math.PI/180,S=Math.PI-i-m,p=Math.sin(m),R=Math.sin(S);return ce(e,[0,0],[R,0],[p*Math.cos(i),p*Math.sin(i)],o)}const lt=Math.sqrt(3),Ye=[ce("equilateral (60-60-60)",[Math.cos(Math.PI/2),Math.sin(Math.PI/2)],[Math.cos(Math.PI/2+2*Math.PI/3),Math.sin(Math.PI/2+2*Math.PI/3)],[Math.cos(Math.PI/2-2*Math.PI/3),Math.sin(Math.PI/2-2*Math.PI/3)],6),ce("right isosceles (45-45-90)",[0,0],[1,0],[0,1],8),ce("hemiequilateral (30-60-90)",[0,0],[lt,0],[0,1],12),ae("golden (72-72-36)",72,72,5),ae("golden gnomon (36-36-108)",36,36,10),ae("scalene (50-60-70)",50,60,7),ae("right scalene (35-55-90)",35,55,11),ae("acute sliver (24-30-126)",24,30,9)],w=document.getElementById("gl"),ge=document.getElementById("toast"),Ae=document.getElementById("drop");let We=0;function B(e){ge.textContent=e,ge.classList.add("show"),clearTimeout(We),We=window.setTimeout(()=>ge.classList.remove("show"),1100)}function ct(e){let t=2166136261;for(let a=0;a<e.length;a++)t^=e.charCodeAt(a),t=Math.imul(t,16777619);return t>>>0}function mt(e){return()=>{e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}const dt=new URLSearchParams(location.search).get("seed"),be=dt??String(Math.floor(Math.random()*1e9));Math.random=mt(ct(be));console.info(`[seed] ${be} — add ?seed=${be} to the URL to reproduce this start`);const n=w.getContext("webgl2",{antialias:!0,alpha:!1});if(!n)throw new Error("WebGL2 is not available in this browser.");function Ve(e,t){const a=n.createShader(e);if(n.shaderSource(a,t),n.compileShader(a),!n.getShaderParameter(a,n.COMPILE_STATUS))throw new Error(n.getShaderInfoLog(a)??"shader compile failed");return a}const Y=n.createProgram();n.attachShader(Y,Ve(n.VERTEX_SHADER,rt));n.attachShader(Y,Ve(n.FRAGMENT_SHADER,st));n.linkProgram(Y);if(!n.getProgramParameter(Y,n.LINK_STATUS))throw new Error(n.getProgramInfoLog(Y)??"program link failed");n.useProgram(Y);const d=e=>n.getUniformLocation(Y,e),u={res:d("uRes"),time:d("uTime"),pan:d("uPan"),scale:d("uScale"),rot:d("uRot"),n0:d("uN0"),d0:d("uD0"),n1:d("uN1"),d1:d("uD1"),n2:d("uN2"),d2:d("uD2"),useTex:d("uUseTex"),tex:d("uTex"),texAspect:d("uTexAspect"),texPan:d("uTexPan"),warp:d("uWarp"),warpSpeed:d("uWarpSpeed"),hue:d("uHue"),glow:d("uGlow"),glowWidth:d("uGlowWidth"),laserCount:d("uLaserCount"),laserN:d("uLaserN[0]"),laserC:d("uLaserC[0]"),laserCol:d("uLaserCol[0]"),laserGlow:d("uLaserGlow"),lens:d("uLens"),lensAmt:d("uLensAmt"),palette:d("uPalette"),foldIters:d("uFoldIters"),foldMode:d("uFoldMode"),segments:d("uSegments"),sat:d("uSat"),contrast:d("uContrast"),posterize:d("uPosterize"),solarize:d("uSolarize"),gradMap:d("uGradMap")},Ie=n.createTexture();n.bindTexture(n.TEXTURE_2D,Ie);n.texImage2D(n.TEXTURE_2D,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.REPEAT);n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.REPEAT);n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR);n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR);n.uniform1i(u.tex,0);const de="kaleidoscope.bgImages",Me="kaleidoscope.bgImage",A={useTex:!1,texAspect:[1,1]},g=[];let P=-1;const Re=()=>g.length>0;function te(e,t=!0){const a=new Image;a.crossOrigin="anonymous",a.onload=()=>{n.bindTexture(n.TEXTURE_2D,Ie),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,a);const o=a.width/a.height;A.texAspect=o>=1?[1,o]:[1/o,1],t&&(A.useTex=!0)},a.src=e}function Ce(){let e=g.slice();for(;e.length;)try{localStorage.setItem(de,JSON.stringify(e));return}catch{e=e.slice(1)}localStorage.removeItem(de),g.length&&console.warn("Images too large to remember across reloads.")}function ut(e){g.push(e),P=g.length-1,Ce(),te(e),he()}function pt(){if(!Re()){B("No images yet — drop one");return}P=(P+1)%g.length,te(g[P],!0),B(`Image ${P+1}/${g.length}`)}function ft(){if(!g.length)return;const e=P>=0?Math.min(P,g.length-1):g.length-1;g.splice(e,1),Ce(),g.length?(P=Math.min(e,g.length-1),A.useTex&&te(g[P],!0)):(P=-1,A.useTex=!1),he(),B("Image deleted")}function ht(){g.length=0,P=-1,A.useTex=!1,localStorage.removeItem(de),localStorage.removeItem(Me)}if(new URLSearchParams(location.search).has("clearImages"))ht();else{const e=localStorage.getItem(Me);e&&(localStorage.removeItem(Me),g.push(e));try{const t=JSON.parse(localStorage.getItem(de)??"[]");if(Array.isArray(t))for(const a of t)typeof a=="string"&&g.push(a)}catch{}e&&Ce(),Re()&&(P=0,te(g[0],!0))}const s={pan:[0,0],scale:1,rot:0,spin:.06,spinning:!0,autoDrift:!0,driftAmp:1,driftFreq:1,shape:0,shapeAuto:!1,segments:6},ne=[...Ye.map(e=>({name:e.name,mode:0,tri:e})),{name:"mandala (N-fold)",mode:1},{name:"spiral",mode:2},{name:"mirror box",mode:3}],M={sat:1,contrast:1,posterize:0,solarize:0,gradMap:0},r={warpOn:!1,warp:0,warpStrength:.5,warpSpeed:1,glowOn:!1,glow:0,glowStrength:1,glowWidth:2.5,hueOn:!1,hue:0,hueSpeed:.6,hueBase:0,panImgOn:!1,texPhase:0,texPan:[0,0],panImgSpeed:.15,panImgRange:.6},Ue=[[1,.12,.32],[.1,.7,1],[.35,1,.4],[1,.8,.12],[.7,.25,1]],f={on:!1,glow:0,glowTarget:1,count:3,speed:1,beams:[]};function pe(){f.count=Math.max(1,Math.min(5,Math.round(f.count))),f.beams=[];for(let e=0;e<f.count;e++)f.beams.push({angle:Math.random()*Math.PI,angleSpeed:(.04+Math.random()*.08)*(Math.random()<.5?-1:1),phase:Math.random()*Math.PI*2,sweepSpeed:.12+Math.random()*.16,sweepRange:.35+Math.random()*.25,col:Ue[e%Ue.length]})}pe();const ve=new Float32Array(10),He=new Float32Array(5),se=new Float32Array(15),Ne=["off","round (fisheye)","compound (fly eye)","prism","swirl","tunnel","ripple","pinch","shatter","glass tiles"],E={mode:0,amt:1,autoCycle:!1};let Se=0;const gt=.03;let Ke=0;const l={on:!1,time:0,rate:.7,imgHold:300,triTimer:0,lensTimer:0,laserTimer:0,segTimer:0},c={on:!1,bpm:128,phase:0,impact:1,taps:[]};function vt(){const e=performance.now()/1e3;if(c.taps.length&&e-c.taps[c.taps.length-1]>2&&(c.taps=[]),c.taps.push(e),c.taps.length>5&&c.taps.shift(),c.taps.length>=2){let t=0;for(let o=1;o<c.taps.length;o++)t+=c.taps[o]-c.taps[o-1];const a=t/(c.taps.length-1);c.bpm=Math.min(240,Math.max(40,60/a))}c.phase=0,c.on=!0,B(`BPM ${Math.round(c.bpm)} (tap)`)}s.shape=Math.floor(Math.random()*ne.length);s.segments=4+Math.floor(Math.random()*9);s.rot=Math.random()*Math.PI*2;s.pan[0]=(Math.random()-.5)*4;s.pan[1]=(Math.random()-.5)*4;s.scale=.8+Math.random()*.9;Se=Math.random()*8;Ke=Math.random()*500;let Oe=!1,me=[0,0];function wt(){return 2*s.scale/w.clientHeight}w.addEventListener("pointerdown",e=>{Oe=!0,s.autoDrift=!1,me=[e.clientX,e.clientY],w.classList.add("dragging"),w.setPointerCapture(e.pointerId)});w.addEventListener("pointermove",e=>{if(!Oe)return;const t=wt(),a=(e.clientX-me[0])*t,o=(me[1]-e.clientY)*t,i=Math.cos(s.rot),m=Math.sin(s.rot);s.pan[0]-=i*a+m*o,s.pan[1]-=-m*a+i*o,me=[e.clientX,e.clientY]});function Je(e){Oe=!1,w.classList.remove("dragging");try{w.releasePointerCapture(e.pointerId)}catch{}}w.addEventListener("pointerup",Je);w.addEventListener("pointercancel",Je);w.addEventListener("wheel",e=>{e.preventDefault();const t=Math.exp(e.deltaY*.001);s.scale=Math.min(30,Math.max(.05,s.scale*t))},{passive:!1});const yt=e=>`${Math.round(e*180/Math.PI)}°`,x=e=>e.toFixed(2),h={warp:{name:"Warp",primary:{label:"degree",get:()=>r.warpStrength,set:e=>r.warpStrength=e,step:.05,min:0,max:1.5,fmt:x},secondary:{label:"speed",get:()=>r.warpSpeed,set:e=>r.warpSpeed=e,step:.1,min:0,max:4,fmt:x}},glow:{name:"Neon glow",primary:{label:"intensity",get:()=>r.glowStrength,set:e=>r.glowStrength=e,step:.1,min:0,max:3,fmt:x},secondary:{label:"thickness",get:()=>r.glowWidth,set:e=>r.glowWidth=e,step:.5,min:.5,max:12,fmt:x}},hue:{name:"Hue",primary:{label:"speed",get:()=>r.hueSpeed,set:e=>r.hueSpeed=e,step:.1,min:-3,max:3,fmt:x},secondary:{label:"tint",get:()=>r.hueBase,set:e=>r.hueBase=e,step:.2,min:0,max:Math.PI*2,fmt:yt}},lasers:{name:"Lasers",primary:{label:"beams",get:()=>f.count,set:e=>{f.count=e,pe()},step:1,min:1,max:5,fmt:e=>`${Math.round(e)}`},secondary:{label:"speed",get:()=>f.speed,set:e=>f.speed=e,step:.1,min:.1,max:3,fmt:x}},lens:{name:"Lens",primary:{label:"amount",get:()=>E.amt,set:e=>E.amt=e,step:.1,min:0,max:2,fmt:x}},autotempo:{name:"Auto speed",primary:{label:"rate",get:()=>l.rate,set:e=>l.rate=e,step:.05,min:.1,max:2,fmt:x}},imghold:{name:"Image hold",primary:{label:"hold",get:()=>l.imgHold,set:e=>l.imgHold=Math.round(e),step:1,min:0,max:600,fmt:e=>e<.5?"off":`${Math.round(e)}s`}},segments:{name:"Segments",primary:{label:"seg",get:()=>s.segments,set:e=>s.segments=Math.round(e),step:1,min:2,max:24,fmt:e=>`${Math.round(e)}`}},gradmap:{name:"Gradient map",primary:{label:"map",get:()=>M.gradMap,set:e=>M.gradMap=e,step:.05,min:0,max:1,fmt:x}},saturation:{name:"Saturation",primary:{label:"sat",get:()=>M.sat,set:e=>M.sat=e,step:.05,min:0,max:2,fmt:x}},contrast:{name:"Contrast",primary:{label:"con",get:()=>M.contrast,set:e=>M.contrast=e,step:.05,min:.3,max:2.5,fmt:x}},posterize:{name:"Posterize",primary:{label:"post",get:()=>M.posterize,set:e=>M.posterize=Math.round(e),step:1,min:0,max:16,fmt:e=>e<2?"off":`${Math.round(e)}`}},solarize:{name:"Solarize",primary:{label:"sol",get:()=>M.solarize,set:e=>M.solarize=e,step:.05,min:0,max:1,fmt:x}},bpm:{name:"BPM",primary:{label:"tempo",get:()=>c.bpm,set:e=>c.bpm=e,step:1,min:40,max:240,fmt:e=>`${Math.round(e)}`},secondary:{label:"impact",get:()=>c.impact,set:e=>c.impact=e,step:.1,min:0,max:2,fmt:x}},spin:{name:"Spin",primary:{label:"speed",get:()=>s.spin,set:e=>s.spin=e,step:.02,min:-1,max:1,fmt:x}},zoom:{name:"Zoom",primary:{label:"zoom",get:()=>s.scale,set:e=>s.scale=e,step:.05,min:.3,max:6,fmt:x}},drift:{name:"Auto-drift",primary:{label:"amount",get:()=>s.driftAmp,set:e=>s.driftAmp=e,step:.05,min:0,max:4,fmt:x},secondary:{label:"speed",get:()=>s.driftFreq,set:e=>s.driftFreq=e,step:.1,min:.1,max:4,fmt:x}},imgdrift:{name:"Image drift",primary:{label:"range",get:()=>r.panImgRange,set:e=>r.panImgRange=e,step:.05,min:0,max:2,fmt:x},secondary:{label:"speed",get:()=>r.panImgSpeed,set:e=>r.panImgSpeed=e,step:.05,min:.01,max:1.5,fmt:x}}},xe=new Map,Le=new Map;for(const[e,t]of Object.entries(h))t.primary&&(xe.set(e+":p",t.primary),Le.set(t.primary,e+":p")),t.secondary&&(xe.set(e+":s",t.secondary),Le.set(t.secondary,e+":s"));const bt=Object.entries(h).map(([,e])=>{var t,a;return{primary:e.primary,pVal:(t=e.primary)==null?void 0:t.get(),secondary:e.secondary,sVal:(a=e.secondary)==null?void 0:a.get()}});function Mt(){for(const e of bt)e.primary&&e.pVal!==void 0&&e.primary.set(e.pVal),e.secondary&&e.sVal!==void 0&&e.secondary.set(e.sVal);B("Parameters reset")}const qe=document.getElementById("rec"),Xe=document.getElementById("recLabel"),ee=document.getElementById("recover");let O=null,H=null,N=null,Te=!1,Pe=!1,oe=!1;function St(){var t;const e=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm","video/mp4"];for(const a of e)if((t=window.MediaRecorder)!=null&&t.isTypeSupported(a))return a;return""}const xt="kaleidoscope-rec";function fe(){return new Promise((e,t)=>{const a=indexedDB.open(xt,1);a.onupgradeneeded=()=>{const o=a.result;o.objectStoreNames.contains("chunks")||o.createObjectStore("chunks",{autoIncrement:!0}),o.objectStoreNames.contains("meta")||o.createObjectStore("meta")},a.onsuccess=()=>e(a.result),a.onerror=()=>t(a.error)})}function q(e){return new Promise((t,a)=>{e.onsuccess=()=>t(e.result),e.onerror=()=>a(e.error)})}function G(e,t,a){return e.transaction(t,a).objectStore(t)}function ue(e,t){const a=URL.createObjectURL(e),o=document.createElement("a");o.href=a,o.download=t,o.click(),setTimeout(()=>URL.revokeObjectURL(a),1e4)}function Lt(){Pe=!0}async function Tt(){if(O){O.stop();return}if(!window.MediaRecorder||!("captureStream"in w)){B("Recording not supported in this browser");return}const e=St(),t=e.includes("mp4")?"mp4":"webm",o=`kaleidoscope-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.${t}`;H=null,N=null;const i=window.showSaveFilePicker;if(i)try{H=await(await i({suggestedName:o,types:[{description:"Video",accept:{[t==="mp4"?"video/mp4":"video/webm"]:["."+t]}}]})).createWritable(),console.info("[rec] streaming to disk via File System Access API")}catch(p){if((p==null?void 0:p.name)==="AbortError")return;console.warn("[rec] file picker failed, using IndexedDB instead:",p)}if(!H)try{N=await fe(),await q(G(N,"chunks","readwrite").clear());const p=G(N,"meta","readwrite");p.put(e||"video/webm","mime"),p.put(o,"filename"),console.info("[rec] streaming to IndexedDB (recoverable after a crash)")}catch(p){N=null,console.warn("[rec] IndexedDB unavailable; this take won't be crash-safe:",p)}let m=[];const S=w.captureStream(60);O=new MediaRecorder(S,{mimeType:e||void 0,videoBitsPerSecond:16e6}),O.ondataavailable=async p=>{if(p.data.size)try{H?await H.write(p.data):N?await q(G(N,"chunks","readwrite").add(p.data)):m.push(p.data)}catch{}},O.onstop=async()=>{qe.classList.remove("show"),Xe.textContent="REC";const p=Te;Te=!1;const R=(O==null?void 0:O.mimeType)||e||"video/webm";try{if(H)await H.close();else if(N){if(!p){const k=await q(G(N,"chunks","readonly").getAll());ue(new Blob(k,{type:R}),o)}await q(G(N,"chunks","readwrite").clear()),N.close()}else p||ue(new Blob(m,{type:R}),o)}catch(k){console.warn("[rec] error finalizing recording:",k)}H=null,N=null,m=[],O=null,ee.classList.remove("show"),B(p?"Recording discarded":"Recording saved")},O.start(1e3),Xe.textContent=H?"REC → disk":N?"REC → cache":"REC (memory)",qe.classList.add("show"),B(H?"Recording to disk…":N?"Recording (crash-safe)…":"Recording in memory…")}async function Pt(){try{const e=await fe(),t=await q(G(e,"chunks","readonly").count());e.close(),t>0&&ee.classList.add("show")}catch{}}async function Et(){try{const e=await fe(),t=await q(G(e,"chunks","readonly").getAll());if(!t.length){ee.classList.remove("show"),e.close();return}const a=await q(G(e,"meta","readonly").get("mime"))||"video/webm",o=await q(G(e,"meta","readonly").get("filename"))||`kaleidoscope-recovered.${a.includes("mp4")?"mp4":"webm"}`;ue(new Blob(t,{type:a}),o),await q(G(e,"chunks","readwrite").clear()),e.close(),ee.classList.remove("show"),B("Recovered recording downloaded")}catch(e){console.warn("[rec] recovery failed:",e)}}document.getElementById("recoverGo").addEventListener("click",Et);document.getElementById("recoverX").addEventListener("click",e=>{e.stopPropagation(),ee.classList.remove("show")});Pt();async function At(){if(O){Te=!0,O.stop();return}try{const e=await fe();await q(G(e,"chunks","readwrite").clear()),e.close()}catch{}ee.classList.remove("show"),B("Recording cache cleared")}const Z=document.getElementById("toolbar"),De=document.getElementById("tbBody"),re=document.getElementById("tbHead"),V=[];let Q=null;const F=new Set,Qe=[];function j(e){const t=document.createElement("div");t.className="tb-sec",t.textContent=e,De.appendChild(t)}function L(...e){const t=document.createElement("div");return t.className="tb-row",e.forEach(a=>t.appendChild(a)),De.appendChild(t),t}function I(e,t,a){const o=document.createElement("button");return o.className="tb-btn",o.onclick=t,V.push(()=>{o.textContent=e(),a&&o.classList.toggle("on",a())}),o}function v(e,t){const a=document.createElement("div");a.className="tb-knob-col";const o=document.createElement("div");o.className="tb-knob";const i=document.createElement("div");i.className="ind",o.appendChild(i);const m=document.createElement("div");m.className="tb-knob-val";const S=document.createElement("div");S.className="tb-knob-name",S.textContent=t,a.append(o,m,S);const p=T=>{const W=(T-e.min)/(e.max-e.min);i.style.transform=`rotate(${-135+W*270}deg)`,m.textContent=e.fmt?e.fmt(T):T.toFixed(2)};let R=0,k=0;o.addEventListener("pointerdown",T=>{Q=o,R=T.clientY,k=e.get(),o.setPointerCapture(T.pointerId),T.preventDefault()}),o.addEventListener("pointermove",T=>{if(Q!==o)return;const W=T.shiftKey?.25:1,D=e.max-e.min;let z=k+(R-T.clientY)/180*D*W;z=Math.min(e.max,Math.max(e.min,z)),e.step>=1&&(z=Math.round(z/e.step)*e.step),e.set(z),p(z)});const _=T=>{Q===o&&(Q=null);try{o.releasePointerCapture(T.pointerId)}catch{}};return o.addEventListener("pointerup",_),o.addEventListener("pointercancel",_),o.addEventListener("dblclick",()=>{F.has(e)?F.delete(e):F.add(e)}),Qe.push({knob:e,el:o,phase:Math.random()*Math.PI*2,period:24+Math.random()*24}),V.push(()=>{o.classList.toggle("auto",F.has(e)),Q!==o&&p(e.get())}),a}function Ze(e,t,a,o){const i=document.createElement("select");if(i.className="tb-select",o){const m=document.createElement("option");m.value="auto",m.textContent="🔄 Auto",i.appendChild(m)}return e.forEach((m,S)=>{const p=document.createElement("option");p.value=String(S),p.textContent=m,i.appendChild(p)}),i.onchange=()=>{if(i.value==="auto"){o==null||o.set(!0);return}o==null||o.set(!1),a(parseInt(i.value))},V.push(()=>{document.activeElement!==i&&(i.value=o!=null&&o.get()?"auto":String(t()),i.classList.toggle("auto",!!(o!=null&&o.get())))}),i}const It=()=>{A.useTex?A.useTex=!1:Re()?A.useTex=!0:B("Drop an image first")},$=document.createElement("div");$.className="tb-imgs";function he(){if($.innerHTML="",!g.length){const t=document.createElement("div");t.className="tb-empty",t.textContent="drop image(s) anywhere",$.appendChild(t);return}g.forEach((t,a)=>{const o=document.createElement("img");o.src=t,o.className="tb-thumb",o.title=`image ${a+1}`,o.onclick=()=>{P=a,te(g[a],!0),he()},a===P&&A.useTex&&o.classList.add("sel"),$.appendChild(o)});const e=document.createElement("button");e.className="tb-trash",e.textContent="🗑",e.title="delete the selected image",e.onclick=()=>ft(),$.appendChild(e)}L(I(()=>oe?"▶ Play":"⏸ Pause",()=>oe=!oe,()=>oe));j("Modes");L(I(()=>"Auto",()=>Ct(),()=>l.on),v(h.autotempo.primary,"rate"));L(I(()=>"Zoom 1:1",()=>s.scale=1),v(h.zoom.primary,"zoom"));L(I(()=>"Spin",()=>s.spinning=!s.spinning,()=>s.spinning),v(h.spin.primary,"speed"));L(I(()=>"Drift",()=>s.autoDrift=!s.autoDrift,()=>s.autoDrift),v(h.drift.primary,"amt"),v(h.drift.secondary,"spd"));j("Beat");L(I(()=>"Beat",()=>{c.on=!c.on,c.on&&(c.phase=0)},()=>c.on),v(h.bpm.primary,"bpm"),v(h.bpm.secondary,"hit"));L(I(()=>"Tap tempo",()=>vt()));j("Effects");L(I(()=>"Warp",()=>r.warpOn=!r.warpOn,()=>r.warpOn),v(h.warp.primary,"deg"),v(h.warp.secondary,"spd"));L(I(()=>"Glow",()=>r.glowOn=!r.glowOn,()=>r.glowOn),v(h.glow.primary,"int"),v(h.glow.secondary,"thk"));L(I(()=>"Lasers",()=>f.on=!f.on,()=>f.on),v(h.lasers.primary,"n"),v(h.lasers.secondary,"spd"));j("Lens");L(Ze(Ne,()=>E.mode,e=>E.mode=e,{get:()=>E.autoCycle,set:e=>E.autoCycle=e}),v(h.lens.primary,"amt"));j("Shape");L(Ze(ne.map(e=>e.name),()=>s.shape,e=>s.shape=e,{get:()=>s.shapeAuto,set:e=>s.shapeAuto=e}),v(h.segments.primary,"seg"));j("Color");L(I(()=>"Hue",()=>{r.hueOn=!r.hueOn,r.hueOn||(r.hue=0)},()=>r.hueOn),v(h.hue.primary,"spd"),v(h.hue.secondary,"tint"));L(v(h.gradmap.primary,"map"),v(h.saturation.primary,"sat"),v(h.contrast.primary,"con"),v(h.posterize.primary,"post"),v(h.solarize.primary,"sol"));j("Background");L(I(()=>`BG: ${A.useTex?"image":"plasma"}`,It),I(()=>"Img drift",()=>r.panImgOn=!r.panImgOn,()=>r.panImgOn));L(v(h.imgdrift.primary,"range"),v(h.imgdrift.secondary,"spd"),v(h.imghold.primary,"hold"));De.appendChild($);he();V.push(()=>{const e=$.children;for(let t=0;t<e.length;t++)e[t].classList.toggle("sel",t===P&&A.useTex)});j("Capture");L(I(()=>"📷 Screenshot (PNG)",()=>Lt()));const et=I(()=>O?"■ Stop & save":"● Record",()=>Tt());V.push(()=>et.classList.toggle("rec",!!O));L(et);L(I(()=>"Discard",()=>At()),I(()=>"Reset",()=>Mt()));let Be=!1,Ee=[0,0];re.addEventListener("pointerdown",e=>{if(e.target.id==="tbHide")return;Be=!0;const t=Z.getBoundingClientRect();Ee=[e.clientX-t.left,e.clientY-t.top],re.setPointerCapture(e.pointerId)});re.addEventListener("pointermove",e=>{Be&&(Z.style.left=`${e.clientX-Ee[0]}px`,Z.style.top=`${e.clientY-Ee[1]}px`,Z.style.right="auto")});re.addEventListener("pointerup",e=>{Be=!1;try{re.releasePointerCapture(e.pointerId)}catch{}});function tt(){Z.classList.toggle("hidden")}document.getElementById("tbHide").addEventListener("click",tt);window.addEventListener("keydown",e=>{e.key.toLowerCase()==="t"&&tt()});const ke="kaleidoscope.settings";function at(){try{const e={view:{scale:s.scale,spin:s.spin,spinning:s.spinning,autoDrift:s.autoDrift,driftAmp:s.driftAmp,driftFreq:s.driftFreq,shape:s.shape,shapeAuto:s.shapeAuto,segments:s.segments},fx:{warpOn:r.warpOn,warpStrength:r.warpStrength,warpSpeed:r.warpSpeed,glowOn:r.glowOn,glowStrength:r.glowStrength,glowWidth:r.glowWidth,hueOn:r.hueOn,hueSpeed:r.hueSpeed,hueBase:r.hueBase,panImgOn:r.panImgOn,panImgSpeed:r.panImgSpeed,panImgRange:r.panImgRange},lasers:{on:f.on,count:f.count,speed:f.speed,glowTarget:f.glowTarget},lens:{mode:E.mode,amt:E.amt,autoCycle:E.autoCycle},color:{...M},beat:{on:c.on,bpm:c.bpm,impact:c.impact},auto:{on:l.on,rate:l.rate,imgHold:l.imgHold},paramAuto:[...F].map(t=>Le.get(t)).filter(Boolean)};localStorage.setItem(ke,JSON.stringify(e))}catch{}}function Rt(){try{const e=localStorage.getItem(ke);if(!e)return;const t=JSON.parse(e);if(t.view&&Object.assign(s,t.view),t.fx&&Object.assign(r,t.fx),t.lasers&&Object.assign(f,t.lasers),t.lens&&Object.assign(E,t.lens),t.color&&Object.assign(M,t.color),t.beat&&Object.assign(c,t.beat),t.auto&&(l.on=!!t.auto.on,l.rate=t.auto.rate??l.rate,l.imgHold=t.auto.imgHold??l.imgHold),Array.isArray(t.paramAuto))for(const a of t.paramAuto){const o=xe.get(a);o&&F.add(o)}pe()}catch{}}new URLSearchParams(location.search).has("reset")?localStorage.removeItem(ke):Rt();setInterval(at,1500);window.addEventListener("beforeunload",at);V.forEach(e=>e());window.addEventListener("dragover",e=>{e.preventDefault(),Ae.classList.add("show")});window.addEventListener("dragleave",e=>{e.relatedTarget===null&&Ae.classList.remove("show")});window.addEventListener("drop",e=>{var a;e.preventDefault(),Ae.classList.remove("show");const t=[...((a=e.dataTransfer)==null?void 0:a.files)??[]].filter(o=>o.type.startsWith("image/"));for(const o of t){const i=new FileReader;i.onload=()=>ut(i.result),i.readAsDataURL(o)}});function ot(){const e=Math.min(window.devicePixelRatio||1,2),t=Math.floor(w.clientWidth*e),a=Math.floor(w.clientHeight*e);(w.width!==t||w.height!==a)&&(w.width=t,w.height=a),n.viewport(0,0,w.width,w.height)}window.addEventListener("resize",ot);function C(e,t,a,o=0){const i=.5+.5*Math.sin(l.time*2*Math.PI/e+o);return t+(a-t)*i}function Ct(){l.on=!l.on,l.on?(l.triTimer=60+Math.random()*40,l.lensTimer=80+Math.random()*70,l.laserTimer=40+Math.random()*40,l.segTimer=30+Math.random()*40,f.on=!0):f.on=!1,B(l.on?"Auto mode: ON — sit back":"Auto mode: OFF")}function Nt(e){const t=l.rate;if(l.time+=e*t,s.scale=C(140,.55,3.3,0),s.spin=C(150,-.045,.045,1.3)*t,s.pan[0]=Math.sin(l.time/85)*2.4+Math.sin(l.time/40)*.4,s.pan[1]=Math.cos(l.time/100)*2.4+Math.cos(l.time/46)*.4,r.warpOn=!0,r.warpStrength=Math.max(0,C(150,-.9,.45,0)),r.warpSpeed=C(190,.025,.085,1)*t,r.glowOn=!0,r.glowStrength=Math.max(0,C(70,-.6,2,2.1)),r.glowWidth=C(95,1.5,5.5,.5),r.hueOn=!0,r.hueSpeed=C(165,-.15,.22,.7)*t,r.panImgOn=!0,r.panImgRange=C(90,.2,1,0),r.panImgSpeed=C(175,.02,.085,1.4)*t,f.on=!0,f.glowTarget=Math.max(0,C(60,-.7,1.1,1)),f.speed=C(120,.18,.5,.3)*t,M.gradMap=Math.max(0,C(110,-.6,.55,1.7)),M.sat=C(95,.85,1.35,.4),M.contrast=C(135,.92,1.28,1.1),(l.triTimer-=e*t)<=0&&(s.shape=(s.shape+1)%ne.length,l.triTimer=70+Math.random()*80),g.length>0?A.useTex||(P=Math.max(0,P),te(g[P],!0)):A.useTex=!1,(l.lensTimer-=e*t)<=0&&(E.mode=(E.mode+1)%Ne.length,l.lensTimer=85+Math.random()*75),E.amt=C(70,.4,1.3,.6),(l.laserTimer-=e*t)<=0&&(f.count=2+(Math.random()*3|0),pe(),l.laserTimer=60+Math.random()*60),(l.segTimer-=e*t)<=0){const a=[4,5,6,8,10,12];s.segments=a[Math.random()*a.length|0],l.segTimer=35+Math.random()*45}}let we=0,ye=0,je=0,ie=0,Fe=0,$e=0;function nt(e){const t=Math.min(.05,ye?(e-ye)/1e3:0);ye=e;const a=oe?0:t;we+=a;const o=we;if(ot(),l.on&&Nt(a),!l.on){const b=l.rate;for(const y of Qe){if(!F.has(y.knob)||Q===y.el)continue;const U=y.knob;let K=U.min+(U.max-U.min)*(.5+.5*Math.sin(we*2*Math.PI*b/y.period+y.phase));U.step>=1&&(K=Math.round(K/U.step)*U.step),K!==U.get()&&U.set(K)}E.autoCycle&&(Fe-=a*b)<=0&&(E.mode=(E.mode+1)%Ne.length,Fe=20+Math.random()*20),s.shapeAuto&&($e-=a*b)<=0&&(s.shape=(s.shape+1)%ne.length,$e=28+Math.random()*24)}if(l.imgHold>0&&A.useTex&&g.length>1?(ie-=a,ie<=0&&(pt(),ie=l.imgHold)):ie=l.imgHold,!Z.classList.contains("hidden")&&e-je>120){je=e;for(const b of V)b()}s.spinning&&(s.rot+=s.spin*a),s.autoDrift&&!l.on&&(s.pan[0]+=Math.cos(o*.31*s.driftFreq)*.12*s.driftAmp*a,s.pan[1]+=Math.sin(o*.23*s.driftFreq)*.12*s.driftAmp*a);const i=Math.min(1,a*5);r.warp+=((r.warpOn?r.warpStrength:0)-r.warp)*i,r.glow+=((r.glowOn?r.glowStrength:0)-r.glow)*i,r.hueOn&&(r.hue=(r.hue+a*r.hueSpeed)%(Math.PI*2)),r.panImgOn&&(r.texPhase+=a*r.panImgSpeed,r.texPan[0]=Math.cos(r.texPhase)*r.panImgRange,r.texPan[1]=Math.sin(r.texPhase*.8)*r.panImgRange),f.glow+=((f.on?f.glowTarget:0)-f.glow)*i;const m=f.beams.length;for(let b=0;b<m;b++){const y=f.beams[b];y.angle+=y.angleSpeed*f.speed*a,ve[b*2]=Math.cos(y.angle),ve[b*2+1]=Math.sin(y.angle),He[b]=Math.sin(o*y.sweepSpeed*f.speed+y.phase)*y.sweepRange,se[b*3]=y.col[0],se[b*3+1]=y.col[1],se[b*3+2]=y.col[2]}c.on&&(c.phase=(c.phase+a*c.bpm/60)%1024);const S=c.phase-Math.floor(c.phase),p=c.phase*.25-Math.floor(c.phase*.25),R=c.on?Math.sin(Math.PI*S)**2:0,k=c.on?Math.sin(Math.PI*p)**2:0,_=c.impact,T=s.scale*(1-.05*_*R),W=ne[s.shape],D=W.tri??Ye[0];n.uniform2f(u.res,w.width,w.height),n.uniform1f(u.time,o+Ke),n.uniform2f(u.pan,s.pan[0],s.pan[1]),n.uniform1f(u.scale,T),n.uniform1i(u.foldMode,W.mode),n.uniform1f(u.segments,s.segments);const z=1.6*s.scale+Math.hypot(s.pan[0],s.pan[1])+r.warp;n.uniform1i(u.foldIters,Math.max(10,Math.min(48,Math.ceil(z/.75)+2))),n.uniform1f(u.rot,s.rot),n.uniform2f(u.n0,D.n[0][0],D.n[0][1]),n.uniform1f(u.d0,D.d[0]),n.uniform2f(u.n1,D.n[1][0],D.n[1][1]),n.uniform1f(u.d1,D.d[1]),n.uniform2f(u.n2,D.n[2][0],D.n[2][1]),n.uniform1f(u.d2,D.d[2]),n.uniform1i(u.useTex,A.useTex?1:0),n.uniform2f(u.texAspect,A.texAspect[0],A.texAspect[1]),n.uniform2f(u.texPan,r.texPan[0],r.texPan[1]),n.uniform1f(u.warp,r.warp+.12*_*k),n.uniform1f(u.warpSpeed,r.warpSpeed),n.uniform1f(u.hue,r.hue+r.hueBase),n.uniform1f(u.glow,r.glow+(r.glowOn?.9*_*R:0)),n.uniform1f(u.glowWidth,r.glowWidth),n.uniform1i(u.laserCount,m),n.uniform2fv(u.laserN,ve),n.uniform1fv(u.laserC,He),n.uniform3fv(u.laserCol,se),n.uniform1f(u.laserGlow,f.glow+(f.on?.6*_*R:0)),n.uniform1i(u.lens,E.mode),n.uniform1f(u.lensAmt,E.amt),Se+=a*gt,n.uniform1f(u.palette,Se),n.uniform1f(u.sat,M.sat),n.uniform1f(u.contrast,M.contrast),n.uniform1f(u.posterize,M.posterize),n.uniform1f(u.solarize,M.solarize),n.uniform1f(u.gradMap,M.gradMap),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,Ie),n.drawArrays(n.TRIANGLES,0,3),Pe&&(Pe=!1,w.toBlob(b=>{if(!b)return;const y=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);ue(b,`kaleidoscope-${y}.png`),B("Screenshot saved")},"image/png")),requestAnimationFrame(nt)}requestAnimationFrame(nt);
