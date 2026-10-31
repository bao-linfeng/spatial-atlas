import { sub2, len2, norm2 } from './geom.js';

// ── 车道：按行驶方向的折线 { pts, ys }，用于路口转向拼接 ──
export const laneOf = (pts, y) => ({ pts, ys: Array.isArray(y) ? y : pts.map(() => y) });
export const revLane = l => ({ pts: l.pts.slice().reverse(), ys: l.ys.slice().reverse() });
export function laneCum(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + len2(sub2(pts[i], pts[i - 1])));
  return c;
}
export function laneAt(l, cum, s) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
  const a = l.pts[i - 1], b = l.pts[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, l.ys[i - 1] + (l.ys[i] - l.ys[i - 1]) * t];
}
export function cutLane(l, cum, s0, s1) {
  const out = { pts: [], ys: [] };
  const push = ([x, z, y]) => { out.pts.push([x, z]); out.ys.push(y); };
  push(laneAt(l, cum, s0));
  cum.forEach((c, i) => { if (c > s0 && c < s1) push([...l.pts[i], l.ys[i]]); });
  push(laneAt(l, cum, s1));
  return out;
}
// 路口转向：a 行至与 b 交点前 r 米，经二次贝塞尔（控制点为交点）接入 b 交点后 r 米；
// T 形路口车道未必相交，故 a 末端向前、b 起点向后各延长 40 m 再求交
export function turnLane(a, b, r = 9) {
  const n = a.pts.length, da = norm2(sub2(a.pts[n - 1], a.pts[n - 2])), db = norm2(sub2(b.pts[0], b.pts[1]));
  const A = { pts: [...a.pts, [a.pts[n - 1][0] + da[0] * 40, a.pts[n - 1][1] + da[1] * 40]], ys: [...a.ys, a.ys[n - 1]] };
  const B = { pts: [[b.pts[0][0] + db[0] * 40, b.pts[0][1] + db[1] * 40], ...b.pts], ys: [b.ys[0], ...b.ys] };
  const ca = laneCum(A.pts), cb = laneCum(B.pts);
  let sa = -1, sb = -1;
  for (let i = 1; i < A.pts.length && sa < 0; i++) for (let j = 1; j < B.pts.length; j++) {
    const p = A.pts[i - 1], q = B.pts[j - 1], u = sub2(A.pts[i], p), v = sub2(B.pts[j], q), den = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den, w = ((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]) / den;
    if (t < 0 || t > 1 || w < 0 || w > 1) continue;
    sa = ca[i - 1] + t * (ca[i] - ca[i - 1]); sb = cb[j - 1] + w * (cb[j] - cb[j - 1]);
    break;
  }
  if (sa < 0) throw new Error('turnLane: 车道不相交');
  const head = cutLane(A, ca, 0, Math.max(0, sa - r)), tail = cutLane(B, cb, Math.min(cb.at(-1), sb + r), cb.at(-1));
  const p0 = head.pts.at(-1), p2 = tail.pts[0], [cx, cz] = laneAt(A, ca, sa), y0 = head.ys.at(-1), y2 = tail.ys[0];
  for (let k = 1; k < 8; k++) {
    const t = k / 8, s = 1 - t;
    head.pts.push([s * s * p0[0] + 2 * s * t * cx + t * t * p2[0], s * s * p0[1] + 2 * s * t * cz + t * t * p2[1]]);
    head.ys.push(y0 + (y2 - y0) * t);
  }
  return { pts: [...head.pts, ...tail.pts], ys: [...head.ys, ...tail.ys] };
}
