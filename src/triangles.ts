export type Vec2 = [number, number];

export interface MirrorTriangle {
  name: string;
  // Outward unit normals and offsets for the three mirror edges,
  // centered on the triangle's incenter.
  n: [Vec2, Vec2, Vec2];
  d: [number, number, number];
  // Rotational spoke count of this fold (reserved for symmetry-aware effects).
  order: number;
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}
function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}
function len(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}
function norm(a: Vec2): Vec2 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
}

// Build mirror data from three vertices. Each edge's outward normal points
// away from the opposite vertex; the triangle is recentered on its incenter
// so it sits at the origin (clean rotation/zoom pivot).
function fromVertices(name: string, a: Vec2, b: Vec2, c: Vec2, order: number): MirrorTriangle {
  const lenA = len(sub(b, c)); // side opposite a
  const lenB = len(sub(a, c)); // side opposite b
  const lenC = len(sub(a, b)); // side opposite c
  const peri = lenA + lenB + lenC;
  const inc: Vec2 = [
    (lenA * a[0] + lenB * b[0] + lenC * c[0]) / peri,
    (lenA * a[1] + lenB * b[1] + lenC * c[1]) / peri,
  ];
  const A = sub(a, inc);
  const B = sub(b, inc);
  const C = sub(c, inc);

  const edges: [Vec2, Vec2, Vec2][] = [
    [A, B, C],
    [B, C, A],
    [C, A, B],
  ];

  const n: [Vec2, Vec2, Vec2] = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  const d: [number, number, number] = [0, 0, 0];

  edges.forEach(([p, q, opposite], i) => {
    const dir = sub(q, p);
    let normal: Vec2 = norm([-dir[1], dir[0]]);
    // Flip so the normal points away from the opposite vertex (outward).
    if (dot(normal, sub(opposite, p)) > 0) normal = [-normal[0], -normal[1]];
    n[i] = normal;
    d[i] = dot(p, normal);
  });

  return { name, n, d, order };
}

// Build a triangle from two of its interior angles (degrees). Vertex A sits at
// the origin with side c along +x; the third angle is implied. Handy for the
// irregular shapes, which are easier to describe by angle than by coordinate.
function fromAngles(name: string, degA: number, degB: number, order: number): MirrorTriangle {
  const A = (degA * Math.PI) / 180;
  const B = (degB * Math.PI) / 180;
  const C = Math.PI - A - B;
  const b = Math.sin(B); // law of sines with circumdiameter = 1
  const c = Math.sin(C);
  return fromVertices(
    name,
    [0, 0],
    [c, 0],
    [b * Math.cos(A), b * Math.sin(A)],
    order,
  );
}

const SQRT3 = Math.sqrt(3);

export const TRIANGLES: MirrorTriangle[] = [
  // These three reflect to tile the plane exactly — true, seamless kaleidoscopes.
  fromVertices(
    "equilateral (60-60-60)",
    [Math.cos(Math.PI / 2), Math.sin(Math.PI / 2)],
    [Math.cos(Math.PI / 2 + (2 * Math.PI) / 3), Math.sin(Math.PI / 2 + (2 * Math.PI) / 3)],
    [Math.cos(Math.PI / 2 - (2 * Math.PI) / 3), Math.sin(Math.PI / 2 - (2 * Math.PI) / 3)],
    6,
  ),
  fromVertices("right isosceles (45-45-90)", [0, 0], [1, 0], [0, 1], 8),
  fromVertices("hemiequilateral (30-60-90)", [0, 0], [SQRT3, 0], [0, 1], 12),
  // Irregular triangles don't tile cleanly — the fold never fully converges, so
  // it reads busier and more chaotic. That's the point; they're for variety.
  fromAngles("golden (72-72-36)", 72, 72, 5),
  fromAngles("golden gnomon (36-36-108)", 36, 36, 10),
  fromAngles("scalene (50-60-70)", 50, 60, 7),
  fromAngles("right scalene (35-55-90)", 35, 55, 11),
  fromAngles("acute sliver (24-30-126)", 24, 30, 9),
];
