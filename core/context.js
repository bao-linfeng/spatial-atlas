import * as THREE from 'three';
import { rng } from './rng.js';
import { createMaterials } from './materials.js';
import { isBlocked } from './kit/scatter.js';
import { buildTrees, buildCars, buildLamps } from './kit/instances.js';

// 场景构建上下文：园区的 build(ctx) 往这里登记内容，finalize() 统一收尾（种树、车流、路灯）。
// plate：沙盘范围（场景米）{ x0, x1, z0, z1 }；gridAngle：园区建筑的默认朝向；sign：标识文字。
export function createContext(scene, { plate, gridAngle = 0, sign = '' }) {
  const { M, water, roadMats } = createMaterials();
  const world = new THREE.Group();
  scene.add(world);
  const { x0, x1, z0, z1 } = plate;
  const ctx = {
    world, M, water, roadMats, gridAngle, sign,
    rand: () => rng.world(),
    plate: { x0, x1, z0, z1 },
    inPlate: (x, z, m = 4) => x > x0 + m && x < x1 - m && z > z0 + m && z < z1 - m,
    buildings: [],                                    // 可点选建筑（root 组，userData.rec 为数据）
    labels: [],                                       // 标注锚点 { text, kind, pos, sub?, bld? }
    pickables: [],                                    // 参与点选的网格，userData.bld 指向所属建筑
    treeSpots: [],                                    // { p: [x, z], s, kind, force? }
    lampSpots: [],                                    // THREE.Vector3
    carPaths: [],                                     // { pts, y | ys, dir, speed, count, offset? }
    blockers: { roads: [], rects: [], water: [] },    // 种树时避让
    nightables: [[M.glass, 0.55], [M.canopy, 0.35]],  // 夜景时 emissiveIntensity = t × k
    roadRank: 0,                                      // 地面道路逐条错开高度，避免交叉口闪烁
  };
  // 新建一个挂在 world 下的分组，同时记为 ctx[name]（如 park、context）
  ctx.addGroup = name => { const g = new THREE.Group(); world.add(g); ctx[name] = g; return g; };
  ctx.place = (text, pos) => ctx.labels.push({ text, kind: 'place', pos });
  ctx.blockRoad = (pts, w) => ctx.blockers.roads.push({ pts, hw: w / 2 + 2.5 });
  ctx.night = (material, k) => ctx.nightables.push([material, k]);
  return ctx;
}

export function finalize(ctx) {
  const { world, inPlate, carPaths } = ctx;
  const finalTrees = ctx.treeSpots.filter(t => inPlate(t.p[0], t.p[1], 3) && (t.force || !isBlocked(ctx, t.p[0], t.p[1], 1.5)));
  const trees = buildTrees(finalTrees);
  world.add(trees.group);

  // 双向单车道小路（带 offset）若有端点落在沙盘内部，改为往返：开到尽头掉头沿对侧返回，不在路中凭空消失
  for (const c of carPaths) {
    if (!c.offset || (!inPlate(...c.pts[0], 25) && !inPlate(...c.pts.at(-1), 25))) continue;
    c.pts = [...c.pts, ...c.pts.slice(0, -1).reverse()];
    if (c.ys) c.ys = [...c.ys, ...c.ys.slice(0, -1).reverse()];
  }
  const cars = buildCars(carPaths);
  world.add(cars.group);

  // 路灯（夜景发光点）
  const lamps = buildLamps(ctx.lampSpots.filter(p => inPlate(p.x, p.z, 3)));
  world.add(lamps);

  return {
    world, park: ctx.park, buildings: ctx.buildings, labels: ctx.labels, pickables: ctx.pickables,
    trees, cars, lamps, plateRect: ctx.plate, nightables: ctx.nightables,
    materials: { M: ctx.M, water: ctx.water, roadMats: ctx.roadMats },
  };
}
