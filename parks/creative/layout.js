import { createFrame } from '../../core/frame.js';
import BAIDU from './data/buildings.js';
import MAP_ROADS from './data/roads.js';
import MAP_GREENS from './data/greens.js';
import MAP_WATER from './data/water.js';

// 常州创意产业园 · 布局数据（主干道手工数字化；支路、绿地、水面、楼栋取自百度地图网页数据，见 data/ 下各文件的来源说明）
// 底图：docs/area-50m-map.png（百度 50 m 比例尺矢量图），其像素即 P 坐标；其余截图按 tools/reg.js 配准到同一坐标。
// 单位约定：手写坐标时，位置用底图记法——px 为底图像素，pts 折线为底图像素；尺寸（宽、深、高、半径、偏移）一律为米，f 为层数。
// 本文件导出的值一律已换算为场景米（位置字段统一为 pos），build/ 中直接使用，不再调用 P / G。尺寸 / 层数为照片估算。

// P(px, py)：底图像素 → 场景米（x 向东，z 向南）
// G(u, v)：园区网格坐标（u 沿主楼长轴向东北，v 垂直，单位：像素）→ 场景米
// GRID_ANGLE ≈ 29°：主楼群（A 座）长轴方向（卫星图），作为园区建筑默认 rotation.y；各楼朝向不一，个别用 a 覆盖
export const ORIGIN = [2225, 825];
export const { PX, P, G, GRID_ANGLE } = createFrame({
  origin: ORIGIN,          // 场景原点（底图像素），取沙盘中心
  scale: 0.48,             // 1 像素 ≈ 0.48 m（底图 50 m 比例尺 104 px）
  axis: [0.875, 0.485],
});

