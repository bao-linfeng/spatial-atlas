import { V3, insertY, smooth, densify, sub2, len2 } from '../../../core/geom.js';
import { groundRoad } from '../../../core/kit/roads.js';
import { laneOn, route, laneCum, cutLane } from '../../../core/lanes.js';
import {
  P, TAIHU, TAIHU_W, HUXI, HUXI_W, QINGFENG, QINGFENG_W, WUSHAN_N, WUSHAN_S, WUSHAN_W, HUXING, HUXING_W, LONGCANG, LONGCANG_W, LOCAL_ROADS,
} from '../layout.js';

// 闭环：路线 l 最后转回起始车道 a，尾段（a 的后半）与开头在 a 上重叠。从尾段起点在 a 上的里程截起、到尾段起点为止，首尾相接
function closeLoop(l, a) {
  const n = l.pts.length, na = a.pts.length;
  let m = 0;
  while (m < na - 1 && l.pts[n - 1 - m][0] === a.pts[na - 1 - m][0] && l.pts[n - 1 - m][1] === a.pts[na - 1 - m][1]) m++;
  const k = n - 1 - m, q = l.pts[k], ca = laneCum(a.pts);
  let s = 0, best = Infinity;
  for (let i = 1; i < na; i++) {
    const p = a.pts[i - 1], u = sub2(a.pts[i], p), L2 = u[0] * u[0] + u[1] * u[1] || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / L2));
    const d = len2([p[0] + u[0] * t - q[0], p[1] + u[1] * t - q[1]]);
    if (d < best) { best = d; s = ca[i - 1] + t * (ca[i] - ca[i - 1]); }
  }
  const cl = laneCum(l.pts);
  return cutLane(l, cl, s, cl[k]);
}

