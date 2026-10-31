import * as THREE from 'three';
import {
  V3, sub2, len2, norm2, insertY, smoothstep, smooth, densify, ribbon, offsetLine, offsetLineVar, polyIntersect,
} from '../../../core/geom.js';
import { laneOf, revLane, turnLane } from '../../../core/lanes.js';
import { groundRoad, elevatedRoad } from '../../../core/kit/roads.js';
import {
  P, PX, PLATE, QINGYANG_AXIS, DECK_START, LANDING, FRONTAGE, HIGHWAY, HEHAI_ROAD, CHUANGKE_ROAD, HONGYANG_ROAD,
  LOCAL_ROADS, ELEVATED_RAMPS, TOLL, G42_MAIN, G42_RAMP,
} from '../layout.js';

// 外部路网：青洋路高架（主线、落地坡道、两条匝道）、青洋北路、河海东路、创客路、虹阳路、周边支路、
// 沪蓉高速连接线与 G42 主线、青龙收费站，以及路口转向车流。
// 返回种行道树要用的中线。
export function buildRoads(ctx, { branches }) {
  const { world, M, roadMats, rand } = ctx;

  // ── 青洋路高架（主线）：桥面 s ∈ [DECK_START, qLen]，北端经落地坡道接地面青洋北路 ──
  const qa = QINGYANG_AXIS;
  const qDir = norm2(sub2(qa[1], qa[0])), qLen = len2(sub2(qa[1], qa[0]));
  const qAng = Math.atan2(qDir[0], qDir[1]);
  const deckH = 10;
  const E = [qDir[1], -qDir[0]];                                   // 高架东侧单位向量
  const axisPt = (s, lat) => [qa[0][0] + qDir[0] * s + E[0] * lat, qa[0][1] + qDir[1] * s + E[1] * lat];
  const latOf = p => (p[0] - qa[0][0]) * E[0] + (p[1] - qa[0][1]) * E[1];
  const sOf = p => (p[0] - qa[0][0]) * qDir[0] + (p[1] - qa[0][1]) * qDir[1];
  const S0 = DECK_START, deckLen = qLen - S0;
  const sNorth = (P(0, PLATE.y0)[1] - qa[0][1]) / qDir[1];          // 沙盘北缘处的 s（负值）
  {
    const mid = axisPt(S0 + deckLen / 2, 0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.8, deckLen), M.concrete);
    deck.position.set(mid[0], deckH - 0.9, mid[1]); deck.rotation.y = qAng;
    deck.castShadow = deck.receiveShadow = true; world.add(deck);
    const top = new THREE.Mesh(ribbon([axisPt(S0, 0), qa[1]], 32, deckH + 0.02, 40), roadMats.elevated);
    top.receiveShadow = true; world.add(top);
    const pierGeo = new THREE.CylinderGeometry(1.1, 1.3, deckH - 1.8, 12);
    const capGeo = new THREE.BoxGeometry(26, 1.6, 2.6);
    for (let s = S0 + 8; s < qLen - 6; s += 34) {
      const [x, z] = axisPt(s, 0);
      for (const o of [-7, 7]) {
        const p = new THREE.Mesh(pierGeo, M.concreteDark);
        p.position.set(x + o * E[0], (deckH - 1.8) / 2, z + o * E[1]); p.castShadow = true; world.add(p);
      }
      const cap = new THREE.Mesh(capGeo, M.concreteDark);
      cap.position.set(x, deckH - 2.6, z); cap.rotation.y = qAng; world.add(cap);
    }
    for (let s = S0 + 10; s < qLen; s += 40) for (const o of [-16.2, 16.2]) ctx.lampSpots.push(V3(...insertY(axisPt(s, o), deckH + 7)));
    ctx.blockRoad([axisPt(sNorth, 0), qa[1]], 38);
    ctx.place('青洋路高架', V3(...insertY(axisPt(S0 + deckLen * 0.25, 0), deckH + 6)));
  }

  // ── 河海东路（地面，高架下穿）──
  // 连接线西端断面：环形匝道（北）、河海东路（中）、东匝道（南）在此相切汇入；断面处与地面齐平，向东爬升至路堤
  const hw = smooth(HIGHWAY, 8);
  const hwT = norm2(sub2(hw[1], hw[0])), hwN = [-hwT[1], hwT[0]];
  const hwJoin = (lat, back) => [hw[0][0] + hwN[0] * lat - hwT[0] * back, hw[0][1] + hwN[1] * lat - hwT[1] * back];
  const hwCum = [0];
  for (let i = 1; i < hw.length; i++) hwCum.push(hwCum[i - 1] + len2(sub2(hw[i], hw[i - 1])));
  const hwY = hwCum.map(L => 0.86 + (1.4 - 0.86) * smoothstep(20, 90, L));
  const hehai = smooth([...HEHAI_ROAD, hwJoin(0, 22), hwJoin(0, -10)], 6);
  groundRoad(ctx, hehai, 24, { y: 0.84, lamp: 30 });
  // 河海东路与连接线为同一条地面道路的延伸：车道连成一条，断面处横向渐变（河海 ±3.5 / ±8 → 连接线 ±5 / ±10.5），右侧通行
  // hehaiLane[o]：按行驶方向的车道（o > 0 东行，o < 0 西行），供青洋北路转向拼接
  const hehaiLane = {};
  {
    const head = hehai.filter(p => (p[0] - hw[0][0]) * hwT[0] + (p[1] - hw[0][1]) * hwT[1] < -1);
    const pts = [...head, ...hw];
    const ys = [...head.map(() => 0.89), ...hwY.map(y => y + 0.05)];
    for (const [a, b] of [[3.5, 5], [8, 10.5], [-3.5, -5], [-8, -10.5]]) {
      const ds = [...head.map(() => a), ...hwCum.map(L => a + (b - a) * smoothstep(10, 90, L))];
      const l = laneOf(offsetLineVar(pts, ds), ys);
      hehaiLane[a] = a > 0 ? l : revLane(l);
      ctx.carPaths.push({ ...hehaiLane[a], dir: 1, speed: 16 + rand() * 5, count: 8 });
    }
  }
  ctx.place('河海东路', V3(...insertY(hehai[Math.floor(hehai.length * 0.18)], 3)));

  // ── 青洋北路（高架两侧地面辅路，北接河海东路）──
  // 西幅南行、东幅北行（单向两车道）；frontLine[o] 为自北向南的道路中线
  const frontLine = {};
  for (const o of [-FRONTAGE, FRONTAGE]) {
    const full = densify([axisPt(0, o), axisPt(qLen, o)], 10);
    const hit = polyIntersect(full, hehai);
    frontLine[o] = hit ? [[hit[0], hit[1]], ...full.filter(p => sOf(p) > sOf(hit) + 2)] : full;
    groundRoad(ctx, frontLine[o], 17, { y: 0.8, lamp: 32 });
  }
  ctx.place('青洋北路', V3(...insertY(axisPt(qLen * 0.55, FRONTAGE), 3)));

  // ── 创客路 / 虹阳路 ──
  const ck = smooth(CHUANGKE_ROAD, 6);
  groundRoad(ctx, ck, 30, { y: 0.86, lanes: [[-11, 1], [-4, 1], [4, -1], [11, -1]], speed: 12, count: 8, lamp: 30 });
  ctx.place('创客路', V3(...insertY(ck[Math.floor(ck.length * 0.66)], 3)));
  const hy = densify(HONGYANG_ROAD, 10);
  groundRoad(ctx, hy, 18, { y: 0.82, lamp: 30 });
  ctx.place('虹阳路', V3(...insertY(P(120, 592), 3)));
  // ── T 形路口车流：青洋北路北接河海东路、虹阳路东接青洋北路西幅，按右侧通行转向拼接，车辆只在沙盘边缘出入 ──
  {
    // 西幅南行：+3 外侧（西）、-3 内侧；东幅北行：中线自北向南，-3 为外侧（东）
    const W = o => laneOf(offsetLine(frontLine[-FRONTAGE], o), 0.85);
    const E = o => revLane(laneOf(offsetLine(frontLine[FRONTAGE], o), 0.85));
    const hyEast = laneOf(offsetLine(hy, 3), 0.87), hyWest = revLane(laneOf(offsetLine(hy, -3), 0.87));
    const flows = [
      [turnLane(hehaiLane[8], W(3)), 3],                        // 河海东路东行 → 右转南行
      [turnLane(hehaiLane[3.5], W(-3)), 3],
      [turnLane(turnLane(hehaiLane[8], W(3)), hyWest), 3],      // 河海东路东行 → 右转南行 → 右转虹阳路西行
      [turnLane(hyEast, W(3)), 3],                              // 虹阳路东行 → 右转南行
      [turnLane(E(-3), hehaiLane[8]), 4],                       // 北行 → 右转河海东路东行 → 连接线
      [turnLane(E(3), hehaiLane[-3.5], 12), 4],                 // 北行 → 左转河海东路西行
    ];
    for (const [l, count] of flows) ctx.carPaths.push({ ...l, dir: 1, speed: 9 + rand() * 3, count });
  }
  // 周边支路
  for (const r of LOCAL_ROADS) {
    const pts = smooth(r.pts.map(p => P(...p)), 6);
    groundRoad(ctx, pts, r.w * PX * 1.4, { mat: roadMats.local, walk: 1.5, lanes: [[0, rand() < 0.5 ? 1 : -1]], speed: 6, count: 1, offset: 1.6 });
  }

  // 跨河桥栏杆
  for (const b of branches) {
    const hit = polyIntersect(ck, b);
    if (!hit) continue;
    const [bx, bz, t] = hit, ang = Math.atan2(t[0], t[1]);
    for (const s of [-15.5, 15.5]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 34), M.white);
      r.position.set(bx - t[1] * s, 1.2, bz + t[0] * s); r.rotation.y = ang; r.castShadow = true; world.add(r);
    }
  }

  // ── 主线落地坡道 + 路口以北地面青洋北路（河海东路路口为平交）──
  const [la, lb] = LANDING;
  {
    const line = densify([axisPt(la, 0), axisPt(lb, 0)], 5);
    elevatedRoad(ctx, line, 20, line.map(p => 0.84 + (deckH + 0.04 - 0.84) * smoothstep(la, lb, sOf(p))));
  }
  groundRoad(ctx, densify([axisPt(sNorth, 0), axisPt(la + 8, 0)], 10), 22, { y: 0.8, lamp: 32 });
  // 直行车流：地面青洋北路 ↔ 落地坡道 ↔ 主线内侧车道（右侧通行：西幅南行，东幅北行）
  {
    const ss = [];
    for (let s = sNorth; s < la; s += 10) ss.push(s);
    for (let s = la; s < S0; s += 5) ss.push(s);
    for (let s = S0; s <= qLen; s += 20) ss.push(s);
    const ys = ss.map(s => 0.85 + (deckH + 0.05 - 0.85) * smoothstep(la, lb, s));
    for (const lane of [-5.5, 5.5]) {
      ctx.carPaths.push({ pts: ss.map(s => axisPt(s, lane)), ys, dir: lane < 0 ? 1 : -1, speed: 15 + rand() * 4, count: 9 });
    }
  }

  // ── 高架匝道（逐点高程：自连接线端爬坡，低段挡墙填土，高段桥梁）──
  const railGaps = { '-1': [], '1': [] };
  const onDeck = p => Math.abs(latOf(p)) < 16.9 && sOf(p) > S0 - 1;
  for (const r of ELEVATED_RAMPS) {
    const line = smooth([hwJoin(r.join, 0), hwJoin(r.join, 22), ...r.pts.map(p => P(...p)), ...r.tail.map(([s, l]) => axisPt(s, l))], 5);
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len2(sub2(line[i], line[i - 1])));
    let L0, L1;
    if (r.climb) [L0, L1] = r.climb;
    else {
      L1 = cum[line.findIndex(p => Math.abs(latOf(p)) < 24 && sOf(p) > 0)];
      L0 = Math.max(15, L1 - 230);
    }
    const y0 = hwY[0] + 0.02, yTop = deckH + 0.08;
    const ys = cum.map(L => y0 + (yTop - y0) * smoothstep(L0, L1, L));
    elevatedRoad(ctx, line, r.w, ys, p => !onDeck(p));
    // 与主线防撞墙重叠段留缺口
    line.forEach(p => {
      if (sOf(p) > S0 - 1 && Math.abs(latOf(p) - r.side * 16.6) < r.w / 2 + 0.5) railGaps[r.side].push(sOf(p));
    });
    // 车流：单车道接入高架外侧车道（out：高架北行 → 匝道 → 连接线；in：连接线西行 → 环形匝道 → 高架南行）
    const outer = [1, -1].find(k => Math.abs(latOf(offsetLine(line, k * 2.8).at(-1))) > Math.abs(latOf(line.at(-1))));
    const lane = offsetLine(line, outer * 2.8), laneY = ys.map(y => y + 0.05);
    const sEnd = r.tail.at(-1)[0], deckLane = r.side * 13.5;
    // 连接线段：自匝道端点横向渐变并入外侧车道（±10.5），一直行驶到沙盘边缘，避免中途消失
    const lat0 = (lane[0][0] - hw[0][0]) * hwN[0] + (lane[0][1] - hw[0][1]) * hwN[1];
    const hwLane = offsetLineVar(hw, hwCum.map(L => lat0 + (r.side * 10.5 - lat0) * smoothstep(0, 60, L))).slice(1);
    if (r.flow === 'out') {
      const deck = densify([axisPt(qLen, deckLane), axisPt(sEnd + 25, deckLane)], 20);
      const trail = hwLane;
      ctx.carPaths.push({
        pts: [...deck, ...lane.slice().reverse(), ...trail],
        ys: [...deck.map(() => deckH + 0.05), ...laneY.slice().reverse(), ...trail.map((_, i) => hwY[i + 1] + 0.05)], dir: 1, speed: 15, count: 10,
      });
    } else {
      const lead = hwLane.slice().reverse();
      const leadY = hwY.slice(1).reverse().map(y => y + 0.05);
      const deck = densify([axisPt(sEnd + 25, deckLane), axisPt(qLen, deckLane)], 20);
      ctx.carPaths.push({ pts: [...lead, ...lane, ...deck], ys: [...leadY, ...laneY, ...deck.map(() => deckH + 0.05)], dir: 1, speed: 15, count: 12 });
    }
  }
  // 主线两侧防撞墙（匝道并入处断开）
  for (const side of [-1, 1]) {
    const g = railGaps[side];
    const segs = g.length ? [[S0, Math.min(...g) - 1], [Math.max(...g) + 1, qLen]] : [[S0, qLen]];
    for (const [a, b] of segs) {
      if (b - a < 2) continue;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, b - a), M.white);
      const [x, z] = axisPt((a + b) / 2, side * 16.6);
      rail.position.set(x, deckH + 0.55, z); rail.rotation.y = qAng; rail.castShadow = true; world.add(rail);
    }
  }

  // ── 沪蓉高速连接线（路堤式，收费站处加宽）──
  let tollI = 0;
  hw.forEach((p, i) => { if (len2(sub2(p, TOLL.at)) < len2(sub2(hw[tollI], TOLL.at))) tollI = i; });
  // 宽度：西端断面容纳三路（≈49 m）渐收至 34 m，收费站处加宽
  const hwW = hwCum.map(L => 34 + 15 * (1 - smoothstep(0, 90, L)) + 34 * Math.exp(-(((L - hwCum[tollI]) / 70) ** 2)));
  world.add(Object.assign(new THREE.Mesh(ribbon(hw, hwW.map((w, i) => w + 12 * smoothstep(0, 60, hwCum[i])), hwY.map(y => y - 0.6)), M.bank), { receiveShadow: true }));
  world.add(Object.assign(new THREE.Mesh(ribbon(hw, hwW, hwY, 40), roadMats.highway), { receiveShadow: true }));
  ctx.blockRoad(hw, 50);
  ctx.place('沪蓉高速连接线', V3(...insertY(hw[Math.floor(hw.length * 0.3)], 6)));
  // ── G42 沪蓉高速主线（东北角，路堤双向分幅）+ 环道 ──
  {
    const g = densify(G42_MAIN, 10);
    world.add(Object.assign(new THREE.Mesh(ribbon(g, 62, 1.6), M.bank), { receiveShadow: true }));
    for (const o of [-12, 12]) {
      const line = offsetLine(g, o);
      world.add(Object.assign(new THREE.Mesh(ribbon(line, 20, 2.6, 40), roadMats.highway), { receiveShadow: true }));
      for (const lane of [-6, 0, 6]) ctx.carPaths.push({ pts: offsetLine(line, lane), y: 2.65, dir: o < 0 ? 1 : -1, speed: 28 + rand() * 6, count: 3 });
    }
    ctx.blockRoad(g, 62);
    ctx.place('G42 沪蓉高速', V3(...insertY(g[Math.floor(g.length * 0.55)], 8)));
    const ramp = smooth(G42_RAMP, 8);
    world.add(Object.assign(new THREE.Mesh(ribbon(ramp, 22, 0.8), M.bank), { receiveShadow: true }));
    world.add(Object.assign(new THREE.Mesh(ribbon(ramp, 12, 1.4, 30), roadMats.elevated), { receiveShadow: true }));
    ctx.blockRoad(ramp, 22);
    ctx.carPaths.push({ pts: ramp, y: 1.45, dir: 1, speed: 20, count: 3 });
  }
  // 青龙收费站
  {
    const p = hw[tollI], t = norm2(sub2(hw[Math.min(hw.length - 1, tollI + 1)], hw[Math.max(0, tollI - 1)]));
    const ang = Math.atan2(t[0], t[1]);
    const g = new THREE.Group(); g.position.set(p[0], 1.4, p[1]); g.rotation.y = ang;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(66, 1.2, 14), M.canopy);
    roof.position.y = 7.5; roof.castShadow = true; g.add(roof);
    const band = new THREE.Mesh(new THREE.BoxGeometry(66.2, 0.6, 14.2), new THREE.MeshStandardMaterial({ color: 0x2e7d5b }));
    band.position.y = 7.2; g.add(band);
    for (let i = -30; i <= 30; i += 5) {
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 4), M.white);
      booth.position.set(i, 1.3, 0); booth.castShadow = true; g.add(booth);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), M.concreteDark);
      col.position.set(i, 3.6, 0); g.add(col);
    }
    world.add(g);
    ctx.place(TOLL.name, V3(p[0], 12, p[1]));
  }
  return { qa, ck, hy, hehai };
}
