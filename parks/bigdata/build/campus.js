import * as THREE from 'three';
import { V3, insertY, densify, ribbon, flatPoly, offsetLine } from '../../../core/geom.js';
import { makeBlock, roofKit, placeBuilding, tower } from '../../../core/kit/buildings.js';
import { roofMaterial, capMaterials } from './roofs.js';
import {
  P, GRID_ANGLE, PARK_LOT, PARK_ROADS, TOWERS, WEST_TOWERS, STUDIO, PODIUM, QINGSHANG, QINGSHANG_PLAZA, ANNEX, RETAIL,
} from '../layout.js';

const ORANGE = 0xe0602a;   // 楼顶标识 / 檐口橙色（航拍）

// 局部坐标 (x 沿 GRID_ANGLE，z 垂直) → 场景米
const local = ([cx, cz], x, z, a = GRID_ANGLE) => [cx + x * Math.cos(a) + z * Math.sin(a), cz - x * Math.sin(a) + z * Math.cos(a)];

// 白色方窗塔楼：core 的 tower() + 白色檐口（顶面贴卫星图配色的屋面）+ 楼顶一角的橙色标识牌
function whiteTower(ctx, t, orange) {
  const root = tower(ctx, { ...t, style: 'punch' }, t.pos);
  const H = root.userData.height, grow = root.userData.grow;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.6, 1.6, t.d + 0.6), capMaterials(ctx.M.white, roofMaterial('tower', t.w + 0.6, t.d + 0.6)));
  crown.position.y = H + 0.8; grow.add(crown);
  if (t.logo) {
    const logo = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.3, 2.6, 0.4), orange);
    logo.position.set(-t.w * 0.33, H - 2.2, t.d / 2 + 0.25); grow.add(logo);
  }
  return root;
}

// 普通体量建筑（裙房、商业、配套）：makeBlock + 平屋面贴图 + 屋面设备，登记为可点选
function block(ctx, rec, { style, floorH, lid = true, side } = {}) {
  const { root, grow } = placeBuilding(ctx, rec, rec.pos);
  const b = makeBlock(ctx, { ...rec, style, sideStyle: side || style, floorH });
  b.mesh.material[2] = roofMaterial('flat', rec.w, rec.d);
  grow.add(b.mesh); ctx.pickables.push(b.mesh); b.mesh.userData.bld = root;
  if (lid) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(rec.w + 1, 0.8, rec.d + 1), capMaterials(ctx.M.white, roofMaterial('flat', rec.w + 1, rec.d + 1)));
    l.position.y = b.H + 0.4; grow.add(l);
  }
  roofKit(ctx, grow, rec.w, rec.d, b.H, { parapet: false });
  root.userData.height = b.H;
  ctx.labels.push({ text: rec.id, sub: rec.name, kind: 'building', bld: root, pos: V3(rec.pos[0], b.H + 8, rec.pos[1]) });
  return { root, grow, H: b.H };
}

