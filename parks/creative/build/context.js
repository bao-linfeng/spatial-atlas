import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, insertY } from '../../../core/geom.js';
import { facadeMaterial } from '../../../core/textures.js';
import { TILE_W, wallGeometry, roofGeometry } from './prism.js';
import { CONTEXT_BUILDINGS, PLACES } from '../layout.js';

const HOUSE_H = 9.6;   // 低于 8 m 的百度默认高度按 3 层（3.2 m / 层）取

// 周边：百度楼栋轮廓逐栋挤出。别墅与低层为浅灰竖窗墙 + 陶红屋面，多层、高层为浅色方窗墙 + 平屋面；
// 同类合并成一个网格（周边约 150 栋，不参与点选）
export function buildContext(ctx) {
  const { M } = ctx;
  const context = ctx.addGroup('context');
  const tile = new THREE.MeshStandardMaterial({ color: 0xb9725a, roughness: 0.85 });
  const groups = { house: { walls: [], roofs: [] }, mid: { walls: [], roofs: [] }, high: { walls: [], roofs: [] } };
  for (const b of CONTEXT_BUILDINGS) {
    const h = b.house ? HOUSE_H : b.h;
    const g = groups[b.house ? 'house' : h >= 36 ? 'high' : 'mid'];
    g.walls.push(wallGeometry(b.poly, 0, h, 3.2));
    g.roofs.push(roofGeometry(b.poly, h));
    const xs = b.poly.map(p => p[0]), zs = b.poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    ctx.blockers.rects.push({ c: [(x0 + x1) / 2, (z0 + z1) / 2], w: x1 - x0 + 3, d: z1 - z0 + 3, a: 0 });
  }
  const mats = { house: [facadeMaterial('slab', TILE_W, 8), tile], mid: [facadeMaterial('slab', TILE_W, 8), M.roof], high: [facadeMaterial('punch', TILE_W, 8), M.roof] };
  for (const [k, g] of Object.entries(groups)) {
    if (!g.walls.length) continue;
    for (const [geos, mat] of [[g.walls, mats[k][0]], [g.roofs, mats[k][1]]]) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = m.receiveShadow = true;
      context.add(m);
    }
  }
  for (const p of PLACES) ctx.place(p.text, V3(...insertY(p.pos, 22)));
}