// 外部路网：太湖东路、湖西路、青丰路、巫山路、湖兴路、龙沧路；支路、小区与园区内部道路（矢量图提取）。返回种行道树要用的中线
export function buildRoads(ctx) {
  const { roadMats, rand } = ctx;

  // 太湖东路：双向 6 车道，两端都到沙盘边缘
  const taihu = smooth(TAIHU, 6);
  const taihuY = groundRoad(ctx, taihu, TAIHU_W, { lanes: [[3, 1], [7, 1], [11, 1], [-3, -1], [-7, -1], [-11, -1]], speed: 13, count: 6, lamp: 34 }) + 0.05;
  ctx.place('太湖东路', V3(...insertY(P(1150, 274), 3)));

  // 湖西路 / 青丰路 / 巫山路 / 龙沧路：双向 4 车道；湖兴路：双向 2 车道（西起湖西路，东接龙沧路南端）
  const huxi = smooth(HUXI, 6), qingfeng = smooth(QINGFENG, 6), wushanN = smooth(WUSHAN_N, 6), wushanS = smooth(WUSHAN_S, 6);
  const huxing = smooth(HUXING, 6), longcang = smooth(LONGCANG, 6);
  const huxiY = groundRoad(ctx, huxi, HUXI_W, { lamp: 30 }) + 0.05;
  ctx.place('湖西路', V3(...insertY(P(1650, 730), 3)));
  const qingfengY = groundRoad(ctx, qingfeng, QINGFENG_W, { lamp: 30 }) + 0.05;
  ctx.place('青丰路', V3(...insertY(P(1100, 975), 3)));
  const wushanY = Math.max(...[wushanN, wushanS].map(l => groundRoad(ctx, l, WUSHAN_W, { lamp: 30 }))) + 0.05;
  ctx.place('巫山路', V3(...insertY(P(950, 560), 3)));
  const huxingY = groundRoad(ctx, huxing, HUXING_W, { lamp: 30 }) + 0.05;
  ctx.place('湖兴路', V3(...insertY(P(2450, 1244), 3)));
  const longcangY = groundRoad(ctx, longcang, LONGCANG_W, { lamp: 30 }) + 0.05;
  ctx.place('龙沧路', V3(...insertY(P(3690, 860), 3)));

  // 车流：车辆只在沙盘边缘出入，或沿闭环循环（分类与修法见 CLAUDE.md「车流」）。
  // 巫山路南北两段隔太湖东路相对（端点错开约 5 m），车道连成一条直行穿过路口：两个端点换成它们的中点，免得路口里横移一段
  const mid = WUSHAN_N.at(-1).map((v, k) => (v + WUSHAN_S[0][k]) / 2);
  const wushan = smooth([...WUSHAN_N.slice(0, -1), mid, ...WUSHAN_S.slice(1)], 6);
  // 龙沧路南端顺弯道接湖兴路：两条中线拼成一条（龙沧路自北向南，湖兴路自东向西），车道过弯不横移
  const lh = smooth([...densify(LONGCANG, 30).slice(0, -1), ...HUXING.slice().reverse()], 6), lhY = Math.max(huxingY, longcangY);
  const four = w => [w / 7, w * 0.36];
  const [wi, wo] = four(WUSHAN_W), [hi, ho] = four(HUXI_W), [qi, qo] = four(QINGFENG_W), [, co] = four(LONGCANG_W);
  for (const o of [wi, wo, -wi, -wo]) ctx.carPaths.push({ ...laneOn(wushan, o, wushanY), dir: 1, speed: 9 * (0.85 + rand() * 0.3), count: 4 });
  // 湖西路两端都是丁字路口（北接太湖东路、南接青丰路），青丰路西端接巫山路，湖兴路西端接湖西路，龙沧路南端拐入湖兴路：
  // 这几条路的车道按右侧通行在路口转向拼接成路线（右转走外侧车道，左转走内侧车道）。
  // 中线方向：太湖东路自西向东，湖西路、巫山路、龙沧路自北向南，青丰路自西北向东南，lh 自北向南再向西；laneOn 的偏移 > 0 为顺中线方向行驶。
  // 龙沧路—湖兴路一线只取内侧车道（偏移 3 m，湖兴路为双向 2 车道），龙沧路外侧车道在太湖东路口转向
  const T = o => laneOn(taihu, o, taihuY), H = o => laneOn(huxi, o, huxiY), Q = o => laneOn(qingfeng, o, qingfengY);
  const S = o => laneOn(wushan, o, wushanY), C = o => laneOn(longcang, o, longcangY), X = o => laneOn(lh, o, lhY), L = 12;
  for (const [l, count] of [
    [route(T(11), H(ho), Q(-qo), S(-wo)), 4],                // 太湖东路东行 → 右转湖西路 → 右转青丰路西行 → 右转巫山路北行
    [route(T(-3), [H(hi), L], [Q(qi), L]), 4],               // 太湖东路西行 → 左转湖西路 → 左转青丰路东行
    [route(T(-3), [H(hi), L], [X(-3), L]), 3],               // 太湖东路西行 → 左转湖西路 → 左转湖兴路东行 → 龙沧路北行
    [route(Q(-qo), H(-ho), T(11)), 4],                       // 青丰路西行 → 右转湖西路北行 → 右转太湖东路东行
    [route(S(wi), [Q(qi), L], [H(-hi), L], [T(-3), L]), 4],  // 巫山路南行 → 左转青丰路 → 左转湖西路 → 左转太湖东路西行
    [route(S(-wo), Q(qo)), 3],                               // 巫山路北行 → 右转青丰路东行
    [route(Q(-qi), [S(wi), L]), 3],                          // 青丰路西行 → 左转巫山路南行
    [route(X(3), H(-ho), T(11)), 3],                         // 龙沧路南行 → 湖兴路西行 → 右转湖西路北行 → 右转太湖东路东行
    [route(C(co), T(-11)), 2],                               // 龙沧路南行（外侧）→ 右转太湖东路西行
    [route(T(-11), C(-co)), 2],                              // 太湖东路西行（外侧）→ 右转龙沧路北行
    // 环路：太湖东路、龙沧路、湖兴路、湖西路围成的街区，顺、逆时针各一圈，首尾相接
    [closeLoop(route(H(-ho), T(11), X(3), H(-ho)), H(-ho)), 4],                    // 湖西路北行 → 右转太湖东路 → 右转龙沧路 → 湖兴路 → 右转湖西路
    [closeLoop(route(T(-3), [H(hi), L], [X(-3), L], [T(-3), L]), T(-3)), 4],      // 太湖东路西行 → 左转湖西路 → 左转湖兴路 → 龙沧路 → 左转太湖东路
  ]) ctx.carPaths.push({ ...l, dir: 1, speed: 10 * (0.85 + rand() * 0.3), count });

  // 支路、小区与园区内部道路：6 m 以上的单车道往返，4.5 m 的小区路不跑车；园区内用园区路面、不设人行道
  const locals = LOCAL_ROADS.map(r => smooth(r.pts, 6));
  LOCAL_ROADS.forEach((r, i) => {
    groundRoad(ctx, locals[i], r.w, { mat: r.park ? roadMats.park : roadMats.local, walk: r.park || r.w < 6 ? 0 : 1.5,
      lanes: r.w < 6 ? [] : [[0, rand() < 0.5 ? 1 : -1]], speed: r.park ? 5 : 6, count: 1, offset: 1.6 });
  });
  return { taihu, huxi, qingfeng, wushanN, wushanS, huxing, longcang, locals };
}
