import * as THREE from 'three';
import { V3, insertY, flatPoly, ribbon } from '../../../core/geom.js';
import { rng } from '../../../core/rng.js';
import { WATERS, LAKE, SHORES, OPEN_WATER, ZAOGANG_LABEL, BEITANG_LABEL } from '../layout.js';

const LOTUS_M = 0.3;    // 荷叶贴图每像素对应的米数

// 荷叶贴图：覆盖湖面外接矩形的画布。先铺满深浅不一的荷叶圆片和成片的明暗斑块，再只留湖面以内、
// 扣掉露水面的几处和岸边 2 m。返回 [贴图, 外接矩形]
function lotusTexture() {
  const rand = rng.texture;
  const xs = LAKE.map(p => p[0]), zs = LAKE.map(p => p[1]);
  const box = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  const W = Math.ceil((box.x1 - box.x0) / LOTUS_M), H = Math.ceil((box.z1 - box.z0) / LOTUS_M);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = ([x, z]) => [(x - box.x0) / LOTUS_M, (z - box.z0) / LOTUS_M];
  g.fillStyle = '#5d8a78'; g.fillRect(0, 0, W, H);
  // 成片的明暗：半径 6–30 m 的半透明斑块
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = rand() * H, r = (6 + rand() * 24) / LOTUS_M;
    g.fillStyle = rand() < 0.5 ? 'rgba(132,170,140,.3)' : 'rgba(58,96,86,.3)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // 荷叶：直径 0.6–1.6 m 的圆片，青绿色，偶有翻起的浅色叶背
  const n = Math.round(W * H / 9);
  for (let i = 0; i < n; i++) {
    const x = rand() * W, y = rand() * H, r = (0.3 + rand() * 0.5) / LOTUS_M, k = rand();
    g.fillStyle = k < 0.015 ? '#9dbb9f' : `hsl(${140 + rand() * 26}, ${22 + rand() * 14}%, ${38 + rand() * 12}%)`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const path = pts => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, ...px(p))); g.closePath(); };
  g.globalCompositeOperation = 'destination-in';
  path(LAKE); g.fillStyle = '#000'; g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 4 / LOTUS_M; g.lineJoin = 'round'; path(LAKE); g.stroke();
  for (const o of OPEN_WATER) { path(o); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return [t, box];
}

// 水面：世茂香槟湖、北塘河、澡港河各段、沙盘边上的河与水池（矢量图轮廓），沿岸一圈 12 m 岸坡；湖面满铺荷叶。
// 返回岸线（行道树要用）。水面不在避让表里，trees.js 末尾直接剔除水里的树点
export function buildWater(ctx) {
  const { world, M, water } = ctx;
  for (const s of SHORES) world.add(Object.assign(new THREE.Mesh(ribbon(s, 12, 0.45), M.bank), { receiveShadow: true }));
  for (const w of WATERS) world.add(Object.assign(flatPoly(w, 0.6, water), { receiveShadow: true }));
  ctx.place('澡港河', V3(...insertY(ZAOGANG_LABEL, 2)));
  ctx.place('北塘河', V3(...insertY(BEITANG_LABEL, 2)));

  const [map, box] = lotusTexture();
  const lotus = flatPoly(LAKE, 0.66, new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.85 }));
  const uv = lotus.geometry.attributes.uv;
  // ShapeGeometry 的 uv 为形状坐标 (x, −z)，换成外接矩形内的归一化坐标（画布第 0 行在 v = 1）
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - box.x0) / (box.x1 - box.x0), 1 - (-uv.getY(i) - box.z0) / (box.z1 - box.z0));
  world.add(lotus);
  return { shores: SHORES };
}
