// 百度 19 级矢量图提取结果 → data/roads.js、data/greens.js、data/water.js（底图像素 P 坐标）
// 用法：tools/vmap.html 跑完后把 window.VMAP 存为 .research/vmap.json，再 node parks/creative/tools/vmap.mjs
// 道路：端点吸附成节点 → 收缩岔口处的极短边 → 反复剪毛刺、合并度为 2 的节点 → 补缺 → 去掉与 layout 主干道重合的线 →
//       尽头路若停在主干道边上，延伸到主干道中线 → 丢掉短的尽头段。路宽按矢量图白色路面宽度分三档
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('..', import.meta.url);
const V = JSON.parse(readFileSync(new URL('.research/vmap.json', here), 'utf8'));

const SNAP = 3, TINY = 4, SPUR = 12, GAP = 26, MIN_END = 24, MIN_LEN = 10;   // 均为 P 像素
const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const len = pts => pts.reduce((s, p, i) => s + (i ? d2(p, pts[i - 1]) : 0), 0);

// ── 节点（网格哈希吸附）──
const nodes = [], grid = new Map();
const cell = (x, y) => `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
const nodeOf = p => {
  const cx = Math.floor(p[0] / 8), cy = Math.floor(p[1] / 8);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of grid.get(`${cx + i},${cy + j}`) || []) if (d2(nodes[n], p) <= SNAP) return n;
  nodes.push([...p]);
  const k = cell(...p); grid.set(k, [...(grid.get(k) || []), nodes.length - 1]);
  return nodes.length - 1;
};
let edges = V.roads.map(r => ({ pts: r.pts, a: nodeOf(r.pts[0]), b: nodeOf(r.pts.at(-1)), wl: r.w * len(r.pts), l: len(r.pts) }));
const degree = () => { const d = new Map(); for (const e of edges) { d.set(e.a, (d.get(e.a) || 0) + 1); d.set(e.b, (d.get(e.b) || 0) + 1); } return d; };
const mergeW = (e1, e2) => ({ wl: e1.wl + e2.wl, l: e1.l + e2.l });

// 收缩极短边（岔口一团节点像素之间的小段）
for (let changed = true; changed;) {
  changed = false;
  for (const e of edges) {
    if (e.a === e.b || len(e.pts) >= TINY) continue;
    const from = e.b, to = e.a;
    edges = edges.filter(x => x !== e);
    for (const x of edges) {
      if (x.a === from) { x.a = to; x.pts = [nodes[to], ...x.pts.slice(1)]; }
      if (x.b === from) { x.b = to; x.pts = [...x.pts.slice(0, -1), nodes[to]]; }
    }
    changed = true; break;
  }
}
edges = edges.filter(e => !(e.a === e.b && len(e.pts) < SPUR * 2));

// 反复剪毛刺 + 合并度为 2 的节点
function mergeDeg2() {
  for (let merged = true; merged;) {
    merged = false;
    const d = degree(), byNode = new Map();
    for (const e of edges) for (const n of [e.a, e.b]) byNode.set(n, [...(byNode.get(n) || []), e]);
    for (const [n, k] of d) {
      if (k !== 2) continue;
      const two = byNode.get(n);
      if (two.length !== 2 || two[0] === two[1]) continue;
      const [e1, e2] = two;
      const p1 = e1.b === n ? e1.pts : [...e1.pts].reverse(), s1 = e1.b === n ? e1.a : e1.b;
      const p2 = e2.a === n ? e2.pts : [...e2.pts].reverse(), s2 = e2.a === n ? e2.b : e2.a;
      edges = edges.filter(e => e !== e1 && e !== e2);
      edges.push({ pts: [...p1, ...p2.slice(1)], a: s1, b: s2, ...mergeW(e1, e2) });
      merged = true; break;
    }
  }
}
for (let round = 0; round < 20; round++) {
  const before = edges.length;
  for (let changed = true; changed;) {
    const d = degree(), n0 = edges.length;
    edges = edges.filter(e => !((d.get(e.a) === 1 || d.get(e.b) === 1) && d.get(e.a) + d.get(e.b) > 2 && len(e.pts) < SPUR));
    changed = edges.length !== n0;
  }
  mergeDeg2();
  if (edges.length === before) break;
}

// 补缺：图标、文字压断的路。两个悬空端点相距 GAP 以内、且连线与两端走向都一致（夹角 < 35°）时连起来
{
  const d = degree(), ends = [];
  for (const e of edges) for (const [n, pts] of [[e.a, e.pts], [e.b, [...e.pts].reverse()]]) {
    if (d.get(n) !== 1) continue;
    const p = pts[0], q = pts[Math.min(3, pts.length - 1)], l = d2(p, q) || 1;
    ends.push({ n, p, t: [(p[0] - q[0]) / l, (p[1] - q[1]) / l], e });
  }
  const used = new Set();
  for (const u of ends) {
    if (used.has(u.n)) continue;
    let best = null, bd = GAP;
    for (const v of ends) {
      if (v === u || v.e === u.e || used.has(v.n)) continue;
      const dx = v.p[0] - u.p[0], dy = v.p[1] - u.p[1], dist = Math.hypot(dx, dy);
      if (dist >= bd || dist < 1) continue;
      const cu = (dx * u.t[0] + dy * u.t[1]) / dist, cv = -(dx * v.t[0] + dy * v.t[1]) / dist;
      if (cu > 0.82 && cv > 0.82) { bd = dist; best = v; }
    }
    if (best) { edges.push({ pts: [u.p, best.p], a: u.n, b: best.n, wl: 0, l: 0 }); used.add(u.n); used.add(best.n); }
  }
  mergeDeg2();
}

// 去掉主干道：layout 的主干道中线（场景米 → P）附近的线（矢量图上湖西路、青丰路、湖兴路也是白色宽路）
const L = await import(new URL('layout.js', here).href);
const toP = ([x, z]) => [x / L.PX + L.ORIGIN[0], z / L.PX + L.ORIGIN[1]];
const mains = L.ROADS.map(r => ({ pts: r.pts.map(toP), w: r.w / L.PX }));
const segProj = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return [a[0] + dx * t, a[1] + dy * t];
};
const nearest = p => {
  let best = { d: Infinity };
  for (const m of mains) for (let i = 1; i < m.pts.length; i++) {
    const q = segProj(p, m.pts[i - 1], m.pts[i]), d = d2(p, q);
    if (d < best.d) best = { d, q, m };
  }
  return best;
};
// 双幅路（青丰路）的两幅相距约 16–19 m，半径放到路宽一半 + 13 m
const nearMain = p => { const n = nearest(p); return n.d < n.m.w / 2 + 13 / L.PX; };
const dense = pts => pts.flatMap((p, i) => {
  if (!i) return [p];
  const q = pts[i - 1], n = Math.max(1, Math.ceil(d2(p, q) / 4));
  return Array.from({ length: n }, (_, k) => [q[0] + (p[0] - q[0]) * (k + 1) / n, q[1] + (p[1] - q[1]) * (k + 1) / n]);
});
edges = edges.filter(e => { const d = dense(e.pts); return d.filter(nearMain).length / d.length < 0.6; });
// 剩下的线若有一头伸进主干道范围，截掉伸进去的部分
for (const e of edges) {
  while (e.pts.length > 2 && nearMain(e.pts[0]) && nearMain(e.pts[1])) e.pts.shift();
  while (e.pts.length > 2 && nearMain(e.pts.at(-1)) && nearMain(e.pts.at(-2))) e.pts.pop();
}

// 尽头延伸：端点停在主干道路缘外 8 m 以内时，沿主干道法向接到中线（矢量图上支路画到主干道路缘为止）
const ext = pts => {
  const n = nearest(pts.at(-1));
  return n.d < n.m.w / 2 + 8 / L.PX && n.d > 1 ? [...pts, n.q.map(v => +v.toFixed(1))] : pts;
};
{
  const d = degree();
  for (const e of edges) {
    if (d.get(e.b) === 1) e.pts = ext(e.pts);
    if (d.get(e.a) === 1) e.pts = ext([...e.pts].reverse()).reverse();
  }
}

// 丢掉短线：尽头段短于 MIN_END、两头都接路的短于 MIN_LEN
{
  const d = degree();
  edges = edges.filter(e => {
    const l = len(e.pts), dead = d.get(e.a) === 1 || d.get(e.b) === 1;
    return l >= (dead ? MIN_END : MIN_LEN);
  });
}

// 简化（Douglas–Peucker，1 px）
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy);
  let k = 0, dm = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Ln ? Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / Ln : d2(pts[i], a);
    if (d > dm) { dm = d; k = i; }
  }
  return dm <= tol ? [a, b] : [...rdp(pts.slice(0, k + 1), tol).slice(0, -1), ...rdp(pts.slice(k), tol)];
}
// 路宽档位（m）：矢量图白色路面宽 ≥ 10 px 为 8 m 的小区主路，≥ 6 px 为 6 m，其余 4.5 m
const width = e => { const w = e.l ? e.wl / e.l : 5; return w >= 10 ? 8 : w >= 6 ? 6 : 4.5; };
const roads = edges
  .map(e => ({ pts: rdp(e.pts, 1).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), w: width(e) }))
  .sort((p, q) => p.pts[0][0] - q.pts[0][0] || p.pts[0][1] - q.pts[0][1]);

const head = what => `// 由 tools/vmap.mjs 自 .research/vmap.json（tools/vmap.html 从百度 19 级矢量图截图按颜色提取）生成，请勿手改。\n// ${what}\n`;
writeFileSync(new URL('data/roads.js', here), head('支路、小区与园区内部道路中线（底图像素 P 坐标），w 为路面宽 m；已去掉与 layout.js 主干道重合的线。') +
  `export default [\n${roads.map(r => `  { w: ${r.w}, pts: ${JSON.stringify(r.pts)} },`).join('\n')}\n];\n`);
const polys = list => `export default [\n${list.map(p => `  ${JSON.stringify(p.map(([x, y]) => [Math.round(x), Math.round(y)]))},`).join('\n')}\n];\n`;
writeFileSync(new URL('data/greens.js', here), head('绿地外轮廓（底图像素 P 坐标，按面积从大到小，不含内洞）。') + polys(V.greens));
writeFileSync(new URL('data/water.js', here), head('水面外轮廓（底图像素 P 坐标，按面积从大到小）：世茂香槟湖、北塘河、澡港河被桥分成的几段、沙盘边上的河与水木年华的水池。') + polys(V.water));
console.log(`道路 ${V.roads.length} 段 → ${roads.length} 条（总长 ${Math.round(roads.reduce((s, r) => s + len(r.pts), 0) * L.PX)} m）；绿地 ${V.greens.length}；水面 ${V.water.length}`);