// 园区内部：地块铺装、内部道路与停车场、两栋白塔、文创楼、裙房、青商大厦、配套与商业；红线西侧三栋白塔
export function buildCampus(ctx) {
  const { M, roadMats, rand } = ctx;
  const park = ctx.addGroup('park');
  park.add(flatPoly(PARK_LOT, 0.4, M.paving));
  const orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.6, emissive: ORANGE, emissiveIntensity: 0 });
  ctx.night(orange, 0.6);

  // 停车场（卫星图：西北角大片停车、塔楼之间的地面车位）
  const lot = (c, w, d) => park.add(flatPoly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => local(c, x, z)), 0.5, M.pavingDark));
  lot(P(1010, 175), 46, 40);
  lot(P(1180, 240), 60, 16);
  lot(P(1300, 500), 18, 60);
  // 小块绿地
  const lawn = (c, w, d) => park.add(flatPoly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => local(c, x, z)), 0.55, M.lawn));
  lawn(P(1100, 470), 26, 18);
  lawn(P(1085, 520), 30, 12);
  lawn(P(1320, 380), 12, 30);

  // 内部道路
  for (const r of PARK_ROADS) {
    const pts = densify(r.pts, 6);
    park.add(Object.assign(new THREE.Mesh(ribbon(pts, r.w, 0.75, 18), roadMats.park), { receiveShadow: true }));
    ctx.blockRoad(pts, r.w);
    ctx.carPaths.push({ pts, y: 0.8, dir: rand() < 0.5 ? 1 : -1, speed: 5, count: 2, offset: 1.6 });
    for (let s = 0; s < pts.length; s += 4) ctx.lampSpots.push(V3(...insertY(offsetLine(pts, r.w / 2 + 1.5)[s], 4.5)));
  }

  // 两栋白塔（园区内）
  for (const t of TOWERS) whiteTower(ctx, t, orange);

  // 文创楼：北翼 + 西翼 5 层围合，东南为 2 层运动馆，屋顶球场
  {
    const s = STUDIO, { root, grow } = placeBuilding(ctx, s, s.pos);
    const wing = (w, d, f, x, z, style) => {
      const b = makeBlock(ctx, { w, d, f, style, sideStyle: style, floorH: 4 });
      b.mesh.material[2] = roofMaterial('flat', w, d);
      b.mesh.position.set(x, 0, z); grow.add(b.mesh); ctx.pickables.push(b.mesh); b.mesh.userData.bld = root;
      const g = new THREE.Group(); g.position.set(x, 0, z); grow.add(g); roofKit(ctx, g, w, d, b.H);
      return b.H;
    };
    const H = wing(s.w, 12, s.f, 0, -s.d / 2 + 6, 'slab');
    wing(12, s.d - 12, s.f, -s.w / 2 + 6, 6, 'slab');
    const hall = makeBlock(ctx, { w: s.w - 14, d: s.d - 14, f: 2, style: 'podium', floorH: 4.5 });
    hall.mesh.material[2] = roofMaterial('flat', s.w - 14, s.d - 14);
    hall.mesh.position.set(7, 0, 7); grow.add(hall.mesh); ctx.pickables.push(hall.mesh); hall.mesh.userData.bld = root;
    // 屋顶球场：蓝色篮球场、绿色网球场、红色跑道
    const court = (w, d, x, z, color, y = hall.H + 0.05) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); grow.add(m);
    };
    court(s.w - 15, s.d - 15, 7, 7, 0xb0574c);
    court(13, 22, 0, 7, 0x3f7ab8, hall.H + 0.08);
    court(12, 22, 14, 7, 0x4f9a6a, hall.H + 0.08);
    root.userData.height = H;
    ctx.labels.push({ text: s.id, sub: s.name, kind: 'building', bld: root, pos: V3(s.pos[0], H + 8, s.pos[1]) });
  }

  // 中部裙房、配套楼、南侧商业
  block(ctx, PODIUM, { style: 'podium', floorH: 4.5 });
  block(ctx, ANNEX, { style: 'slab', floorH: 4 });
  block(ctx, RETAIL, { style: 'podium', floorH: 5 });

  // 常州青商大厦：玻璃体量 + 橙色檐口，东南圆形广场
  {
    const { grow, H } = block(ctx, QINGSHANG, { style: 'podium', floorH: 4.2, lid: false });
    const { w, d } = QINGSHANG;
    for (const [x, z, lw, ld] of [[0, d / 2, w + 1, 1], [0, -d / 2, w + 1, 1], [w / 2, 0, 1, d + 1], [-w / 2, 0, 1, d + 1]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.4, ld), orange);
      c.position.set(x, H + 0.7, z); grow.add(c);
    }
    const [px, pz] = QINGSHANG_PLAZA.pos, r = QINGSHANG_PLAZA.r;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(r, 48), M.pavingDark);
    disk.rotation.x = -Math.PI / 2; disk.position.set(px, 0.6, pz); park.add(disk);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.45, r * 0.55, 48), M.white);
    ring.rotation.x = -Math.PI / 2; ring.position.set(px, 0.62, pz); park.add(ring);
    ctx.blockers.rects.push({ c: [px, pz], w: r * 2, d: r * 2, a: 0 });
  }

  // 红线西侧三栋白塔（常州数字经济产业园）
  for (const t of WEST_TOWERS) whiteTower(ctx, { ...t, logo: true }, orange);
}
