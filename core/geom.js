import * as THREE from 'three';

// 二维点用 [x, z] 数组表示（场景米）
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const len2 = a => Math.hypot(a[0], a[1]);
export const norm2 = a => { const l = len2(a) || 1; return [a[0] / l, a[1] / l]; };
export const insertY = ([x, z], y) => [x, y, z];
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += len2(sub2(pts[i], pts[i - 1]));
  return L;
}

// 平滑折线（Catmull-Rom 采样）
export function smooth(pts, step = 8) {
  if (pts.length < 3) return densify(pts, step);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], 0, p[1])), false, 'centripetal');
  const n = Math.max(8, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map(v => [v.x, v.z]);
}
export function densify(pts, step = 8) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(len2(sub2(b, a)) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

// 沿折线生成带状几何（道路/河道），UV.y 按米计；width / y 可为逐点数组；flip 时朝下
export function ribbon(pts, width, y = 0, texLen = 30, flip = false) {
  const pos = [], uv = [], idx = [];
  const W = Array.isArray(width) ? i => width[i] : () => width;
  const Y = Array.isArray(y) ? i => y[i] : () => y;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = norm2(sub2(b, a));
    const n = [-t[1], t[0]];
    if (i > 0) acc += len2(sub2(p, pts[i - 1]));
    const hw = W(i) / 2, yy = Y(i);
    pos.push(p[0] + n[0] * hw, yy, p[1] + n[1] * hw, p[0] - n[0] * hw, yy, p[1] - n[1] * hw);
    uv.push(0, acc / texLen, 1, acc / texLen);
    if (i > 0) {
      const k = i * 2;
      if (flip) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      else idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])));
  return s;
}
export function flatPoly(pts, y, mat) {
  const g = new THREE.ShapeGeometry(shapeFrom(pts));
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
export function segIntersect(a, b, c, d) {
  const r = sub2(b, a), s = sub2(d, c), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t, norm2(r)] : null;
}
export function polyIntersect(p, q) {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) {
    const hit = segIntersect(p[i - 1], p[i], q[j - 1], q[j]);
    if (hit) return hit;
  }
  return null;
}
export const offsetLine = (pts, d) => pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const t = norm2(sub2(b, a));
  return [p[0] - t[1] * d, p[1] + t[0] * d];
});
// 逐点偏移量版本（车道横向渐变）
export const offsetLineVar = (pts, ds) => pts.map((p, i) => offsetLine([pts[Math.max(0, i - 1)], p, pts[Math.min(pts.length - 1, i + 1)]], ds[i])[1]);
