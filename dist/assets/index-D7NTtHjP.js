(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))s(a);new MutationObserver(a=>{for(const r of a)if(r.type==="childList")for(const l of r.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&s(l)}).observe(document,{childList:!0,subtree:!0});function t(a){const r={};return a.integrity&&(r.integrity=a.integrity),a.referrerPolicy&&(r.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?r.credentials="include":a.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(a){if(a.ep)return;a.ep=!0;const r=t(a);fetch(a.href,r)}})();const ee=`#version 300 es
precision highp float;
// Fullscreen triangle; no attributes needed.
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){
  gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0);
}
`,te=`#version 300 es
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

uniform float uWarp;   // funhouse domain-warp strength
uniform float uHue;    // hue rotation (radians)
uniform float uGlow;   // neon edge-glow strength

#define PI 3.14159265359

vec2 reflectOut(vec2 p, vec2 n, float d){
  // Reflect across the line dot(p,n)=d only when the point is outside it.
  float s = dot(p, n) - d;
  return p - 2.0 * max(s, 0.0) * n;
}

// Fold any plane point into the fundamental triangle by repeated mirror
// reflection. The triangle's reflection group tiles the plane, so this
// converges. This is the exact math of a 3-mirror kaleidoscope.
vec2 fold(vec2 p){
  for (int i = 0; i < 16; i++){
    p = reflectOut(p, uN0, uD0);
    p = reflectOut(p, uN1, uD1);
    p = reflectOut(p, uN2, uD2);
  }
  return p;
}

vec3 palette(float t){
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67)));
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

void main(){
  // Aspect-correct screen coords, y in [-0.5, 0.5].
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float c = cos(uRot), s = sin(uRot);
  uv = mat2(c, -s, s, c) * uv;

  vec2 world = uv * (2.0 * uScale) + uPan;

  // Funhouse mirror: ripple the plane before folding so the tiling bulges.
  if (uWarp > 0.0001){
    world += uWarp * vec2(
      sin(world.y * 3.0 + uTime * 1.3),
      sin(world.x * 3.0 - uTime * 1.1));
  }

  vec2 p = fold(world);
  vec3 col = sampleBg(p);

  // Neon edge glow: light up the kaleidoscope's mirror seams. The folded point
  // sits inside the fundamental triangle, so the distance to its nearest edge is
  // ~0 exactly along the reflection seams. fwidth keeps the line a constant
  // thickness on screen regardless of zoom. (The old luminance-gradient version
  // was invisible on the smooth procedural background.)
  if (uGlow > 0.0001){
    float eDist = min(uD0 - dot(p, uN0), min(uD1 - dot(p, uN1), uD2 - dot(p, uN2)));
    float w = fwidth(eDist) + 1e-5;
    float line = 1.0 - smoothstep(0.0, 2.5 * w, eDist);
    vec3 neon = hueShift(vec3(0.25, 0.85, 1.0), uHue);
    col += uGlow * 1.4 * line * neon;
  }

  if (abs(uHue) > 0.0001) col = hueShift(col, uHue);

  float vig = smoothstep(1.3, 0.2, length(uv));
  col *= 0.55 + 0.45 * vig;

  fragColor = vec4(col, 1.0);
}
`;function x(o,n){return[o[0]-n[0],o[1]-n[1]]}function H(o,n){return o[0]*n[0]+o[1]*n[1]}function k(o){return Math.hypot(o[0],o[1])}function ne(o){const n=k(o)||1;return[o[0]/n,o[1]/n]}function N(o,n,t,s,a){const r=k(x(t,s)),l=k(x(n,s)),u=k(x(n,t)),m=r+l+u,v=[(r*n[0]+l*t[0]+u*s[0])/m,(r*n[1]+l*t[1]+u*s[1])/m],P=x(n,v),I=x(t,v),w=x(s,v),A=[[P,I,w],[I,w,P],[w,P,I]],L=[[0,0],[0,0],[0,0]],O=[0,0,0];return A.forEach(([b,S,Z],F)=>{const W=x(S,b);let y=ne([-W[1],W[0]]);H(y,x(Z,b))>0&&(y=[-y[0],-y[1]]),L[F]=y,O[F]=H(b,y)}),{name:o,n:L,d:O,order:a}}function D(o,n,t,s){const a=n*Math.PI/180,r=t*Math.PI/180,l=Math.PI-a-r,u=Math.sin(r),m=Math.sin(l);return N(o,[0,0],[m,0],[u*Math.cos(a),u*Math.sin(a)],s)}const oe=Math.sqrt(3),R=[N("equilateral (60-60-60)",[Math.cos(Math.PI/2),Math.sin(Math.PI/2)],[Math.cos(Math.PI/2+2*Math.PI/3),Math.sin(Math.PI/2+2*Math.PI/3)],[Math.cos(Math.PI/2-2*Math.PI/3),Math.sin(Math.PI/2-2*Math.PI/3)],6),N("right isosceles (45-45-90)",[0,0],[1,0],[0,1],8),N("hemiequilateral (30-60-90)",[0,0],[oe,0],[0,1],12),D("golden (72-72-36)",72,72,5),D("golden gnomon (36-36-108)",36,36,10),D("scalene (50-60-70)",50,60,7),D("right scalene (35-55-90)",35,55,11),D("acute sliver (24-30-126)",24,30,9)],Y=["#00eaff","#ff2bd6","#7CFF00","#ffd400","#ff5e00","#9d4bff"];class ae{constructor(n){this.bolts=[],this.nextSpawn=0,this.dpr=1,this.enabled=!1,this.symmetry=6,this.mirror=!0,this.maxAngle=22,this.canvas=n,this.ctx=n.getContext("2d"),this.resize()}resize(){this.dpr=Math.min(window.devicePixelRatio||1,2),this.canvas.width=Math.floor(this.canvas.clientWidth*this.dpr),this.canvas.height=Math.floor(this.canvas.clientHeight*this.dpr)}path(n,t,s,a){const r=this.maxAngle*Math.PI/180,l=[{x:n,y:t}],u=Math.hypot(s-n,a-t),m=14*this.dpr,v=Math.max(2,Math.floor(u/m)),I=Math.atan2(a-t,s-n)+Math.PI/2;for(let w=1;w<=v;w++){const A=w/v;if(w===v){l.push({x:s,y:a});break}const L=n+(s-n)*A,O=t+(a-t)*A,b=(Math.random()-.5)*2*Math.tan(r)*m*Math.sin(A*Math.PI),S=Math.random()<.12?(Math.random()-.5)*30*this.dpr:0;l.push({x:L+Math.cos(I)*(b*3+S),y:O+Math.sin(I)*(b*3+S)})}return l}spawn(){const n=this.canvas.width/2,t=this.canvas.height/2,s=Math.min(n,t),a=Math.PI*2/this.symmetry,r=(Math.random()-.5)*a*.5,l=s*(.04+Math.random()*.12),u=s*(.55+Math.random()*.5),m=this.path(Math.cos(r)*l,Math.sin(r)*l,Math.cos(r)*u,Math.sin(r)*u);this.bolts.push({points:m,color:Y[Math.random()*Y.length|0],life:1,decay:.7+Math.random()*.8,width:(6+Math.random()*8)*this.dpr})}update(n){if(!this.enabled){this.bolts.length=0;return}this.nextSpawn-=n,this.nextSpawn<=0&&(this.spawn(),Math.random()<.4&&this.spawn(),this.nextSpawn=.18+Math.random()*.5);for(let t=this.bolts.length-1;t>=0;t--)this.bolts[t].life-=this.bolts[t].decay*n,this.bolts[t].life<=0&&this.bolts.splice(t,1)}stroke(n,t,s,a){const r=this.ctx,l=()=>{r.beginPath(),r.moveTo(n[0].x,n[0].y);for(let u=1;u<n.length;u++)r.lineTo(n[u].x,n[u].y)};r.lineCap="round",r.lineJoin="round",r.globalAlpha=s*.25,r.strokeStyle=t,r.shadowColor=t,r.shadowBlur=a*2,r.lineWidth=a,l(),r.stroke(),r.globalAlpha=s*.8,r.shadowBlur=a,r.lineWidth=Math.max(2,a*.3),l(),r.stroke(),r.globalAlpha=s,r.strokeStyle="#fff",r.shadowColor=t,r.shadowBlur=a,r.lineWidth=Math.max(1,a*.12),l(),r.stroke()}draw(n){const t=this.ctx;if(t.setTransform(1,0,0,1,0,0),t.clearRect(0,0,this.canvas.width,this.canvas.height),!this.enabled||this.bolts.length===0)return;t.globalCompositeOperation="lighter";const s=this.canvas.width/2,a=this.canvas.height/2,r=this.mirror?[1,-1]:[1];for(const l of this.bolts){const u=Math.max(0,Math.min(1,l.life));for(let m=0;m<this.symmetry;m++){const v=n+m/this.symmetry*Math.PI*2;for(const P of r)t.setTransform(1,0,0,1,s,a),t.rotate(v),t.scale(P,1),this.stroke(l.points,l.color,u,l.width)}}t.setTransform(1,0,0,1,0,0),t.globalAlpha=1,t.globalCompositeOperation="source-over"}}const h=document.getElementById("gl"),re=document.getElementById("fx"),C=document.getElementById("hud"),U=document.getElementById("toast"),X=document.getElementById("drop"),M=new ae(re);let $=0;function g(o){C.classList.contains("hidden")||(U.textContent=o,U.classList.add("show"),clearTimeout($),$=window.setTimeout(()=>U.classList.remove("show"),1100))}const T=o=>o?"ON":"OFF",e=h.getContext("webgl2",{antialias:!0,alpha:!1});if(!e)throw new Error("WebGL2 is not available in this browser.");function K(o,n){const t=e.createShader(o);if(e.shaderSource(t,n),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(t)??"shader compile failed");return t}const E=e.createProgram();e.attachShader(E,K(e.VERTEX_SHADER,ee));e.attachShader(E,K(e.FRAGMENT_SHADER,te));e.linkProgram(E);if(!e.getProgramParameter(E,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(E)??"program link failed");e.useProgram(E);const d=o=>e.getUniformLocation(E,o),f={res:d("uRes"),time:d("uTime"),pan:d("uPan"),scale:d("uScale"),rot:d("uRot"),n0:d("uN0"),d0:d("uD0"),n1:d("uN1"),d1:d("uD1"),n2:d("uN2"),d2:d("uD2"),useTex:d("uUseTex"),tex:d("uTex"),texAspect:d("uTexAspect"),texPan:d("uTexPan"),warp:d("uWarp"),hue:d("uHue"),glow:d("uGlow")},q=e.createTexture();e.bindTexture(e.TEXTURE_2D,q);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR);e.uniform1i(f.tex,0);const V="kaleidoscope.bgImage",p={useTex:!1,hasImage:!1,texAspect:[1,1]};function J(o,n=!0){const t=new Image;t.crossOrigin="anonymous",t.onload=()=>{e.bindTexture(e.TEXTURE_2D,q),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!0),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,t);const s=t.width/t.height;p.texAspect=s>=1?[1,s]:[1/s,1],p.hasImage=!0,n&&(p.useTex=!0)},t.src=o}function se(o){try{localStorage.setItem(V,o)}catch{console.warn("Background image too large to remember.")}}const z=localStorage.getItem(V);z&&J(z,!0);const c={pan:[0,0],scale:1,rot:0,spin:.06,spinning:!0,autoDrift:!0,triangle:0},i={warpOn:!1,warp:0,glowOn:!1,glow:0,hueOn:!1,hue:0,panImgOn:!1,texPhase:0,texPan:[0,0]};let G=!1,_=[0,0];function ie(){return 2*c.scale/h.clientHeight}h.addEventListener("pointerdown",o=>{G=!0,c.autoDrift=!1,_=[o.clientX,o.clientY],h.classList.add("dragging"),h.setPointerCapture(o.pointerId)});h.addEventListener("pointermove",o=>{if(!G)return;const n=ie(),t=(o.clientX-_[0])*n,s=(o.clientY-_[1])*n,a=Math.cos(c.rot),r=Math.sin(c.rot);c.pan[0]-=a*t+r*s,c.pan[1]-=-r*t+-a*s,_=[o.clientX,o.clientY]});function Q(o){G=!1,h.classList.remove("dragging");try{h.releasePointerCapture(o.pointerId)}catch{}}h.addEventListener("pointerup",Q);h.addEventListener("pointercancel",Q);h.addEventListener("wheel",o=>{o.preventDefault();const n=Math.exp(o.deltaY*.001);c.scale=Math.min(8,Math.max(.05,c.scale*n))},{passive:!1});window.addEventListener("keydown",o=>{switch(o.key.toLowerCase()){case" ":c.autoDrift=!c.autoDrift,o.preventDefault(),g(`Auto-drift: ${T(c.autoDrift)}`);break;case"r":c.spinning=!c.spinning,g(`Spin: ${T(c.spinning)}`);break;case"1":c.triangle=(c.triangle+R.length-1)%R.length,g(R[c.triangle].name);break;case"2":c.triangle=(c.triangle+1)%R.length,g(R[c.triangle].name);break;case"l":M.enabled=!M.enabled,g(`Electric arcs: ${T(M.enabled)}`);break;case"w":i.warpOn=!i.warpOn,g(`Warp mirror: ${T(i.warpOn)}`);break;case"g":i.glowOn=!i.glowOn,g(`Neon glow: ${T(i.glowOn)}`);break;case"c":i.hueOn=!i.hueOn,g(`Hue cycle: ${T(i.hueOn)}`);break;case"p":p.useTex?(p.useTex=!1,g("Background: procedural")):p.hasImage?(p.useTex=!0,g("Background: image")):g("Background: procedural (drop an image)");break;case"m":i.panImgOn=!i.panImgOn,g(`Image drift: ${T(i.panImgOn)}`);break;case"h":C.classList.toggle("hidden"),g(C.classList.contains("hidden")?"Menu hidden — press H to show":"Menu shown");break}});window.addEventListener("dragover",o=>{o.preventDefault(),X.classList.add("show")});window.addEventListener("dragleave",o=>{o.relatedTarget===null&&X.classList.remove("show")});window.addEventListener("drop",o=>{var t,s;o.preventDefault(),X.classList.remove("show");const n=(s=(t=o.dataTransfer)==null?void 0:t.files)==null?void 0:s[0];if(n&&n.type.startsWith("image/")){const a=new FileReader;a.onload=()=>{const r=a.result;J(r),se(r)},a.readAsDataURL(n)}});function j(){const o=Math.min(window.devicePixelRatio||1,2),n=Math.floor(h.clientWidth*o),t=Math.floor(h.clientHeight*o);(h.width!==n||h.height!==t)&&(h.width=n,h.height=t,M.resize()),e.viewport(0,0,h.width,h.height)}window.addEventListener("resize",j);let ce=performance.now();function B(o){const n=(o-ce)/1e3,t=Math.min(.05,(o-B.prev||0)/1e3||0);B.prev=o,j(),c.spinning&&(c.rot+=c.spin*t),c.autoDrift&&(c.pan[0]+=Math.cos(n*.31)*.12*t,c.pan[1]+=Math.sin(n*.23)*.12*t);const s=Math.min(1,t*5);i.warp+=((i.warpOn?.5:0)-i.warp)*s,i.glow+=((i.glowOn?1:0)-i.glow)*s,i.hueOn&&(i.hue=(i.hue+t*.6)%(Math.PI*2)),i.panImgOn&&(i.texPhase+=t*.15,i.texPan[0]=Math.cos(i.texPhase)*.6,i.texPan[1]=Math.sin(i.texPhase*.8)*.6);const a=R[c.triangle];M.symmetry=a.order,e.uniform2f(f.res,h.width,h.height),e.uniform1f(f.time,n),e.uniform2f(f.pan,c.pan[0],c.pan[1]),e.uniform1f(f.scale,c.scale),e.uniform1f(f.rot,c.rot),e.uniform2f(f.n0,a.n[0][0],a.n[0][1]),e.uniform1f(f.d0,a.d[0]),e.uniform2f(f.n1,a.n[1][0],a.n[1][1]),e.uniform1f(f.d1,a.d[1]),e.uniform2f(f.n2,a.n[2][0],a.n[2][1]),e.uniform1f(f.d2,a.d[2]),e.uniform1i(f.useTex,p.useTex?1:0),e.uniform2f(f.texAspect,p.texAspect[0],p.texAspect[1]),e.uniform2f(f.texPan,i.texPan[0],i.texPan[1]),e.uniform1f(f.warp,i.warp),e.uniform1f(f.hue,i.hue),e.uniform1f(f.glow,i.glow),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,q),e.drawArrays(e.TRIANGLES,0,3),M.update(t),M.draw(c.rot),requestAnimationFrame(B)}requestAnimationFrame(B);
