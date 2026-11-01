// 按沙盘范围生成百度地图分块截图的中心（百度墨卡托），输出 JSON [[X, Y], ...]：自北向南逐行、每行自西向东
// （与 creative 的 MAP19 同序，即 reg.js 里按序号配准的顺序）。
// 用法：
//   node tiles.mjs --reg parks/<id>/tools/reg.js --plate 650,50,3800,1600 [--margin 30] [--zoom 19] [--view 1897x935] [--overlap 0.2] > centers.json
//   node tiles.mjs --merc X0,Y0,X1,Y1 ...
// --plate 为底图像素范围（P），经 reg.js 的 MERC 反算墨卡托；--margin 为四周外扩的 P 像素。
// --view 为地图容器 css 像素（prep.js 返回的 rect 宽高），每 css 像素 2^(18 − zoom) 墨卡托单位；--overlap 为相邻块的重叠比例。
// 地球模式实际缩放约 18.91，视野比 19 级略大，可直接沿用同一组中心。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args } from './cdp.mjs';

const { opt } = args();
const zoom = +(opt.zoom || 19), [vw, vh] = (opt.view || '1897x935').split('x').map(Number), overlap = +(opt.overlap ?? 0.2);
let X0, Y0, X1, Y1;
if (opt.merc) [X0, Y0, X1, Y1] = opt.merc.split(',').map(Number);
else {
  if (!opt.reg || !opt.plate) { console.error('需要 --reg 与 --plate，或 --merc'); process.exit(1); }
  const { MERC } = await import(pathToFileURL(resolve(opt.reg)).href);
  if (!MERC) { console.error(`${opt.reg} 没有导出 MERC（先用 fit.mjs --meta 拟合）`); process.exit(1); }
  const { a, b, c, f } = MERC, k = a * a + b * b, m = +(opt.margin || 30);
  // P.x = a·X − b·Y + c，P.y = −b·X − a·Y + f 的逆
  const toMerc = (px, py) => { const u = px - c, v = py - f; return [(a * u - b * v) / k, -(b * u + a * v) / k]; };
  const [x0, y0, x1, y1] = opt.plate.split(',').map(Number);
  const corners = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x0 - m, y1 + m], [x1 + m, y1 + m]].map(p => toMerc(...p));
  X0 = Math.min(...corners.map(p => p[0])); X1 = Math.max(...corners.map(p => p[0]));
  Y0 = Math.min(...corners.map(p => p[1])); Y1 = Math.max(...corners.map(p => p[1]));
}
const r = 2 ** (18 - zoom), W = vw * r, H = vh * r;
const axis = (lo, hi, span) => {
  const L = hi - lo;
  if (L <= span) return [(lo + hi) / 2];
  const n = Math.ceil((L - span) / (span * (1 - overlap))) + 1, step = (L - span) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + span / 2 + step * i);
};
const xs = axis(Math.min(X0, X1), Math.max(X0, X1), W), ys = axis(Math.min(Y0, Y1), Math.max(Y0, Y1), H).reverse();
const centers = ys.flatMap(y => xs.map(x => [Math.round(x / 10) * 10, Math.round(y / 10) * 10]));
console.error(`${xs.length} 列 × ${ys.length} 行（每块 ${W.toFixed(0)} × ${H.toFixed(0)} 墨卡托单位）；首块：https://map.baidu.com/@${centers[0][0]},${centers[0][1]},${zoom}z`);
console.log(JSON.stringify(centers));
