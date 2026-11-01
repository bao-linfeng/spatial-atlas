// 为一栋楼的八个方位挑全景点：读 pano-near.mjs 的输出，按方位角分组，用楼栋轮廓估算视线遮挡，每个方位列出前几名候选。
// 用法：node pano-pick.mjs --park <id> --near panos.json --at X,Y --h 64 [--self X,Y;X,Y] [--front 151] [--dmin 40] [--dmax 200] [--name C]
//   --at：目标楼中心（底图像素 P）；--h：楼高 m（用来折算遮挡比例）；--self：属于目标楼的轮廓中心（P，缺省同 --at），
//         轮廓包含该点、或顶点均值离该点 12 px 以内的都算自身（layout.js 的 at 是顶点均值，不一定落在轮廓内）
//   --front：「前」方位的方位角（度，北 0 顺时针；指全景点所在方向），其余七个方位每 45° 逆时针排开：前、前东角、东……
//   园区的 tools/reg.js 须导出 MERC，layout.js 须导出 PX，data/buildings.js 为楼栋轮廓（P 坐标，带 h）。
// 输出每行：方位 目标方位角: 全景ID|路名|拍摄年月|距离 m|方位角|遮 x（视线上其他楼挡住目标的高度比例，> 0.5 基本看不到）(挡住的楼高@距离)
// 遮挡只按楼栋轮廓估算，行道树看不出来：主干道边的点常被树挡，园区内道路的点更好用。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { args } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const { opt } = args();
const nums = s => String(s || '').split(',').map(Number);
const C = nums(opt.at), H = +opt.h;
if (!opt.park || !opt.near || C.length !== 2 || !H) { console.error('需要 --park、--near、--at X,Y 与 --h'); process.exit(1); }
const self = (opt.self ? String(opt.self).split(';') : [opt.at]).map(nums);
const front = +(opt.front ?? 151), dmin = +(opt.dmin ?? 40), dmax = +(opt.dmax ?? 200), name = opt.name || '';
const park = f => pathToFileURL(resolve(ROOT, `parks/${opt.park}/${f}`)).href;
const { MERC } = await import(park('tools/reg.js'));
const { PX } = await import(park('layout.js'));
const BUILDINGS = (await import(park('data/buildings.js'))).default;
const toP = ([X, Y]) => [MERC.a * X - MERC.b * Y + MERC.c, -MERC.b * X - MERC.a * Y + MERC.f];

const inPoly = ([x, y], pts) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
// 线段 p→q 与多边形的第一个交点参数 t（p 在多边形内为 0，不相交为 Infinity）
const segHit = (p, q, pts) => {
  if (inPoly(p, pts)) return 0;
  let tmin = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (!den) continue;
    const t = ((x1 - p[0]) * ey - (y1 - p[1]) * ex) / den, s = ((x1 - p[0]) * dy - (y1 - p[1]) * dx) / den;
    if (t > 0 && t < 1 && s >= 0 && s <= 1) tmin = Math.min(tmin, t);
  }
  return tmin;
};
const cen = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const others = BUILDINGS.filter(o => !self.some(s => inPoly(s, o.pts) || Math.hypot(cen(o.pts)[0] - s[0], cen(o.pts)[1] - s[1]) < 12));

const rows = JSON.parse(readFileSync(resolve(opt.near), 'utf8')).map(p => {
  const P = toP([p.x, p.y]);
  const dist = Math.round(Math.hypot(P[0] - C[0], P[1] - C[1]) * PX), az = Math.round((Math.atan2(P[0] - C[0], C[1] - P[1]) * 180 / Math.PI + 360) % 360);
  // 遮挡：视线上的其他楼按相似三角形折算到目标处被挡住的高度（低于 8 m 的按 9.6 m）
  let occ = 0, by = '';
  for (const o of others) {
    const t = segHit(P, C, o.pts); if (!isFinite(t) || t >= 0.97) continue;
    const h = o.h >= 8 ? o.h : 9.6, hh = h / Math.max(t, 0.02);
    if (hh > occ) { occ = hh; by = `${h}m@${Math.round(t * dist)}`; }
  }
  return { ...p, dist, az, occ: Math.min(occ / H, 9), by };
});
const DIRS = ['前', '前东角', '东', '后东角', '后', '后西角', '西', '前西角'];
for (let k = 0; k < 8; k++) {
  const az = (front + 360 - 45 * k) % 360, da = p => Math.abs(((p.az - az + 540) % 360) - 180);
  const cand = rows.filter(p => da(p) <= 22 && p.dist >= dmin && p.dist <= dmax)
    .sort((p, q) => Math.round(p.occ * 4) - Math.round(q.occ * 4) || da(p) - da(q));
  console.log(`${name}${name && '-'}${DIRS[k]} az${az}:`, cand.slice(0, 5).map(p =>
    `${p.id}|${p.road}|${String(p.date).slice(0, 6)}|${p.dist}m|az${p.az}|遮${p.occ.toFixed(2)}${p.by ? `(${p.by})` : ''}`).join('  ') || '无');
}
