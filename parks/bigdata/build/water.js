import * as THREE from 'three';
import { V3, insertY, smooth, ribbon, shapeFrom, offsetLine, distToPolyline } from '../../../core/geom.js';
import { buildRivers } from '../../../core/kit/ground.js';
import { CANAL, CANAL_W, BAIHE, BAIHE_W } from '../layout.js';

// 运河下沉：水面低于地面，驳岸为石砌直墙，玉新桥的桥墩才露得出来
export const CANAL_Y = -4.2;
const canalLine = () => smooth(CANAL, 6);

// 多边形按矩形裁切（Sutherland–Hodgman）
function clipRect(poly, { x0, x1, z0, z1 }) {
  const edges = [[p => p[0] >= x0, (a, b) => cut(a, b, 0, x0)], [p => p[0] <= x1, (a, b) => cut(a, b, 0, x1)],
    [p => p[1] >= z0, (a, b) => cut(a, b, 1, z0)], [p => p[1] <= z1, (a, b) => cut(a, b, 1, z1)]];
  function cut(a, b, k, v) { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  let out = poly;
  for (const [inside, hit] of edges) {
    const src = out; out = [];
    src.forEach((p, i) => {
      const q = src[(i + src.length - 1) % src.length];
      if (inside(p)) { if (!inside(q)) out.push(hit(q, p)); out.push(p); } else if (inside(q)) out.push(hit(q, p));
    });
  }
  return out;
}

// 底座开洞的多边形（运河水面范围，内缩到沙盘边缘以内 0.5 m），供 park.ground.holes 使用
export function canalHole(plate) {
  const c = canalLine();
  const band = [...offsetLine(c, -CANAL_W / 2), ...offsetLine(c, CANAL_W / 2).reverse()];
  return clipRect(band, { x0: plate.x0 + 0.5, x1: plate.x1 - 0.5, z0: plate.z0 + 0.5, z1: plate.z1 - 0.5 });
}

// 京杭运河（下沉水面、驳岸、压顶与南岸步道）与白鹤河。返回河道中线（行道树、桥梁要用）。
export function buildWater(ctx) {
  const { world, M, water, blockers } = ctx;
  const canal = canalLine();
  const hole = canalHole(ctx.plate);
  // 水面：UV 按 60 m 一个周期，与其他河道的贴图尺度一致
  const g = new THREE.ShapeGeometry(shapeFrom(hole)); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 60, uv.getY(i) / 60);
  const wm = new THREE.Mesh(g, water); wm.position.y = CANAL_Y; wm.receiveShadow = true; world.add(wm);
  // 驳岸：沿洞口一周的直墙
  const stone = new THREE.MeshStandardMaterial({ color: 0xb4ae9f, roughness: 0.95, side: THREE.DoubleSide });
  const pos = [];
  hole.forEach((a, i) => {
    const b = hole[(i + 1) % hole.length], lo = CANAL_Y - 0.3, hi = 0.02;
    pos.push(a[0], lo, a[1], b[0], lo, b[1], b[0], hi, b[1], a[0], lo, a[1], b[0], hi, b[1], a[0], hi, a[1]);
  });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.computeVertexNormals();
  world.add(Object.assign(new THREE.Mesh(wg, stone), { receiveShadow: true }));
  // 压顶石与南岸亲水步道（只取沙盘内的部分）
  const inside = p => ctx.inPlate(p[0], p[1], 1);
  const coping = new THREE.MeshStandardMaterial({ color: 0xd6d1c4, roughness: 0.9 });
  for (const s of [-1, 1]) world.add(Object.assign(new THREE.Mesh(ribbon(offsetLine(canal, s * (CANAL_W / 2 + 0.8)).filter(inside), 1.6, 0.5), coping), { receiveShadow: true }));
  world.add(Object.assign(new THREE.Mesh(ribbon(offsetLine(canal, CANAL_W / 2 + 4).filter(inside), 5, 0.46, 18), M.paving), { receiveShadow: true }));
  blockers.water.push({ pts: canal, hw: CANAL_W / 2 + 7 });
  ctx.place('京杭运河', V3(...insertY(canal[Math.floor(canal.length * 0.3)], 2)));

  // 白鹤河：汇入运河处截到南岸为止
  const baihe = smooth(BAIHE, 6).filter(p => distToPolyline(p[0], p[1], canal) > CANAL_W / 2 + 1);
  buildRivers(ctx, [[baihe, BAIHE_W]]);
  ctx.place('白鹤河', V3(...insertY(baihe[Math.floor(baihe.length * 0.42)], 2)));
  return { canal, baihe };
}
