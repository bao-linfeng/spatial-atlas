import * as THREE from 'three';
import { V3, insertY, smooth, densify, ribbon, flatPoly, offsetLine } from '../../../core/geom.js';
import { signTexture } from '../../../core/textures.js';
import { makeBlock, roofKit, placeBuilding, tower } from '../../../core/kit/buildings.js';
import {
  P, G, PX, GRID_ANGLE, BOUNDARY, PARK_ROADS, NORTH_ROADS, SOUTH_GATE, TOWERS, PLAZA, CLUB, VILLAS,
} from '../layout.js';

// 中轴景观带范围（网格坐标）
const AXIS = { u0: 8, u1: 58, v0: -53, v1: 345 };

// 园区内部：地块绿地、内部路网、中轴景观带、南入口、塔楼、下沉式商业广场、会所、风车式独栋
export function buildCampus(ctx) {
  const { M, water, roadMats, rand } = ctx;
  const park = ctx.addGroup('park');
  park.add(flatPoly(BOUNDARY, 0.4, M.paving));

  const gRect = (u0, v0, u1, v1) => [G(u0, v0), G(u1, v0), G(u1, v1), G(u0, v1)];
  // 地块绿地
  const greens = [
    [-286, -45, 15, 280], [59, -45, 193, 124], [59, 136, 193, 280], [207, -45, 315, 124], [207, 136, 315, 280],
  ];
  greens.forEach(r => park.add(flatPoly(gRect(...r), 0.55, M.lawn)));
  park.add(flatPoly([[850, 330], [872, 222], [1000, 248], [1100, 218], [1262, 348], [1282, 436], [1005, 497], [905, 470], [868, 420]].map(p => P(...p)), 0.55, M.lawn));
  park.add(flatPoly([[700, 440], [850, 418], [905, 500], [700, 560]].map(p => P(...p)), 0.55, M.lawnLight));

  // 内部道路
  for (const r of PARK_ROADS) {
    const pts = densify(r.pts, 8);
    const w = r.w;
    park.add(Object.assign(new THREE.Mesh(ribbon(pts, w, 0.75, 18), roadMats.park), { receiveShadow: true }));
    ctx.blockRoad(pts, w);
    ctx.carPaths.push({ pts, y: 0.8, dir: rand() < 0.5 ? 1 : -1, speed: 5, count: 2, offset: 1.6 });
    for (let s = 0; s < pts.length; s += 3) ctx.lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + 1.5)[s], 4.5)));
  }
  for (const r of NORTH_ROADS) {
    const pts = smooth(r.pts, 6);
    const w = r.w;
    park.add(Object.assign(new THREE.Mesh(ribbon(pts, w, 0.74, 18), roadMats.park), { receiveShadow: true }));
    ctx.blockRoad(pts, w);
    for (let s = 0; s < pts.length; s += 5) ctx.lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + 1.5)[s], 4.5)));
  }
  ctx.carPaths.push({ pts: smooth(NORTH_ROADS[0].pts, 6), y: 0.8, dir: 1, speed: 5, count: 3, offset: 1.6 });

  // 中轴景观带：草坪 + 水渠 + 两侧铺装
  {
    // 照片：中轴为宽铺装广场，中间带状绿篱与水渠，两侧行道树
    park.add(flatPoly(gRect(AXIS.u0, AXIS.v0, AXIS.u1, AXIS.v1 - 22), 0.8, M.pavingDark));
    park.add(flatPoly(gRect(24, AXIS.v0 + 12, 42, AXIS.v1 - 90), 0.86, M.lawnLight));
    park.add(flatPoly(gRect(30, AXIS.v0 + 24, 36, AXIS.v1 - 110), 0.92, water));
    for (let v = AXIS.v0 + 16; v < AXIS.v1 - 60; v += 16) {
      for (const u of [AXIS.u0 + 3, AXIS.u1 - 3]) ctx.treeSpots.push({ p: G(u, v), s: 0.9, kind: 1, force: true });
    }
    // 白色弧形步道（正射航拍可见）
    const walk = smooth([G(20, 190), G(14, 232), G(26, 268), G(50, 286), G(56, 312)], 3);
    park.add(Object.assign(new THREE.Mesh(ribbon(walk, 3.2, 0.95), M.white), { receiveShadow: true }));
    ctx.blockers.rects.push({ c: G((AXIS.u0 + AXIS.u1) / 2, (AXIS.v0 + AXIS.v1) / 2), w: (AXIS.u1 - AXIS.u0 - 8) * PX, d: (AXIS.v1 - AXIS.v0) * PX, a: GRID_ANGLE });
    ctx.place('中轴景观带', V3(...insertY(G(37, 110), 4)));
  }
  // 南入口广场 + 喷泉 + 门头
  {
    const [gx, gz] = SOUTH_GATE;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(15, 48), M.pavingDark);
    disk.rotation.x = -Math.PI / 2; disk.position.set(gx, 0.85, gz); park.add(disk);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, 40), water);
    pool.position.set(gx, 0.9, gz); park.add(pool);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7, 0.35, 8, 48), M.white);
    rim.rotation.x = -Math.PI / 2; rim.position.set(gx, 1.2, gz); park.add(rim);
    // 环形不锈钢雕塑（中轴航拍可见）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.45, 16, 64, Math.PI * 1.75),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 0.9, emissive: 0x9fd6ff, emissiveIntensity: 0 }));
    ring.position.set(gx, 4.2, gz); ring.rotation.set(0, GRID_ANGLE + 0.5, 0.35); park.add(ring);
    ctx.night(ring.material, 1.5);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 1, 24), M.white);
    plinth.position.set(gx, 1.4, gz); park.add(plinth);
    // 门头：两片白墙 + 标识
    const [sx, sz] = G(40, 352);
    const gate = new THREE.Group(); gate.position.set(sx, 0, sz); gate.rotation.y = GRID_ANGLE; park.add(gate);
    for (const o of [-16, 16]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1.2), M.white);
      wall.position.set(o, 2.5, 0); wall.castShadow = true; gate.add(wall);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture(ctx.sign), transparent: true }));
    sign.position.set(16, 3, 0.62); gate.add(sign);
    ctx.place('南入口', V3(sx, 8, sz));
  }


  // 高层 / 多层
  for (const t of TOWERS) tower(ctx, t, t.pos);

  // 下沉式商业广场
  {
    const [cx, cz] = PLAZA.pos;
    const root = new THREE.Group(); root.position.set(cx, 0, cz); root.rotation.y = GRID_ANGLE;
    const grow = new THREE.Group(); root.add(grow); park.add(root);
    const rec = { id: 'P', name: PLAZA.name, f: 2, w: PLAZA.rx * 2, d: PLAZA.rz * 2, info: '园区北部核心，下沉庭院与高层裙房结合，形成全天候城市活力空间。卫星图上为椭圆形白色环状屋面。' };
    root.userData = { rec, grow }; ctx.buildings.push(root);
    const ring = (rx, rz, ix, iz) => {
      const s = new THREE.Shape(); s.absellipse(0, 0, rx, rz, 0, Math.PI * 2);
      const h = new THREE.Path(); h.absellipse(0, 0, ix, iz, 0, Math.PI * 2, true); s.holes.push(h);
      return s;
    };
    const ext = (shape, depth, mat, y) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); m.position.y = y; m.castShadow = m.receiveShadow = true;
      grow.add(m); return m;
    };
    const glassRing = ext(ring(PLAZA.rx - 2, PLAZA.rz - 2, PLAZA.rx - 13, PLAZA.rz - 12), 6.5, M.glass, 0);
    const roofRing = ext(ring(PLAZA.rx + 1, PLAZA.rz + 1, PLAZA.rx - 15, PLAZA.rz - 14), 1.2, M.canopy, 6.5);
    ctx.pickables.push(glassRing, roofRing); glassRing.userData.bld = roofRing.userData.bld = root;
    // 下沉庭院台阶
    const steps = [[0.86, 0xd8d6cd], [0.72, 0xcac8bf], [0.58, 0xbdbbb2], [0.4, 0xa38f74]];
    steps.forEach(([k, c], i) => {
      const e = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
      e.scale.set((PLAZA.rx - 13) * k, (PLAZA.rz - 12) * k, 1);
      e.rotation.x = -Math.PI / 2; e.position.y = 0.6 + i * 0.06; grow.add(e);
    });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) ctx.treeSpots.push({ p: [cx + Math.cos(a) * (PLAZA.rx + 7), cz + Math.sin(a) * (PLAZA.rz + 7)], s: 0.9, kind: 1 });
    ctx.blockers.rects.push({ c: [cx, cz], w: PLAZA.rx * 2 + 6, d: PLAZA.rz * 2 + 6, a: GRID_ANGLE });
    root.userData.height = 8;
    ctx.labels.push({ text: 'P', sub: PLAZA.name, kind: 'building', bld: root, pos: V3(cx, 18, cz) });
  }

  // 会所
  {
    const at = CLUB.pos;
    const rec = { id: 'Q', name: CLUB.name, ...CLUB, info: '设计说明中会所位于园区南侧，靠近中轴与南入口。' };
    const { root, grow } = placeBuilding(ctx, rec, at);
    const body = new THREE.Mesh(new THREE.BoxGeometry(CLUB.w - 4, 8, CLUB.d - 4), M.glass);
    body.position.y = 4; body.castShadow = true; grow.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(CLUB.w + 2, 1, CLUB.d + 4), M.white);
    lid.position.y = 8.5; lid.castShadow = true; grow.add(lid);
    ctx.pickables.push(body, lid); body.userData.bld = lid.userData.bld = root;
    root.userData.height = 9;
  }

  // 风车式花园独栋
  VILLAS.forEach((v, i) => {
    const at = v.pos;
    const rec = { ...v, name: `花园独栋 ${v.id}`, style: 'villa',
      info: `${v.f} 层花园独栋办公，四合院式布局、风车式错位排布。资料显示独栋面积约 1688–1848㎡。` };
    const { root, grow } = placeBuilding(ctx, rec, at);
    const fh = 3.9;
    // 主体 + 侧翼形成 L 形合院
    const mainW = v.w * 0.64, wingW = v.w - mainW;
    const a = makeBlock(ctx, { w: mainW, d: v.d, f: v.f, style: mainW >= v.d ? 'villa' : 'villaEnd', sideStyle: mainW >= v.d ? 'villaEnd' : 'villa', floorH: fh });
    a.mesh.position.x = -v.w / 2 + mainW / 2;
    const wingF = Math.max(2, v.f - (v.court ? 2 : 1));
    const wingD = v.d * (v.court ? 0.55 : 0.8);
    const b = makeBlock(ctx, { w: wingW, d: wingD, f: wingF, style: 'villaEnd', sideStyle: 'villa', floorH: fh });
    b.mesh.position.set(v.w / 2 - wingW / 2, 0, -v.d / 2 + wingD / 2);
    grow.add(a.mesh, b.mesh);
    ctx.pickables.push(a.mesh, b.mesh); a.mesh.userData.bld = b.mesh.userData.bld = root;
    const ga = new THREE.Group(); ga.position.x = a.mesh.position.x; grow.add(ga);
    roofKit(ctx, ga, mainW, v.d, a.H);
    const gb = new THREE.Group(); gb.position.copy(b.mesh.position); grow.add(gb);
    roofKit(ctx, gb, wingW, wingD, b.H, { parapet: true });
    // 首层玻璃
    const lob = new THREE.Mesh(new THREE.BoxGeometry(mainW + 0.3, 3.4, v.d + 0.3), M.glass);
    lob.position.set(a.mesh.position.x, 1.7, 0); grow.add(lob);
    // 庭院小树
    const [cx, cz] = [at[0], at[1]];
    const off = [v.w / 2 - wingW / 2, v.d / 2 - (v.d - wingD) / 2];
    const ca = Math.cos(GRID_ANGLE), sa = Math.sin(GRID_ANGLE);
    ctx.treeSpots.push({ p: [cx + off[0] * ca + off[1] * sa, cz - off[0] * sa + off[1] * ca], s: 0.65, kind: 1, force: true });
    root.userData.height = a.H;
  });
}
