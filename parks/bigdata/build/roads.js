import * as THREE from 'three';
import { V3, insertY, smooth, densify, ribbon, offsetLine, distToPolyline, polyIntersect } from '../../../core/geom.js';
import { groundRoad } from '../../../core/kit/roads.js';
import { laneOn, route } from '../../../core/lanes.js';
import { buildBridge } from './bridge.js';
import {
  P, YULONG, YULONG_W, SERVICE, YULAN, YULAN_W, YUNHE, YUNHE_W, YINXING, YINXING_W, DONGZI_W, DONGZI_E, DONGZI_RW,
  LOCAL_ROADS, CANAL_W, BAIHE_W,
} from '../layout.js';

const MAIN_Y = 0.86;

// 外部路网：玉龙南路（主路 + 辅路 + 玉新桥）、玉兰路、运河路、银杏路、董子河东 / 西路、周边支路。
// 返回种行道树要用的中线
export function buildRoads(ctx, { canal, baihe }) {
  const { world, M, roadMats, rand } = ctx;

  // ── 玉龙南路：两幅主路连续跨河；辅路、绿化隔离带、人行道在运河两岸断开（辅路在桥头并入主路）──
  const yl = smooth(YULONG, 6);
  const onCanal = p => distToPolyline(p[0], p[1], canal) < CANAL_W / 2 + 1.5;
  const runs = [];
  for (const p of yl) {
    if (onCanal(p)) { if (runs.at(-1)?.length) runs.push([]); continue; }
    if (!runs.length) runs.push([]);
    runs.at(-1).push(p);
  }
  const outer = SERVICE.off + SERVICE.w / 2 + 3;
  const land = runs.filter(r => r.length > 1);
  for (const r of land) {
    world.add(Object.assign(new THREE.Mesh(ribbon(r, outer * 2, 0.68, 18), M.sidewalk), { receiveShadow: true }));
    for (const s of [-1, 1]) {
      const sep = (YULONG_W / 2 + SERVICE.off - SERVICE.w / 2) / 2;
      world.add(Object.assign(new THREE.Mesh(ribbon(offsetLine(r, s * sep), SERVICE.off - SERVICE.w / 2 - YULONG_W / 2, 0.74), M.lawn), { receiveShadow: true }));
      world.add(Object.assign(new THREE.Mesh(ribbon(offsetLine(r, s * SERVICE.off), SERVICE.w, 0.8, 24), roadMats.local), { receiveShadow: true }));
      ctx.carPaths.push({ pts: offsetLine(r, s * SERVICE.off), y: 0.85, dir: s, speed: 6 + rand() * 2, count: 2, offset: 1.8 });
    }
    world.add(Object.assign(new THREE.Mesh(ribbon(r, 2, MAIN_Y - 0.02), M.lawn), { receiveShadow: true }));   // 中央分隔带
    ctx.blockRoad(r, outer * 2);
  }
  for (const s of [-1, 1]) world.add(Object.assign(new THREE.Mesh(ribbon(offsetLine(yl, s * (YULONG_W / 4 + 0.5)), YULONG_W / 2 - 1, MAIN_Y, 30), roadMats.city), { receiveShadow: true }));
  for (const o of [2.9, 6.6, 10.4, 14.1]) for (const s of [-1, 1]) {
    ctx.carPaths.push({ pts: offsetLine(yl, s * o), y: MAIN_Y + 0.05, dir: s, speed: 13 + rand() * 4, count: 5 });
  }
  for (let i = 0, acc = 0; i < yl.length; i++) {
    if (i) acc += Math.hypot(yl[i][0] - yl[i - 1][0], yl[i][1] - yl[i - 1][1]);
    if (acc < 34) continue;
    acc = 0;
    for (const s of [-1, 1]) ctx.lampSpots.push(V3(...insertY(offsetLine(yl, s * (YULONG_W / 2 + 1))[i], 9)));
  }
  buildBridge(ctx, yl, canal, MAIN_Y);
  ctx.place('玉龙南路', V3(...insertY(yl[Math.floor(yl.length * 0.3)], 3)));

  // ── 玉兰路 / 运河路 / 银杏路（两端均到沙盘边缘）──
  const yulan = smooth(YULAN, 6);
  const yulanY = groundRoad(ctx, yulan, YULAN_W, { lanes: [[2.8, 1], [6.6, 1], [-2.8, -1], [-6.6, -1]], speed: 11, count: 6, lamp: 32 }) + 0.05;
  ctx.place('玉兰路', V3(...insertY(P(1110, 137), 3)));
  const yunhe = smooth(YUNHE, 6);
  groundRoad(ctx, yunhe, YUNHE_W, { lanes: [[3.2, 1], [7.6, 1], [-3.2, -1], [-7.6, -1]], speed: 12, count: 5, lamp: 32 });
  ctx.place('运河路', V3(...insertY(P(1250, -78), 3)));
  const yinxing = densify(YINXING, 8);
  groundRoad(ctx, yinxing, YINXING_W, { lanes: [[2.4, 1], [6.2, 1], [-2.4, -1], [-6.2, -1]], speed: 10, count: 5, lamp: 30 });
  ctx.place('银杏路', V3(...insertY(P(640, 700), 3)));

  // ── 董子河西路 / 东路：北端止于玉兰路（丁字路口），车流在路口转入玉兰路，两头都到沙盘边缘 ──
  // 玉兰路自西向东，+ 侧为东行；董子河路自北向南，+ 侧为南行。右转走外侧车道，左转走内侧车道
  const dzw = densify(DONGZI_W, 8), dze = densify(DONGZI_E, 8);
  for (const l of [dzw, dze]) {
    const y = groundRoad(ctx, l, DONGZI_RW, { lamp: 30 }) + 0.05, speed = 8 + rand() * 2;
    const south = laneOn(l, 2.6, y), north = laneOn(l, -2.6, y);
    for (const r of [
      route(laneOn(yulan, 6.6, yulanY), south),               // 玉兰路东行 → 右转南行
      route(laneOn(yulan, -2.8, yulanY), [south, 12]),        // 玉兰路西行 → 左转南行
      route(north, laneOn(yulan, 6.6, yulanY)),               // 北行 → 右转玉兰路东行
      route(north, [laneOn(yulan, -2.8, yulanY), 12]),        // 北行 → 左转玉兰路西行
    ]) ctx.carPaths.push({ ...r, dir: 1, speed, count: 2 });
  }
  ctx.place('董子河西路', V3(...insertY(P(300, 330), 3)));
  ctx.place('董子河东路', V3(...insertY(P(560, 420), 3)));

  // ── 周边支路 ──
  const locals = LOCAL_ROADS.map(r => smooth(r.pts, 6));
  LOCAL_ROADS.forEach((r, i) => {
    groundRoad(ctx, locals[i], r.w, { mat: roadMats.local, walk: 1.5, lanes: [[0, rand() < 0.5 ? 1 : -1]], speed: 6, count: 1, offset: 1.6 });
  });

  // ── 跨白鹤河的桥栏（仕庄桥、银杏路桥）──
  for (const [l, w] of [[yulan, YULAN_W], [yinxing, YINXING_W]]) {
    const hit = polyIntersect(l, baihe);
    if (!hit) continue;
    const [bx, bz, t] = hit, ang = Math.atan2(t[0], t[1]);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, BAIHE_W + 12), M.white);
      r.position.set(bx - t[1] * s * (w / 2 + 1.8), 1.3, bz + t[0] * s * (w / 2 + 1.8)); r.rotation.y = ang; r.castShadow = true; world.add(r);
    }
  }
  return { yl, yulan, yunhe, yinxing, dzw, dze, locals };
}
