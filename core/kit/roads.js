import * as THREE from 'three';
import { V3, sub2, len2, insertY, smoothstep, ribbon, offsetLine, distToPolyline } from '../geom.js';

// 地面道路：路面 + 两侧人行道（略低、略宽，形成路缘）。
// 未指定 y 时按登记顺序错开高度，避免交叉口闪烁。lanes：[[横向偏移 m, 方向 ±1], ...]；lamp：路灯间距 m（0 不设）
export function groundRoad(ctx, pts, w, { y, mat = ctx.roadMats.city, walk = 2.5, lanes = [], speed = 9, count = 3, lamp = 0, offset } = {}) {
  const { world, M, rand } = ctx;
  const yy = y ?? 0.76 + (ctx.roadRank++ % 6) * 0.006;
  if (walk) world.add(Object.assign(new THREE.Mesh(ribbon(pts, w + walk * 2, 0.68, 18), M.sidewalk), { receiveShadow: true }));
  world.add(Object.assign(new THREE.Mesh(ribbon(pts, w, yy, 30), mat), { receiveShadow: true }));
  ctx.blockRoad(pts, w + walk * 2);
  for (const [o, dir] of lanes) ctx.carPaths.push({ pts: offsetLine(pts, o), y: yy + 0.05, dir, speed: speed * (0.85 + rand() * 0.3), count, offset });
  if (lamp) for (let i = 0, acc = 0; i < pts.length; i++) {
    if (i) acc += len2(sub2(pts[i], pts[i - 1]));
    if (acc >= lamp) { acc = 0; ctx.lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + walk * 0.6)[i], 7))); }
  }
  return yy;
}

// ── 高架构造：低于 SOLID 为挡墙填土段（实心落地），以上为桥梁段（桥面 + 桥墩 + 防撞墙）──
const SOLID = 5;
function wallGeo(pts, off, bot, top, keep) {
  const pos = [], edge = offsetLine(pts, off);
  for (let i = 1; i < pts.length; i++) {
    if (!keep(i - 1) || !keep(i)) continue;
    const a = edge[i - 1], b = edge[i];
    pos.push(a[0], bot[i - 1], a[1], b[0], bot[i], b[1], b[0], top[i], b[1],
      a[0], bot[i - 1], a[1], b[0], top[i], b[1], a[0], top[i - 1], a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// 逐点高程的高架 / 匝道：ys 为每个点的路面高度。
// keep(p)：该处侧墙是否保留（与主线桥面重叠段不设）；护栏全程设置，仅在起点 25 m 内渐出
export function elevatedRoad(ctx, line, w, ys, keep = () => true) {
  const { world, M, roadMats, blockers } = ctx;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len2(sub2(line[i], line[i - 1])));
  const bots = ys.map(y => (y < SOLID ? 0.05 : y - 1.6));
  const tops = ys.map((y, i) => y + 0.9 * smoothstep(0, 25, cum[i]));
  world.add(Object.assign(new THREE.Mesh(ribbon(line, w, ys, 30), roadMats.elevated), { receiveShadow: true }));
  world.add(new THREE.Mesh(ribbon(line, w, bots, 30, true), M.concrete));
  for (const side of [-1, 1]) {
    const edge = offsetLine(line, side * w / 2);
    const wall = new THREE.Mesh(wallGeo(line, side * w / 2, bots, tops, i => keep(edge[i])), M.parapet);
    wall.castShadow = true; world.add(wall);
  }
  // 桥墩：桥梁段约 24 m 一跨，落在路面上的跳过（由相邻墩跨越）
  for (let i = 1, acc = 99; i < line.length; i++) {
    acc += len2(sub2(line[i], line[i - 1]));
    if (acc < 24 || ys[i] < SOLID) continue;
    const [x, z] = line[i];
    if (blockers.roads.some(r => distToPolyline(x, z, r.pts) < r.hw - 1)) continue;
    acc = 0;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, bots[i], 10), M.concreteDark);
    p.position.set(x, bots[i] / 2, z); p.castShadow = true; world.add(p);
  }
  ctx.blockRoad(line, w + 4);
}