const inPoly = ([x, y], poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const place = ({ px, grid, ...rest }) => ({ ...rest, pos: px ? P(...px) : G(...grid) });
const line = pts => pts.map(p => P(...p));

// 沙盘范围：底图像素 (650, 50)–(3800, 1600)，约 1510 m × 745 m。
// 西至巫山路、澡港河，北至太湖东路，东至龙沧路，南至北塘河：太湖东路、龙沧路、湖兴路、湖西路在沙盘内围成闭环
export const PLATE_PX = { x0: 650, y0: 50, x1: 3800, y1: 1600 };
const [plateX0, plateZ0] = P(PLATE_PX.x0, PLATE_PX.y0), [plateX1, plateZ1] = P(PLATE_PX.x1, PLATE_PX.y1);
export const PLATE = { x0: plateX0, x1: plateX1, z0: plateZ0, z1: plateZ1 };

// 折线裁到沙盘内（留 0.5 m），取最长的一段；道路数字化时两端多取一点，由这里截齐
function clip(pts, m = 0.5) {
  const { x0, x1, z0, z1 } = PLATE;
  const lo = [x0 + m, z0 + m], hi = [x1 - m, z1 - m];
  const inside = p => p[0] >= lo[0] && p[0] <= hi[0] && p[1] >= lo[1] && p[1] <= hi[1];
  // a 在内、b 在外：求 ab 与边界的交点
  const cut = (a, b) => {
    let t = 1;
    for (let k = 0; k < 2; k++) {
      if (b[k] < lo[k]) t = Math.min(t, (lo[k] - a[k]) / (b[k] - a[k]));
      if (b[k] > hi[k]) t = Math.min(t, (hi[k] - a[k]) / (b[k] - a[k]));
    }
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const runs = [];
  let cur = null;
  pts.forEach((p, i) => {
    const q = pts[i - 1];
    if (inside(p)) {
      if (!cur) { cur = []; runs.push(cur); if (q) cur.push(cut(p, q)); }
      cur.push(p);
    } else if (cur) { cur.push(cut(q, p)); cur = null; }
  });
  return runs.sort((a, b) => b.length - a.length)[0] || [];
}
const road = pts => clip(line(pts));

// ───────── 园区地块 ─────────
// 主园区：澡港河以东、太湖东路以南、湖西路以西、青丰路以北的三角形地块（沿各道路边线内收；百度地图未画园区面，暂以路网围合）
const PARK_LOT_PX = [
  [1400, 362], [1500, 372], [1600, 370], [1700, 350], [1762, 342], [1758, 450], [1730, 525], [1697, 600], [1640, 700],
  [1565, 800], [1464, 900], [1335, 1000], [1240, 1062], [1100, 972], [1000, 896], [965, 868], [976, 805], [1004, 750],
  [1031, 700], [1061, 650], [1098, 600], [1138, 550], [1190, 500], [1247, 450], [1308, 400], [1350, 370],
];
export const PARK_LOT = line(PARK_LOT_PX);
// F 座地块：湖西路以东、太湖东路弧段以南、世茂香槟湖以北
const F_LOT_PX = [[2105, 190], [2300, 182], [2420, 215], [2430, 470], [2105, 480]];
export const F_LOT = line(F_LOT_PX);
export const BOUNDARY = PARK_LOT;

// ───────── 水系 ─────────
// 水面：百度 19 级矢量图水面色块的外轮廓（data/water.js，tools/vmap.html + vmap.mjs 生成），与卫星图核对过：
// 湖岸与卫星图荷叶边缘吻合（差 ≤ 5 m，岸边树冠遮挡处以矢量图为准）。世茂香槟湖为 C 形（东北伸入的半岛——香槟湖南区与
// 72–83 幢别墅岛——为陆地），按湖心一点识别；澡港河被太湖东路、青丰路的桥分成几段，其余为北塘河、沙盘边上的河与水木年华的水池
export const WATERS = MAP_WATER.map(line);
export const LAKE = WATERS[MAP_WATER.findIndex(poly => inPoly([1900, 1000], poly))];
// 岸线：沿沙盘边界的那几段（被沙盘截断处）不算岸，按连续的岸段拆成折线；整圈都是岸的闭合
const onEdge = ([x, y]) => x <= PLATE_PX.x0 + 1 || x >= PLATE_PX.x1 - 1 || y <= PLATE_PX.y0 + 1 || y >= PLATE_PX.y1 - 1;
export const SHORES = MAP_WATER.flatMap(poly => {
  const n = poly.length, cut = poly.map((p, i) => onEdge(p) && onEdge(poly[(i + 1) % n]));   // cut[i]：边 i → i+1 在沙盘边上
  if (!cut.some(Boolean)) return [line([...poly, poly[0]])];
  const start = cut.findIndex(Boolean), runs = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (cut[(i + n - 1) % n]) { if (cur && cur.length > 1) runs.push(cur); cur = [poly[i]]; } else cur.push(poly[i]);
  }
  if (cur && cur.length > 1) runs.push(cur);
  return runs.map(line);
});
// 澡港河标注位置（矢量图上河宽 35–40 m，比 50 m 比例尺底图上宽）
export const ZAOGANG_LABEL = P(1053, 600);
// 北塘河标注位置（湖兴路以南，河宽 50–60 m）
export const BEITANG_LABEL = P(2880, 1420);
// 荷叶：卫星图上整片湖面几乎全被荷叶盖满，只有南湖两处露出水面（下面两块，底图像素）；岸边留 2 m 水面
export const OPEN_WATER = [
  [[2095, 1108], [2106, 1112], [2112, 1145], [2117, 1183], [2140, 1200], [2160, 1208], [2140, 1216], [2100, 1215], [2060, 1210],
    [2062, 1198], [2075, 1180], [2076, 1132]],
  [[2103, 1065], [2108, 1065], [2111, 1110], [2104, 1110]],
  [[2328, 1055], [2334, 1055], [2338, 1150], [2342, 1190], [2322, 1192], [2326, 1150]],
].map(line);

// ───────── 外部道路（pts 为底图像素，w 为路面宽 m）─────────
// 太湖东路：矢量图黄色路面逐列（每 50 px）取上下沿中点；弧形南折段（y 450–575 逐行取左右沿中点）及以东取自 19 级矢量图
// （.research/map-z19-*.png），弧段以东平直向东，过龙沧路。矢量图路面宽约 55 px（26 m），按主干道取 32 m
export const TAIHU = road([
  [600, 188], [700, 204], [800, 219], [900, 234], [1000, 250], [1100, 267], [1200, 282], [1300, 300], [1400, 318],
  [1500, 330], [1580, 331], [1650, 318], [1700, 308], [1750, 296], [1800, 280], [1850, 252], [1900, 231], [1950, 210],
  [2000, 191], [2050, 174], [2100, 160], [2150, 151], [2200, 147], [2250, 148], [2300, 152], [2350, 160], [2400, 172],
  [2450, 189], [2500, 211], [2550, 239], [2597, 272], [2653, 317], [2698, 363], [2730, 408], [2766, 450], [2808, 500],
  [2851, 525], [2891, 550], [2937, 575], [3000, 595], [3050, 606], [3100, 620], [3150, 625], [3400, 625], [3700, 625],
  [3850, 625],
]);
export const TAIHU_W = 32;
// 湖西路：矢量图白色路面逐行取中点，北起太湖东路，西南至青丰路口
export const HUXI = road([
  [1800, 300], [1797, 350], [1794, 400], [1787, 450], [1771, 500], [1750, 550], [1727, 600], [1670, 700], [1635, 750],
  [1595, 800], [1540, 850], [1494, 900], [1436, 950], [1365, 1000], [1312, 1050], [1250, 1103],
]);
export const HUXI_W = 18;
// 青丰路：西起巫山路，跨澡港河，与湖西路相交后继续向东南（一条直线，矢量图逐列取中点），过北塘河后略向南偏（19 级矢量图）
export const QINGFENG = road([
  [835, 815], [883, 850], [956, 900], [1037, 950], [1100, 1000], [1150, 1039], [1200, 1078], [1250, 1105], [1300, 1157],
  [1350, 1195], [1400, 1234], [1450, 1273], [1500, 1313], [1550, 1352], [1600, 1390], [1650, 1428], [1700, 1467],
  [1750, 1507], [1800, 1547], [1850, 1590], [1900, 1650],
]);
export const QINGFENG_W = 16;
// 巫山路：太湖东路以北为黄色主路（约 17 m），以南沿澡港河西岸南下后折向西南
export const WUSHAN_N = road([[1040, 0], [1032, 50], [1000, 250]]);
export const WUSHAN_S = road([
  [990, 250], [978, 350], [975, 400], [956, 500], [948, 550], [938, 600], [924, 650], [904, 700], [878, 750], [846, 800],
  [803, 850], [748, 900], [700, 950], [620, 1000],
]);
export const WUSHAN_W = 16;
// 龙沧路：太湖东路以北为黄色主路，以南沿世茂香槟湖五期西侧南下，到北塘河边折向西南接湖兴路（19 级矢量图逐行取中点，
// 路面宽约 47 px，取 22 m）。南端与湖兴路东端相接
export const LONGCANG = road([[3696, 0], [3696, 1090]]);
export const LONGCANG_W = 22;
// 湖兴路：湖西路南端向东南，与青丰路并行后折向东，沿北塘河北岸绕到世茂香槟湖以南，经两处缓弯向东北，接龙沧路南端。
// 西段取 50 m 底图白色路面逐行中点，往东取 19 级矢量图白色路面逐列中点（中心虚线两侧合并），末段弯道逐行取中点
export const HUXING_W = 12;
export const HUXING = road([
  [1312, 1050], [1372, 1100], [1436, 1150], [1500, 1200], [1564, 1250], [1600, 1275], [1650, 1314], [1700, 1354],
  [1750, 1391], [1800, 1414], [1850, 1427], [1900, 1429], [1950, 1420], [2000, 1398], [2050, 1368], [2100, 1339],
  [2150, 1318], [2200, 1297], [2250, 1275], [2300, 1262], [2350, 1248], [2400, 1243], [2450, 1244], [2500, 1243],
  [2550, 1250], [2600, 1264], [2650, 1284], [2700, 1308], [2750, 1327], [2800, 1336], [2850, 1333], [2900, 1331],
  [2950, 1324], [3000, 1310], [3050, 1297], [3100, 1287], [3150, 1272], [3200, 1261], [3250, 1252], [3300, 1240],
  [3350, 1230], [3400, 1222], [3450, 1210], [3500, 1197], [3550, 1189], [3600, 1180], [3650, 1166], [3675, 1140],
  [3688, 1120], [3696, 1090],
]);
export const ROADS = [
  { name: '太湖东路', pts: TAIHU, w: TAIHU_W },
  { name: '湖西路', pts: HUXI, w: HUXI_W },
  { name: '青丰路', pts: QINGFENG, w: QINGFENG_W },
  { name: '巫山路', pts: WUSHAN_N, w: WUSHAN_W },
  { name: '巫山路', pts: WUSHAN_S, w: WUSHAN_W },
  { name: '湖兴路', pts: HUXING, w: HUXING_W },
  { name: '龙沧路', pts: LONGCANG, w: LONGCANG_W },
];
// 支路、小区与园区内部道路：百度 19 级矢量图白色路面的中线（data/roads.js，由 tools/vmap.html + tools/vmap.mjs 生成，底图像素），
// w 为路面宽 m（按矢量图路面宽度分 8 / 6 / 4.5 m 三档）。park：中线中点落在主园区地块内（园区路面材质、不设人行道）
export const LOCAL_ROADS = MAP_ROADS.map(({ pts, w }) => {
  const park = inPoly(pts[Math.floor(pts.length / 2)], PARK_LOT_PX);
  return { pts: line(pts), w, park };
});

// ───────── 绿地 ─────────
// 百度 19 级矢量图绿地色块的外轮廓（data/greens.js）：香槟湖西岸、南岸绿带，澡港河两岸林带，园区与小区内的绿地
export const GREENS = MAP_GREENS.map(line);

// ───────── 建筑 ─────────
// 楼栋轮廓与高度取自百度地图矢量瓦片（data/buildings.js，由 tools/buildings.mjs 生成，底图像素 P 坐标）。
// 园区各栋按轮廓中心 at（底图像素，取顶点均值）引用其中的环；百度对低层多给 6–8 m 的默认高度，园区各栋高度按航拍改写。
const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const ringAt = at => {
  let best = -1, bd = 12;
  BAIDU.forEach((o, i) => { const c = centroid(o.pts), d = Math.hypot(c[0] - at[0], c[1] - at[1]); if (d < bd) { bd = d; best = i; } });
  if (best < 0) throw new Error(`layout: 找不到中心在 ${at} 附近的百度楼栋轮廓（data/buildings.js 重新生成过？）`);
  return best;
};
const used = new Set();
const unit = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };

