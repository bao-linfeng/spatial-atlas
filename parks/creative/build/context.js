import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, insertY } from '../../../core/geom.js';
import { facadeMaterial } from '../../../core/textures.js';
import { TILE_W, wallGeometry, roofGeometry } from './prism.js';
import { roofMaterial, roofKit, seams } from './roofs.js';
import { CONTEXT_BUILDINGS, PLACES } from '../layout.js';

const HOUSE_H = 9.6;   // 低于 8 m 的百度默认高度按 3 层（3.2 m / 层）取

// 周边：百度楼栋轮廓逐栋挤出。别墅与低层为浅灰竖窗墙 + 陶红屋面，多层、高层为浅色方窗墙 + 地砖平屋面，
// 屋面加女儿墙与设备箱，高层另加出屋面机房（同高楼块相接的切缝不建女儿墙）；
// 同类合并成一个网格（周边约 150 栋，不参与点选）
export function buildContext(ctx) {
  const { M } = ctx;
  const context = ctx.addGroup('context');
  const tile = new THREE.MeshStandardMaterial({ color: 0xb9725a, roughness: 0.85 });
  const groups = {};
  for (const k of ['house', 'mid', 'high']) groups[k] = { walls: [], roofs: [], white: [], dark: [] };
  const skips = seams(CONTEXT_BUILDINGS.map(b => ({ poly: b.poly, h: b.house ? HOUSE_H : b.h })));
  CONTEXT_BUILDINGS.forEach((b, i) => {
    const h = b.house ? HOUSE_H : b.h, kind = b.house ? 'house' : h >= 36 ? 'high' : 'mid';
    const g = groups[kind];
    g.walls.push(wallGeometry(b.poly, 0, h, 3.2));
    g.roofs.push(roofGeometry(b.poly, h));
    if (kind === 'high') roofKit(b.poly, h, { skip: skips[i], core: true, gear: 3 }, g);
    if (kind === 'mid') roofKit(b.poly, h, { parapet: 0.9, skip: skips[i], gear: 2 }, g);
    const xs = b.poly.map(p => p[0]), zs = b.poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    ctx.blockers.rects.push({ c: [(x0 + x1) / 2, (z0 + z1) / 2], w: x1 - x0 + 3, d: z1 - z0 + 3, a: 0 });
  });
  const mats = { house: [facadeMaterial('slab', TILE_W, 8), tile], mid: [facadeMaterial('slab', TILE_W, 8), roofMaterial('mid')], high: [facadeMaterial('punch', TILE_W, 8), roofMaterial('high')] };
  for (const [k, g] of Object.entries(groups)) {
    if (!g.walls.length) continue;
    for (const [geos, mat] of [[g.walls, mats[k][0]], [g.roofs, mats[k][1]], [g.white, M.white], [g.dark, M.roofDark]]) {
      if (!geos.length) continue;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = m.receiveShadow = true;
      context.add(m);
    }
  }
  for (const p of PLACES) ctx.place(p.text, V3(...insertY(p.pos, 22)));
}
