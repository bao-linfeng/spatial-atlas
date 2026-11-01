import * as THREE from 'three';
import { shapeFrom } from '../../../core/geom.js';
import { BAY_M } from '../../../core/textures.js';

// 任意多边形棱柱（百度楼栋轮廓挤出）。立面贴图一张 = 8 开间 × 8 层，用 facadeMaterial(style, TILE_W, 8) 取 repeat 为 1 的材质，
// 外墙 UV 按周长与高度换算：u = 周长 / TILE_W，v = 高度 / (8 × floorH)
export const TILE_W = BAY_M * 8;

const signedArea = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

// 外墙（不含顶底）：poly 为场景米 [[x, z]]，y0–y1 为墙的上下沿
export function wallGeometry(poly, y0, y1, floorH) {
  const pts = signedArea(poly) > 0 ? [...poly].reverse() : poly;    // 统一绕向，使法向朝外
  const pos = [], uv = [];
  const v0 = y0 / (8 * floorH), v1 = y1 / (8 * floorH);
  let acc = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) return;
    const u0 = acc / TILE_W, u1 = (acc + len) / TILE_W;
    acc += len;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 平屋面：y 高度处的水平多边形（UV 按 10 m 一个周期）
export function roofGeometry(poly, y) {
  const g = new THREE.ShapeGeometry(shapeFrom(poly));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 10, p.getZ(i) / 10);
  return g;
}

// 半平面裁切：保留 (p − o)·n ≥ 0 的部分
function clipHalf(poly, o, n) {
  const side = p => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + poly.length - 1) % poly.length], sp = side(p), sq = side(q);
    if (sp >= 0) {
      if (sq < 0) { const t = sq / (sq - sp); out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]); }
      out.push(p);
    } else if (sq >= 0) { const t = sq / (sq - sp); out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]); }
  });
  return out;
}

// 退台：沿 dir（指向高端的单位向量）把多边形切成 n 条，第 k 条高 h0 + (h1 − h0)·(k + 1) / n。返回 [{ poly, h }]
export function steps(poly, dir, n, h0, h1) {
  const proj = poly.map(p => p[0] * dir[0] + p[1] * dir[1]);
  const lo = Math.min(...proj), hi = Math.max(...proj), w = (hi - lo) / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = lo + w * k, b = a + w;
    let s = clipHalf(poly, [dir[0] * a, dir[1] * a], dir);
    s = clipHalf(s, [dir[0] * b, dir[1] * b], [-dir[0], -dir[1]]);
    if (s.length >= 3 && Math.abs(signedArea(s)) > 1) out.push({ poly: s, h: h0 + (h1 - h0) * (k + 1) / n });
  }
  return out;
}