// 园区建筑：parts 为若干百度轮廓。h 为高度 m（数组 [低端, 高端] 表示退台，high 为高端方向上的一点，steps 为台数），
// style / floorH 缺省取整栋的设置。f 为详情卡片显示的层数（估）。
// style：ribbon 白色实墙带 + 横向带窗（阶梯形白楼）| amber 红棕玻璃 | grid 白色网格框玻璃 | podium 玻璃裙房
export const PARK_BUILDINGS = [
  { id: 'A', name: 'A 座 · 常高新 CHTC', style: 'grid', f: 15,
    info: '园区东北角的白色高层（百度地图标注「常州创意产业园 A 座 · 南门」），常高新 CHTC、常州软件园 A 幢等入驻；屋面为网格状构架。',
    // frame：屋面白色网格构架（卫星图上屋顶为 6 × 3 格的白梁，因高楼倾斜成像，屋顶影像比轮廓偏西约 20 m）
    parts: [{ at: [1598, 469], h: 62, frame: { cols: 6, rows: 3 } }] },
  { id: 'B', name: 'B 座 · 红楼', style: 'amber', f: 16, sign: true,
    info: '园区北部临澡港河的红棕色玻璃塔楼，顶部一圈白色实墙，朝南一面为「常州创意」红字；东端为通高的白色核心筒。师创教育软件研究院等入驻，南侧连一栋裙楼。',
    // crown：顶部白色实墙高 m；core：东端白色核心筒（航拍 VCG211523001516）
    parts: [{ at: [1386, 502], h: 65, crown: 9, core: true }, { at: [1408, 550], h: 16, style: 'podium', floorH: 4 }] },
  { id: 'C', name: 'C 座 · 创意产业园区 3 幢', style: 'ribbon', f: 16,
    info: '南广场北侧的阶梯形白楼：主楼自西南向东北逐级升高，南翼向南逐级跌落；白色实墙带配横向带窗。',
    parts: [
      { at: [1473, 664], h: [20, 64], high: [1590, 600], steps: 7 },
      { at: [1378, 683], h: [24, 50], high: [1450, 640], steps: 4 },
      { at: [1331, 789], h: [12, 36], high: [1320, 720], steps: 4 },
      { at: [1475, 630], h: 6, style: 'podium' },
    ] },
  { id: 'D', name: 'D 座', style: 'ribbon', f: 20,
    info: '园区西侧临澡港河的阶梯形白楼，约 20 层，北高南低；南端经会议中心裙房（X 形斜撑玻璃中庭）与 E 座相连。',
    parts: [
      { at: [1192, 701], h: [66, 81], high: [1190, 640], steps: 3 },
      { at: [1174, 770], h: [46, 61], high: [1180, 730], steps: 3 },
      { at: [1175, 823], h: 19, style: 'podium', floorH: 4.5 },
    ] },
  { id: 'E', name: 'E 座', style: 'ribbon', f: 20,
    info: '园区西南的阶梯形白楼，约 20 层，西北端最高、向东南逐级跌落。',
    parts: [{ at: [1224, 901], h: [40, 81], high: [1170, 850], steps: 6 }] },
].map(b => ({
  ...b,
  parts: b.parts.map(p => {
    const i = ringAt(p.at); used.add(i);
    const poly = line(BAIDU[i].pts);
    return { ...p, poly, dir: p.high ? unit([p.high[0] - p.at[0], p.high[1] - p.at[1]]) : null };
  }),
}));
// F 座：三栋白色弧顶低层（卫星图量取；百度只给了一个 6 m 的合并轮廓，不用）。r 为平面圆角半径 m
export const F_BLOCKS = [
  { id: 'F1', name: 'F 座 · 北楼', px: [2269, 234], w: 120, d: 38, a: -0.124, r: 14, h: 17, f: 4,
    info: 'F 座三栋白色弧顶低层中最长的一栋，北临太湖东路。' },
  { id: 'F2', name: 'F 座 · 中楼', px: [2282, 319], w: 70, d: 38, a: -0.05, r: 10, h: 13, f: 3,
    info: 'F 座中间一栋，优学东方国际教育等入驻，屋面中部有采光天井。' },
  { id: 'F3', name: 'F 座 · 南楼', px: [2226, 412], w: 106, d: 48, a: 0, r: 18, h: 14, f: 3,
    info: 'F 座最南一栋，临世茂香槟湖，屋面中部有采光天井。' },
].map(place);
// 周边建筑：其余百度轮廓（中心落在园区地块内的不要）；低于 8 m 的按 3 层住宅 / 别墅取 9.6 m
export const CONTEXT_BUILDINGS = BAIDU
  .filter((o, i) => !used.has(i) && !inPoly(centroid(o.pts), PARK_LOT_PX) && !inPoly(centroid(o.pts), F_LOT_PX))
  .map(o => ({ poly: line(o.pts), h: o.h, house: o.h < 8 }));

// 地名标注（底图像素）
export const PLACES = [
  { text: '世茂香槟湖', px: [2200, 1130] },
  { text: '水木年华花园', px: [760, 560] },
  { text: '塘岸村', px: [970, 1015] },
].map(place);
