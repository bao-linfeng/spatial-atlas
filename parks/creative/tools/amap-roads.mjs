// 主干道中线吸附到高德路面：node parks/creative/tools/amap-roads.mjs [--plot]
// 输入 layout.js 的 ROADS（手工数字化的中线）与 .research/amap-vmap.json 的道路中线（vmap.html?src=amap 提取，带路面等级 cls）。
// 沿现有中线每 SPACING 取一点，在法线 ±R 内找走向一致（夹角 < 30°）的高德主 / 次干道（cls ≤ 2）中线交点：
// 先统计全路命中最多的等级，只用该等级的交点（免得被平行的辅路、匝道带偏）；取离得最近的一条，对侧 MAX_DUAL 以内
// 还有一条时视为双幅路，取两幅中点。偏移量按 9 点中值平滑后移动该点，再按 0.7 px 简化。端点在沙盘边上的外推 30 px，
// 交给 layout.js 的 clip 截齐；落在沙盘内的端点（丁字路口）原样保留，抄回后与相交道路对齐。打印各路偏移统计和新折线（底图像素），抄回 layout.js。
import { readFileSync } from 'node:fs';

const here = new URL('..', import.meta.url);
const V = JSON.parse(readFileSync(new URL('.research/amap-vmap.json', here), 'utf8'));
const L = await import(new URL('layout.js', here).href);
const toP = ([x, z]) => [x / L.PX + L.ORIGIN[0], z / L.PX + L.ORIGIN[1]];

const SPACING = 20, MAX_DUAL = 40;   // P 像素
const segs = V.roads.filter(r => r.cls <= 2).flatMap(r => r.pts.slice(1).map((b, i) => [r.pts[i], b, r.cls]));
const { x0, y0, x1, y1 } = L.PLATE_PX, onEdge = ([x, y]) => Math.min(x - x0, x1 - x, y - y0, y1 - y) < 5;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1], norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l]; };

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(...sub(b, a));
    let s = step - carry;
    for (; s <= l; s += step) out.push([a[0] + (b[0] - a[0]) * s / l, a[1] + (b[1] - a[1]) * s / l]);
    carry = l - (s - step);
  }
  if (Math.hypot(...sub(out.at(-1), pts.at(-1))) > step / 3) out.push(pts.at(-1)); else out[out.length - 1] = pts.at(-1);
  return out;
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts.at(-1), d = sub(b, a), Ln = Math.hypot(...d);
  let k = 0, dm = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const e = Ln ? Math.abs((pts[i][0] - a[0]) * d[1] - (pts[i][1] - a[1]) * d[0]) / Ln : Math.hypot(...sub(pts[i], a));
    if (e > dm) { dm = e; k = i; }
  }
  return dm <= tol ? [a, b] : [...rdp(pts.slice(0, k + 1), tol).slice(0, -1), ...rdp(pts.slice(k), tol)];
}

const out = [];
for (const road of L.ROADS) {
  const pts = resample(road.pts.map(toP), SPACING), R = road.w / 2 / L.PX + 24;
  const offs = pts.map((p, i) => {
    const t = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])), n = [-t[1], t[0]];
    const hits = [];
    for (const [a, b, cls] of segs) {
      const d = sub(b, a), l = Math.hypot(...d);
      if (l < 1e-6 || Math.abs(dot(d, t)) / l < 0.866) continue;
      // p + s·n 与 a + u·d 相交
      const den = n[0] * d[1] - n[1] * d[0];
      if (Math.abs(den) < 1e-9) continue;
      const ap = sub(a, p), s = (ap[0] * d[1] - ap[1] * d[0]) / den, u = (ap[0] * n[1] - ap[1] * n[0]) / den;
      if (u >= 0 && u <= 1 && Math.abs(s) <= R) hits.push({ s, cls });
    }
    return hits;
  });
  const count = [0, 0, 0]; for (const h of offs.flat()) count[h.cls]++;
  const main = count[1] >= count[2] ? 1 : 2;
  offs.forEach((hs, i) => {
    const hits = hs.filter(h => h.cls === main).map(h => h.s).sort((x, y) => Math.abs(x) - Math.abs(y));
    if (!hits.length) { offs[i] = null; return; }
    const h0 = hits[0], twin = hits.find(h => Math.sign(h) !== Math.sign(h0) && Math.abs(h - h0) <= MAX_DUAL);
    offs[i] = twin === undefined ? h0 : (h0 + twin) / 2;
  });
  // 缺测点按两侧插值（两端缺测取最近值），再 5 点中值平滑
  const known = offs.map((o, i) => [i, o]).filter(([, o]) => o !== null);
  if (!known.length) { console.log(`${road.name}：附近没有高德主次干道，保持原样`); continue; }
  const fill = offs.map((o, i) => {
    if (o !== null) return o;
    const lo = known.filter(([j]) => j < i).at(-1), hi = known.find(([j]) => j > i);
    if (!lo) return hi[1]; if (!hi) return lo[1];
    return lo[1] + (hi[1] - lo[1]) * (i - lo[0]) / (hi[0] - lo[0]);
  });
  const sm = fill.map((_, i) => { const w = fill.slice(Math.max(0, i - 4), i + 5).sort((a, b) => a - b); return w[w.length >> 1]; });
  let moved = pts.map((p, i) => {
    const t = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])), n = [-t[1], t[0]];
    return [p[0] + n[0] * sm[i], p[1] + n[1] * sm[i]];
  });
  // 沙盘边上的端点外推 30 px（原折线两端本来伸出沙盘，clip 后正好在边上）
  const ext = (a, b) => { const d = norm(sub(a, b)); return [a[0] + d[0] * 30, a[1] + d[1] * 30]; };
  if (onEdge(pts[0])) moved.unshift(ext(moved[0], moved[1]));
  if (onEdge(pts.at(-1))) moved.push(ext(moved.at(-1), moved.at(-2)));
  const simp = rdp(moved, 0.7).map(([x, y]) => [Math.round(x), Math.round(y)]);
  const abs = sm.map(Math.abs).sort((a, b) => a - b);
  console.log(`${road.name}：${pts.length} 点，按等级 ${main} 命中 ${known.length}，偏移中位 ${(abs[abs.length >> 1] * L.PX).toFixed(1)} m、最大 ${(abs.at(-1) * L.PX).toFixed(1)} m`);
  out.push({ name: road.name, pts: simp, offs: sm });
}
console.log('\n' + out.map(r => `// ${r.name}\n${JSON.stringify(r.pts).replace(/\],\[/g, '], [')}`).join('\n'));
if (process.argv.includes('--plot')) console.log(out.map(r => r.pts.map(p => p.join(',')).join(';')).join('|'));
