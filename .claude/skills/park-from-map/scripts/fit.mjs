// 控制点最小二乘拟合配准变换，打印参数与逐点残差（不依赖 numpy）。
// 用法：node fit.mjs [--affine] [--mpp 0.48] [--meta cap.json | --merc] u,v=x,y[=名称] ...
//   缺省：(u, v) 为某张截图自身像素（crop.html?raw 读数），(x, y) 为底图像素 P，拟合相似变换
//         x = a·u + b·v + c，y = −b·u + a·v + f，输出 reg.js 的 REG 数组 [a, b, c, −b, a, f]；
//         --affine 改为 6 参数仿射（截图有非等比缩放时，如浏览器缩放截的图；一般用不到）。
//   --meta cap.json：(u, v) 为 capture.mjs 普通地图截图（同名 .json 为元数据）里的设备像素，先换算为百度墨卡托，
//         再拟合墨卡托 → P，输出 reg.js 的 MERC = { a, b, c, f }（P.x = a·X − b·Y + c，P.y = −b·X − a·Y + f）。
//   --merc：(u, v) 已是百度墨卡托 (X, Y)，同上输出 MERC。
// --mpp：每 P 像素米数，残差另以米显示。控制点至少 3 个，宜分散在画面四角；残差 > 3 px 的点多半读错，剔除后重拟。
import { readFileSync } from 'node:fs';

const opt = {}, pairs = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--meta' || a === '--mpp') opt[a.slice(2)] = process.argv[++i];
  else if (a.startsWith('--')) opt[a.slice(2)] = true;
  else { const [uv, xy, name = ''] = a.split('='); pairs.push({ uv: uv.split(',').map(Number), xy: xy.split(',').map(Number), name }); }
}
if (pairs.length < 3) { console.error('至少 3 组控制点 u,v=x,y'); process.exit(1); }
const toMerc = !!(opt.meta || opt.merc);
const mpp = +(opt.mpp || 0);

let src = pairs.map(p => p.uv);
if (opt.meta) {
  // 设备像素 → 容器 css 像素 (u / dpr, v / dpr − top) → 墨卡托：每 css 像素 2^(18 − zoom) 单位，centerPx 处为 center，Y 向北
  const { center: [cx, cy], centerPx: [px, py], zoom, rect: [, top], dpr } = JSON.parse(readFileSync(opt.meta, 'utf8'));
  const r = 2 ** (18 - zoom);
  src = src.map(([u, v]) => [cx + (u / dpr - px) * r, cy - (v / dpr - top - py) * r]);
}
// 墨卡托 Y 向北、P 向南：以 (X, −Y) 作为输入，变换仍是不含镜像的相似变换
const uv = toMerc ? src.map(([X, Y]) => [X, -Y]) : src;
const xy = pairs.map(p => p.xy);
const n = uv.length, mean = a => [a.reduce((s, p) => s + p[0], 0) / n, a.reduce((s, p) => s + p[1], 0) / n];

let T;   // [a, b, c, d, e, f]：x = a·u + b·v + c，y = d·u + e·v + f
if (opt.affine && !toMerc) {
  const solve3 = (A, y) => {   // 3 × 3 正规方程
    const M = A.map((r, i) => [...r, y[i]]);
    for (let i = 0; i < 3; i++) {
      const k = M.slice(i).reduce((b, r, j) => Math.abs(r[i]) > Math.abs(M[b][i]) ? i + j : b, i);
      [M[i], M[k]] = [M[k], M[i]];
      for (let j = 0; j < 3; j++) if (j !== i) { const t = M[j][i] / M[i][i]; for (let q = i; q < 4; q++) M[j][q] -= t * M[i][q]; }
    }
    return M.map((r, i) => r[3] / r[i]);
  };
  const rows = uv.map(([u, v]) => [u, v, 1]);
  const ata = [0, 1, 2].map(i => [0, 1, 2].map(j => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const atb = k => [0, 1, 2].map(i => rows.reduce((s, r, q) => s + r[i] * xy[q][k], 0));
  const [a, b, c] = solve3(ata, atb(0)), [d, e, f] = solve3(ata, atb(1));
  T = [a, b, c, d, e, f];
} else {
  const [mu, mv] = mean(uv), [mx, my] = mean(xy);
  let S = 0, A = 0, B = 0;
  uv.forEach(([u, v], i) => {
    const du = u - mu, dv = v - mv, dx = xy[i][0] - mx, dy = xy[i][1] - my;
    S += du * du + dv * dv; A += dx * du + dy * dv; B += dx * dv - dy * du;
  });
  const a = A / S, b = B / S;
  T = [a, b, mx - a * mu - b * mv, -b, a, my + b * mu - a * mv];
}

const [a, b, c, d, e, f] = T;
let worst = 0;
console.log('残差（P 像素' + (mpp ? ' / 米' : '') + '）：');
uv.forEach(([u, v], i) => {
  const rx = a * u + b * v + c - xy[i][0], ry = d * u + e * v + f - xy[i][1], r = Math.hypot(rx, ry);
  worst = Math.max(worst, r);
  console.log(`  ${(pairs[i].name || '#' + i).padEnd(12)} dx ${rx.toFixed(2).padStart(7)}  dy ${ry.toFixed(2).padStart(7)}  |${r.toFixed(2)}|` + (mpp ? `  ${(r * mpp).toFixed(2)} m` : ''));
});
const scale = Math.hypot(a, d), rot = Math.atan2(-d, a) * 180 / Math.PI;
console.log(`最大残差 ${worst.toFixed(2)} px；缩放 ${scale.toFixed(6)}（每单位 P 像素），旋转 ${rot.toFixed(3)}°`);
if (toMerc) {
  console.log(`export const MERC = { a: ${a}, b: ${b}, c: ${c}, f: ${f} };`);
  if (mpp) console.log(`// 1 墨卡托单位 ≈ ${(mpp * scale).toFixed(4)} m（buildings.mjs 的 M_PER_MERC）`);
} else console.log(`[${T.map(x => +x.toFixed(6)).join(', ')}]`);
