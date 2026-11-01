// 楼栋 → data/buildings.js（底图像素 P 坐标 + 高度 m）：轮廓取高德，高度取百度。
// 用法：node parks/creative/tools/buildings.mjs（先跑 vmap.html?src=amap 得到 .research/amap-vmap.json）
// 轮廓：高德 19 级矢量图楼栋色块的外轮廓（amap-vmap.json 的 buildings，简化容差约 0.5 m）。
// 高度：高德底图不带高度，按百度矢量瓦片楼栋环匹配。两家局部相差几米，每栋先在 ±SHIFT 内平移搜索，取被百度环覆盖最多的位置，
// 再取覆盖面积 ≥ 30% 的最高一档（退台楼取塔楼高度）；覆盖不足 25% 的算没有对应，h 记 0（layout 按 3 层低层处理）。
// 百度环：.research/baidu-buildings.json，在百度地图网页（普通地图，19 级）里读 map.tileMgr.tileLayers[0].tileCache 中
// 各瓦片 renderData.building3d 的顶点（每 7 个数：x, y, z, 法向 x/y/z, 颜色），取法向 (0,0,1) 的顶面环，按瓦片 "列_行" 存放。
// 瓦片 512 墨卡托单位见方、局部坐标 0–1024（y 向北）；z 与 x / y 同单位。
import { readFileSync, writeFileSync } from 'node:fs';
import { MERC } from './reg.js';

const here = new URL('..', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('.research/baidu-buildings.json', here), 'utf8'));
const V = JSON.parse(readFileSync(new URL('.research/amap-vmap.json', here), 'utf8'));

const M_PER_P = 0.48;                                        // layout.js 的 PX
const M_PER_MERC = M_PER_P * Math.hypot(MERC.a, MERC.b);     // 1 墨卡托单位 ≈ 0.86 m
const { a, b, c, f } = MERC;
const toP = (col, row, [x, y]) => {
  const X = col * 512 + x / 2, Y = row * 512 + y / 2;
  return [a * X - b * Y + c, -b * X - a * Y + f];
};

// 沙盘范围（底图像素，与 layout.js 的 PLATE 一致），多边形按矩形裁切（Sutherland–Hodgman）
const R = { x0: 650.5, x1: 3799.5, y0: 50.5, y1: 1599.5 };
function clip(poly) {
  const cut = (p, q, k, v) => { const t = (v - p[k]) / (q[k] - p[k]); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  const edges = [[p => p[0] >= R.x0, 0, R.x0], [p => p[0] <= R.x1, 0, R.x1], [p => p[1] >= R.y0, 1, R.y0], [p => p[1] <= R.y1, 1, R.y1]];
  let out = poly;
  for (const [inside, k, v] of edges) {
    const src = out; out = [];
    src.forEach((p, i) => {
      const q = src[(i + src.length - 1) % src.length];
      if (inside(p)) { if (!inside(q)) out.push(cut(q, p, k, v)); out.push(p); } else if (inside(q)) out.push(cut(q, p, k, v));
    });
  }
  return out;
}
const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const inPoly = ([x, y], poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ── 百度楼栋环（P 坐标），按 16 px 网格索引 ──
const baidu = [];
for (const key of Object.keys(raw).sort()) {
  const [col, row] = key.split('_').map(Number);
  for (const r of raw[key]) {
    const pts = clip(r.pts.map(p => toP(col, row, p)));
    if (pts.length < 3 || area(pts) < 4) continue;               // 面积不足 4 px²（约 1 ㎡）的碎片丢弃
    baidu.push({ h: +(r.z / 2 * M_PER_MERC).toFixed(1), pts });
  }
}
const CELL = 16, index = new Map();
baidu.forEach((o, i) => {
  const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]);
  for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++)
    for (let gy = Math.floor(Math.min(...ys) / CELL); gy <= Math.floor(Math.max(...ys) / CELL); gy++) {
      const k = `${gx},${gy}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(i);
    }
});
// 点所在百度环的高度（几个环重叠时取高的），不在任何环里为 −1
const heightAt = p => {
  let h = -1;
  for (const i of index.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) || []) if (baidu[i].h > h && inPoly(p, baidu[i].pts)) h = baidu[i].h;
  return h;
};

// ── 高德轮廓逐栋匹配高度 ──
const SHIFT = 16, STEP = 2;   // P 像素：平移搜索 ±16 px（约 ±7.7 m）、步长 2 px；栋内采样间距 2 px
const out = [];
for (const poly of V.buildings) {
  const pts = clip(poly);
  if (pts.length < 3 || area(pts) < 12) continue;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), samples = [];
  for (let x = Math.min(...xs) + STEP / 2; x < Math.max(...xs); x += STEP)
    for (let y = Math.min(...ys) + STEP / 2; y < Math.max(...ys); y += STEP) if (inPoly([x, y], pts)) samples.push([x, y]);
  if (!samples.length) continue;
  let best = { cover: -1, dx: 0, dy: 0 };
  for (let dx = -SHIFT; dx <= SHIFT; dx += 2) for (let dy = -SHIFT; dy <= SHIFT; dy += 2) {
    const hs = samples.map(([x, y]) => heightAt([x + dx, y + dy])), cover = hs.filter(h => h >= 0).length / hs.length;
    if (cover > best.cover + 1e-9 || (Math.abs(cover - best.cover) < 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { cover, hs, dx, dy };
  }
  let h = 0;
  if (best.cover >= 0.25) {
    const hs = best.hs.filter(v => v >= 0).sort((p, q) => q - p);
    h = hs.find((v, i) => (i + 1) / best.hs.length >= 0.3) ?? hs.at(-1);
  }
  out.push({ h, pts: pts.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]), cover: best.cover, shift: [best.dx, best.dy] });
}

const body = out.map(o => `  { h: ${o.h}, pts: ${JSON.stringify(o.pts)} },`).join('\n');
writeFileSync(new URL('data/buildings.js', here), `// 由 tools/buildings.mjs 生成，请勿手改。
// 轮廓：高德 19 级矢量图楼栋色块（.research/amap-z19.png → tools/vmap.html?src=amap → .research/amap-vmap.json），底图像素 P 坐标。
// 高度 h（m）：按百度矢量瓦片楼栋环（.research/baidu-buildings.json）平移匹配，高层可信、低层别墅偏矮；h 为 0 的是百度没有对应的楼。
export default [
${body}
];
`);
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(out));
const ok = out.filter(o => o.h), shifts = ok.map(o => Math.hypot(...o.shift) * M_PER_P).sort((p, q) => p - q);
console.log(`高德 ${out.length} 栋，匹配到百度高度 ${ok.length} 栋（平移中位 ${shifts[shifts.length >> 1].toFixed(1)} m），未匹配：`);
for (const o of out.filter(o => !o.h)) {
  const cen = o.pts.reduce((s, p) => [s[0] + p[0] / o.pts.length, s[1] + p[1] / o.pts.length], [0, 0]);
  console.log(`  [${cen.map(Math.round)}] ${Math.round(area(o.pts) * M_PER_P ** 2)} ㎡，覆盖 ${(o.cover * 100).toFixed(0)}%`);
}
