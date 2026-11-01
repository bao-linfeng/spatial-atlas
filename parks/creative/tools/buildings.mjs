// 百度地图矢量瓦片楼栋 → data/buildings.js（底图像素 P 坐标 + 高度 m）
// 用法：node parks/creative/tools/buildings.mjs
// 输入 .research/baidu-buildings.json：在百度地图网页（普通地图，19 级）里读 map.tileMgr.tileLayers[0].tileCache 中
// 各瓦片 renderData.building3d 的顶点（每 7 个数：x, y, z, 法向 x/y/z, 颜色），取法向 (0,0,1) 的顶面环，按瓦片 "列_行" 存放。
// 瓦片 512 墨卡托单位见方、局部坐标 0–1024（y 向北）；z 与 x / y 同单位。跨瓦片的楼被切成几块，各块分别挤出即可拼合。
import { readFileSync, writeFileSync } from 'node:fs';
import { MERC } from './reg.js';

const here = new URL('..', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('.research/baidu-buildings.json', here), 'utf8'));

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

const out = [];
for (const key of Object.keys(raw).sort()) {
  const [col, row] = key.split('_').map(Number);
  for (const r of raw[key]) {
    const pts = clip(r.pts.map(p => toP(col, row, p)));
    if (pts.length < 3 || area(pts) < 4) continue;               // 面积不足 4 px²（约 1 ㎡）的碎片丢弃
    out.push({ h: +(r.z / 2 * M_PER_MERC).toFixed(1), pts: pts.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]) });
  }
}

const body = out.map(o => `  { h: ${o.h}, pts: ${JSON.stringify(o.pts)} },`).join('\n');
writeFileSync(new URL('data/buildings.js', here), `// 由 tools/buildings.mjs 自 .research/baidu-buildings.json 生成，请勿手改。
// 百度地图矢量瓦片楼栋（${new Date().toISOString().slice(0, 10)} 读取）：pts 为底图像素 P 坐标的顶面轮廓，h 为高度 m（百度数据，高层可信，低层别墅偏矮）。
// 退台建筑按高度拆成多个环；跨瓦片的楼被切成几块。
export default [
${body}
];
`);
console.log(`${out.length} 个楼栋环，最高 ${Math.max(...out.map(o => o.h))} m`);
