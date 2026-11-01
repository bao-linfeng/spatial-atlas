import * as THREE from 'three';
import { V3 } from '../geom.js';
import { facadeMaterial, signTexture, solarTexture, FLOOR_M } from '../textures.js';

// 建筑数据 rec：{ id, name, info?, style, sideStyle?, w, d（米）, f（层数） }

// 立方体体量：正面 / 侧面各用一种立面风格，按开间数和层数重复贴图
export function makeBlock(ctx, { w, d, f, style, sideStyle = style, floorH = FLOOR_M }) {
  const H = f * floorH;
  const front = facadeMaterial(style, w, f), side = facadeMaterial(sideStyle, d, f);
  const geo = new THREE.BoxGeometry(w, H, d); geo.translate(0, H / 2, 0);
  const m = new THREE.Mesh(geo, [side, side, ctx.M.roof, ctx.M.roof, front, front]);
  m.castShadow = m.receiveShadow = true;
  return { mesh: m, H };
}

// 屋面：女儿墙、光伏板、随机设备箱
export function roofKit(ctx, g, w, d, H, { solar = false, parapet = true } = {}) {
  const { M, rand } = ctx;
  if (parapet) {
    for (const [sx, sz, lw, ld] of [[0, d / 2, w, 0.5], [0, -d / 2, w, 0.5], [w / 2, 0, 0.5, d], [-w / 2, 0, 0.5, d]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.1, ld), M.white);
      p.position.set(sx, H + 0.55, sz); g.add(p);
    }
  }
  if (solar) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, d * 0.7), new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.4, metalness: 0.3 }));
    s.material.map.repeat.set(Math.max(1, w / 10), Math.max(1, d / 8));
    s.material.map.wrapS = s.material.map.wrapT = THREE.RepeatWrapping;
    s.rotation.x = -Math.PI / 2; s.position.set(0, H + 0.15, d * 0.08); g.add(s);
  }
  const n = solar ? 2 : 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 2 + rand() * Math.min(6, w * 0.25), bd = 2 + rand() * Math.min(5, d * 0.25), bh = 1.5 + rand() * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), M.roofDark);
    b.position.set((rand() - 0.5) * (w - bw - 2), H + bh / 2, (rand() - 0.5) * (d - bd - 2) - (solar ? d * 0.3 : 0));
    b.castShadow = true; g.add(b);
  }
}

// 登记一栋可点选建筑：返回 root（定位、朝向）与 grow（生长动画缩放的分组，几何体加在这里）。
// 加入 ctx.park 分组，需先 ctx.addGroup('park')。完成后需设置 root.userData.height（米）。
export function placeBuilding(ctx, rec, [x, z], rot = ctx.gridAngle) {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rot;
  const grow = new THREE.Group(); root.add(grow);
  root.userData = { rec, grow };
  ctx.park.add(root);
  ctx.buildings.push(root);
  ctx.blockers.rects.push({ c: [x, z], w: rec.w + 6, d: rec.d + 6, a: rot });
  return { root, grow };
}

// 高层 / 多层塔楼：可选裙房 podium { w, d, f }、首层玻璃门厅（10 层以上）、
// 屋顶光伏（12 层以上）、grid 风格白色檐口、sign 时楼顶设 ctx.sign 标识
export function tower(ctx, t, at) {
  const { M, pickables } = ctx;
  const { root, grow } = placeBuilding(ctx, t, at);
  let baseY = 0;
  if (t.podium) {
    const pd = makeBlock(ctx, { w: t.podium.w, d: t.podium.d, f: t.podium.f, style: 'podium', floorH: 5 });
    pd.mesh.position.z = t.podium.d / 2 - t.d / 2 - 4;
    grow.add(pd.mesh); pickables.push(pd.mesh); pd.mesh.userData.bld = root;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(t.podium.w + 2, 0.8, t.podium.d + 2), M.white);
    lid.position.set(0, pd.H + 0.4, pd.mesh.position.z); grow.add(lid);
    ctx.blockers.rects.push({ c: at, w: t.podium.w + 6, d: t.podium.d + 14, a: ctx.gridAngle });
  }
  const { mesh, H } = makeBlock(ctx, t);
  mesh.position.y = baseY;
  grow.add(mesh); pickables.push(mesh); mesh.userData.bld = root;
  // 底层玻璃门厅
  if (t.f > 10) {
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.4, 5.5, t.d + 0.4), M.glass);
    lobby.position.y = 2.75; grow.add(lobby);
  }
  roofKit(ctx, grow, t.w, t.d, H, { solar: t.f > 12 });
  if (t.style === 'grid') {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.8, 2.4, t.d + 0.8), M.white);
    crown.position.y = H + 1.2; grow.add(crown);
  }
  if (t.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: signTexture(ctx.sign), transparent: true, toneMapped: false }));
    sign.position.set(0, H + 4.2, t.d / 2 + 0.5); grow.add(sign);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 0.4), M.concreteDark);
    frame.position.set(0, H + 1.6, t.d / 2 + 0.3); grow.add(frame);
  }
  root.userData.height = H;
  ctx.labels.push({ text: t.id, sub: t.name, kind: 'building', bld: root, pos: V3(at[0], H + 10, at[1]) });
  return root;
}

// 周边建筑：浅色概念体量，大跨厂房加屋面采光带。加入 ctx.context 分组，需先 ctx.addGroup('context')。
// roof 为顶面材质（缺省 M.roof）。
export function contextBox(ctx, x, z, w, d, h, a, mat = ctx.M.ctx, roof = ctx.M.roof) {
  const { M, context } = ctx;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roof, M.roof, mat, mat]);
  m.position.set(x, h / 2, z); m.rotation.y = a; m.castShadow = m.receiveShadow = true;
  context.add(m);
  if (w * d > 1800) for (let k = -w / 2 + 6; k < w / 2 - 3; k += 9) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, d - 4), M.roofDark);
    s.position.set(x + k * Math.cos(a), h + 0.25, z - k * Math.sin(a)); s.rotation.y = a; context.add(s);
  }
  ctx.blockers.rects.push({ c: [x, z], w: w + 4, d: d + 4, a });
}
