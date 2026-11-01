import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.js';
import { facadeMaterials } from '../../../core/textures.js';
import { inside } from './prism.js';

// 屋面：卫星图（docs/park-20m-sat.png）上高层、多层的平屋面为暖灰色地砖，四周一圈浅色女儿墙，中部有出屋面机房和零散设备。
// 随机细节用按轮廓派生的独立种子，不消耗 core/rng 的任何分流。
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const seedOf = (poly, y) => mulberry32(hash(`${poly[0][0].toFixed(1)},${poly[0][1].toFixed(1)},${y.toFixed(1)}`));

// 地砖贴图：一张 20 m × 20 m（roofGeometry 的 UV 以 10 m 为 1，repeat 取 0.5），2.5 m 一块，逐块明度抖动 + 浅缝。
// 场景光照会把浅色明显提亮，底色按大数据园 roofs.js 的做法压暗；颜色烘进贴图、材质为白色，登记到 facadeMaterials 随白模切换
const ROOF = { high: '#aaa49d', mid: '#a7a09a' };
const cache = new Map();
export function roofMaterial(kind = 'mid') {
  if (cache.has(kind)) return cache.get(kind);
  const N = 256, step = 32, rand = mulberry32(hash(`roof|${kind}`));
  const base = new THREE.Color(ROOF[kind]).offsetHSL(0, 0.06, -0.07);
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
    g.fillStyle = `#${base.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.035).getHexString()}`;
    g.fillRect(x, y, step, step);
  }
  g.fillStyle = 'rgba(0,0,0,.08)';
  for (let k = 0; k < N; k += step) { g.fillRect(k, 0, 1, N); g.fillRect(0, k, N, 1); }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(0.5, 0.5);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  facadeMaterials.push(mat);
  cache.set(kind, mat);
  return mat;
}

// 女儿墙：沿轮廓 y 到 y + h 的双面薄墙（内外各一层三角形），skip(i) 为真的边不建（与同高楼块相接的切缝）
function parapet(poly, y, h, skip) {
  const pos = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (skip?.(i) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
    const A0 = [a[0], y, a[1]], B0 = [b[0], y, b[1]], A1 = [a[0], y + h, a[1]], B1 = [b[0], y + h, b[1]];
    pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1, ...A0, ...B1, ...B0, ...A0, ...A1, ...B1);
  });
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// 轮廓的定向外接矩形（沿最长边）：u / v 为轴向，c 为中心，lu / lv 为边长
function frame(poly) {
  let u = [1, 0], best = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  });
  const v = [-u[1], u[0]];
  const pu = poly.map(p => p[0] * u[0] + p[1] * u[1]), pv = poly.map(p => p[0] * v[0] + p[1] * v[1]);
  const u0 = Math.min(...pu), u1 = Math.max(...pu), v0 = Math.min(...pv), v1 = Math.max(...pv);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { u, v, lu: u1 - u0, lv: v1 - v0, at: (du, dv) => [u[0] * (cu + du) + v[0] * (cv + dv), u[1] * (cu + du) + v[1] * (cv + dv)] };
}

// 沿 u / v 摆放的盒子（局部偏移 du、dv），四角都在轮廓内才返回几何体
function boxIn(poly, f, du, dv, w, d, y, h) {
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (!inside(f.at(du + su * w / 2, dv + sv * d / 2), poly)) return null;
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateY(Math.atan2(-f.u[1], f.u[0]));
  const [x, z] = f.at(du, dv);
  g.translate(x, y + h / 2, z);
  return g;
}

// 屋面构件，几何体按材质收进 out：white 女儿墙与机房，dark 设备箱。
// parapet 女儿墙高 m（0 不建），skip 见 parapet()；core 出屋面机房（楼梯间、电梯机房）；gear 设备箱个数
export function roofKit(poly, y, { parapet: ph = 1.2, skip, core = false, gear = 0 } = {}, out = { white: [], dark: [] }) {
  const rand = seedOf(poly, y), f = frame(poly);
  if (ph) { const g = parapet(poly, y, ph, skip); if (g) out.white.push(g); }
  let room = null;
  if (core) {
    const w = THREE.MathUtils.clamp(f.lu * 0.32, 5, 22), d = THREE.MathUtils.clamp(f.lv * 0.42, 4, 12), h = 3.6 + rand() * 1.4;
    const du = (rand() - 0.5) * f.lu * 0.12, dv = (rand() - 0.5) * f.lv * 0.12;
    for (const k of [1, 0.75, 0.55]) {
      const g = boxIn(poly, f, du * k, dv * k, w * k, d * k, y, h);
      if (g) { out.white.push(g); room = { du: du * k, dv: dv * k, w: w * k + 3, d: d * k + 3 }; break; }
    }
  }
  for (let i = 0, tries = 0; i < gear && tries < gear * 6; tries++) {
    const w = 1.5 + rand() * 2.5, d = 1.2 + rand() * 1.6, h = 0.9 + rand() * 0.9;
    const du = (rand() - 0.5) * (f.lu - w - 3), dv = (rand() - 0.5) * (f.lv - d - 3);
    if (room && Math.abs(du - room.du) < (room.w + w) / 2 && Math.abs(dv - room.dv) < (room.d + d) / 2) continue;
    const g = boxIn(poly, f, du, dv, w, d, y, h);
    if (g) { out.dark.push(g); i++; }
  }
  return out;
}

// 同高楼块相接的边（百度楼栋跨瓦片被切开）：返回 blocks[k] 的 skip(i)。blocks 为 [{ poly, h }]
export function seams(blocks) {
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = THREE.MathUtils.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2, 0, 1);
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]) < 0.4;
  };
  const box = blocks.map(({ poly }) => {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    return [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1];
  });
  return blocks.map((A, k) => {
    const others = blocks.filter((B, j) => j !== k && Math.abs(B.h - A.h) < 0.5 &&
      box[j][0] < box[k][1] && box[k][0] < box[j][1] && box[j][2] < box[k][3] && box[k][2] < box[j][3]);
    if (!others.length) return null;
    const cut = A.poly.map((a, i) => {
      const b = A.poly[(i + 1) % A.poly.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return others.some(B => B.poly.some((c, j) => near(m, c, B.poly[(j + 1) % B.poly.length])));
    });
    return cut.some(Boolean) ? i => cut[i] : null;
  });
}
