import { createFrame } from '../../core/frame.js';
import BUILDINGS from './data/buildings.js';
import MAP_ROADS from './data/roads.js';
import MAP_GREENS from './data/greens.js';
import MAP_WATER from './data/water.js';

// 常州创意产业园 · 布局数据（以高德地图为准：主干道为手工数字化后吸附到高德路面；支路、绿地、水面、楼栋轮廓取自高德 19 级矢量图，
// 楼高取自百度矢量瓦片，园区 A–E 座按百度全景数层数改写，见 data/ 下各文件的来源说明与 PARK_BUILDINGS 的注释）
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
// 主园区：澡港河以东、太湖东路以南、湖西路以西、青丰路以北的三角形地块（沿各道路边线内收；地图未画园区面，暂以路网围合）。
// 南边沿青丰路中线向东北平移 24 px（半幅 8 m + 3.5 m），南角为它与湖西路西侧 26 px 平移线的交点
const PARK_LOT_PX = [
  [1400, 362], [1500, 372], [1600, 370], [1700, 350], [1762, 342], [1758, 450], [1730, 525], [1697, 600], [1640, 700],
  [1565, 800], [1464, 900], [1335, 1000], [1258, 1071], [1100, 944], [1060, 913], [1000, 873], [965, 849], [976, 805], [1004, 750],
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
// 中线以高德为准：先按旧的手工数字化折线（百度矢量图）把各路串起来，再用 tools/amap-roads.mjs 吸附到高德 19 级矢量图
// （.research/amap-z19.png，vmap.html?src=amap 提取的主 / 次干道中线）上：每 20 px 沿法线找同等级、同走向的高德中线，双幅路
// 取两幅中点，9 点中值平滑后按 0.7 px 简化。相对旧中线的偏移：太湖东路 ≤ 4 m、湖西路中位 3.5 m、青丰路中位 7.5 m（最大 11 m，
// 整体偏东北）、巫山路 ≤ 5 m、湖兴路中位 1.5 m、龙沧路约 3 m。路宽沿用原值（高德路面按等级画成固定宽度，不反映实际路宽）。
// 太湖东路：主干道，弧形南折段以东平直向东，过龙沧路。矢量图路面宽约 26 m，按主干道取 32 m
export const TAIHU = road([
  [623, 183], [751, 204], [771, 208], [1066, 258], [1106, 266], [1185, 278], [1382, 314], [1402, 311], [1501, 323], [1580, 324],
  [1639, 319], [1698, 308], [1756, 293], [1794, 280], [1830, 263], [1866, 246], [1995, 193], [2052, 173], [2110, 158], [2149, 151],
  [2189, 148], [2249, 147], [2289, 149], [2309, 151], [2349, 157], [2388, 166], [2408, 172], [2446, 184], [2501, 208], [2555, 236],
  [2604, 271], [2651, 308], [2694, 351], [2708, 367], [2731, 399], [2756, 430], [2805, 493], [2820, 506], [2836, 517], [2869, 540],
  [2903, 561], [2957, 589], [2996, 602], [3093, 625], [3114, 628], [3154, 632], [3829, 631],
]);
export const TAIHU_W = 32;
// 湖西路：北起太湖东路，西南至青丰路口
export const HUXI = road([
  [1807, 300], [1806, 320], [1809, 341], [1806, 360], [1804, 401], [1798, 441], [1792, 461], [1771, 518], [1739, 592], [1720, 628],
  [1680, 697], [1669, 714], [1646, 747], [1608, 794], [1594, 809], [1579, 823], [1566, 838], [1551, 851], [1510, 895], [1496, 909],
  [1433, 960], [1368, 1006], [1331, 1041], [1310, 1061], [1254, 1108],
]);
export const HUXI_W = 18;
// 青丰路：西起巫山路，跨澡港河，与湖西路相交后继续向东南（一条直线；与湖西路相交处吸附结果被路口带弯，取直），过北塘河后略向南偏
export const QINGFENG = road([
  [845, 802], [861, 813], [879, 823], [911, 845], [929, 854], [1046, 932], [1374, 1194], [1705, 1452], [1815, 1540], [1860, 1580],
  [1888, 1613],
]);
export const QINGFENG_W = 16;
// 巫山路：太湖东路以北为主路（约 17 m），以南沿澡港河西岸南下后折向西南
export const WUSHAN_N = road([[1037, 22], [1002, 250]]);
export const WUSHAN_S = road([
  [1001, 251], [984, 370], [980, 410], [966, 489], [957, 548], [949, 588], [944, 608], [932, 646], [924, 665], [907, 701],
  [878, 754], [856, 788], [845, 804], [805, 849], [775, 876], [744, 901], [702, 944], [686, 956], [668, 965], [626, 997],
]);
export const WUSHAN_W = 16;
// 龙沧路：太湖东路以北为主路，以南沿世茂香槟湖五期西侧南下，到北塘河边接湖兴路东端（路面宽取 22 m）
export const LONGCANG = road([[3691, 21], [3689, 491], [3690, 1090]]);
export const LONGCANG_W = 22;
// 湖兴路：自湖西路南段分出向东南，与青丰路并行后折向东，沿北塘河北岸绕到世茂香槟湖以南，经两处缓弯向东北，接龙沧路南端。
// 西端落在湖西路中线上，东端与龙沧路南端相接
export const HUXING_W = 12;
export const HUXING = road([
  [1331, 1041], [1385, 1086], [1590, 1244], [1745, 1372], [1793, 1404], [1811, 1411], [1849, 1421], [1868, 1424], [1888, 1426],
  [1908, 1426], [1947, 1419], [1965, 1412], [1985, 1406], [2021, 1389], [2107, 1339], [2234, 1280], [2253, 1272], [2311, 1257],
  [2331, 1253], [2350, 1248], [2390, 1244], [2510, 1243], [2570, 1249], [2609, 1260], [2647, 1274], [2684, 1289], [2702, 1298],
  [2739, 1312], [2794, 1329], [2813, 1331], [2833, 1332], [2893, 1330], [2933, 1327], [2953, 1323], [2991, 1311], [3049, 1296],
  [3088, 1288], [3166, 1268], [3205, 1260], [3244, 1253], [3322, 1235], [3401, 1220], [3498, 1196], [3537, 1189], [3576, 1179],
  [3595, 1175], [3633, 1164], [3649, 1157], [3662, 1144], [3674, 1129], [3683, 1113], [3690, 1090],
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
// 楼栋轮廓取自高德 19 级矢量图、高度按百度矢量瓦片匹配（data/buildings.js，由 tools/buildings.mjs 生成，底图像素 P 坐标）。
// 园区各栋按轮廓中心 at（底图像素，取顶点均值）引用其中的轮廓；百度对低层多给 6–8 m 的默认高度，园区各栋高度按航拍改写。
const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const ringAt = at => {
  let best = -1, bd = 12;
  BUILDINGS.forEach((o, i) => { const c = centroid(o.pts), d = Math.hypot(c[0] - at[0], c[1] - at[1]); if (d < bd) { bd = d; best = i; } });
  if (best < 0) throw new Error(`layout: 找不到中心在 ${at} 附近的楼栋轮廓（data/buildings.js 重新生成过？）`);
  return best;
};
// 多边形按直线 a–b 切开，保留 keep 所在的一侧（Sutherland–Hodgman）
const cutPoly = (poly, [a, b], keep) => {
  const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), k = Math.sign(side(keep)), out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + poly.length - 1) % poly.length], sp = side(p) * k, sq = side(q) * k;
    if ((sp >= 0) !== (sq >= 0)) { const t = sq / (sq - sp); out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]); }
    if (sp >= 0) out.push(p);
  });
  return out;
};
const used = new Set();
const unit = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
// 沿轮廓长轴（最长边方向）把朝向 toward 一侧的顶点推出 m 米
const stretch = (pts, ext) => {
  if (!ext) return pts;
  const [m, toward] = ext, c = centroid(pts);
  let u = [1, 0], best = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; u = unit([b[0] - a[0], b[1] - a[1]]); } });
  const dot = (p, v) => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1];
  if (dot(toward, u) < 0) u = [-u[0], -u[1]];
  return pts.map(p => dot(p, u) > 0 ? [p[0] + u[0] * m / PX, p[1] + u[1] * m / PX] : p);
};

// 园区建筑：parts 为若干轮廓。at 为轮廓中心；高德把几段体量画成一个轮廓的，用 cuts（若干条直线 [a, b]）切开，取 keep 点所在的一块。
// extend：[米, 底图点]，沿轮廓长轴把朝向该点的一端推出若干米（高德轮廓比实景短时用，先推再切）。
// h 为高度 m（数组 [低端, 高端] 表示退台，high 为高端方向上的一点，steps 为台数），style / floorH 缺省取整栋的设置；podium 为裙房（屋面只加设备箱）。
// ends：长轴两端的墙面换成 endwall 白色实墙（中间一列阳台）；atrium：{ w, h, t } 北立面底部的 X 形斜撑玻璃中庭，t 为中心自东端起占该边的比例。
// f 为详情卡片显示的层数。style：curtain 蓝灰玻璃幕墙配细浅色横线 | strip / stripRed 白色 / 红棕色框架配蓝色横向带窗 |
//   louver 红棕百叶与玻璃各半 | grayfin 浅灰实墙配竖向百叶 | xbrace X 形斜撑玻璃中庭
// 高度、层数与立面按百度全景八方位对照（.research/pano/<楼>.md，2026-11-01）：五栋塔楼都是 22–27 层，数窗带得出，
// 百度楼高（62–81 m）明显偏低，不再采用；层高按 4 m 计。分段依据航拍与卫星图：D、会议中心裙房、E 座在高德上是一个轮廓，C 座的主楼与南翼也是一个轮廓
const C_CUT = [[1326, 746], [1361, 768]];                      // C 座：主楼与南翼的内外转角连线
const D_CUT1 = [[1166, 745], [1215, 760]], D_CUT2 = [[1120, 805], [1220, 805]], E_CUT = [[1115, 850], [1168, 840]];
const B_CUT = [[1383, 492], [1398, 527]];                      // B 座：高德轮廓原来的西端
export const PARK_BUILDINGS = [
  { id: 'A', name: 'A 座 · 常高新 CHTC', style: 'strip', f: 25, sign: { text: '常高新 CHTC', color: '#1d5aa6', both: true },
    info: '园区东北角的高层，约 25 层：南北长立面为白色框架配蓝色横向带窗，东西两端为白色实墙加一列阳台，南北两面顶部均有「常高新 CHTC」标识。南侧为红棕百叶与玻璃幕墙的裙房。',
    // 塔楼约 25 层（全景数窗带，.research/pano/height/A-层数.png）；crown：顶部一圈白色女儿墙；frame：屋面白色网格构架（卫星图 6 × 3 格白梁）。
    // 南侧窄体量高德单独画出：约 5 层裙房，外墙一半红棕横向百叶、一半蓝玻璃（全景 B-前东角）
    parts: [{ at: [1611, 456], h: 100, crown: 5, ends: true, frame: { cols: 6, rows: 3 } },
      { at: [1615, 496], h: 20, style: 'louver', podium: true }] },
  { id: 'B', name: 'B 座 · 常州创意', style: 'stripRed', f: 25, sign: true, canopy: { w: 22, d: 12, y: 7, off: 11 },
    info: '园区北部临澡港河的高层，约 25 层，与 A 座同一款塔楼：长立面为蓝灰色横向带窗配红棕色框格，东端白色实墙，西段为浅灰实墙配竖向百叶；顶部白墙朝南一面为「常州创意」红字，南立面西段为弧形正门雨棚。',
    // 约 25 层（height/B-层数.png）。高德轮廓比实景短：西端按全景（前西角、西、前）推出 14 m，接近百度轮廓（约 57 m），推出的一段为浅灰实墙配竖向百叶；
    // crown：顶部白色实墙高 m；canopy：南立面距西端 off m 处的弧形雨棚（全景 前、前西角）
    parts: [{ at: [1437, 484], extend: [14, [1380, 515]], cuts: [B_CUT], keep: [1440, 490], h: 100, crown: 8, ends: true },
      { at: [1437, 484], extend: [14, [1380, 515]], cuts: [B_CUT], keep: [1375, 512], h: 100, style: 'grayfin' }] },
  { id: 'C', name: 'C 座 · 创意产业园区 3 幢', style: 'curtain', f: 22,
    info: '南广场北侧的阶梯形玻璃塔楼，约 22 层：主楼自西南向东北逐级升高，南翼向南逐级跌落；蓝灰色玻璃幕墙配细浅色横线，北立面底部是 X 形斜撑的通高玻璃中庭。',
    // 主楼约 22 层（height/C-层数.png），退台走向按全景 后、前西角；atrium：北立面底部约 8 层高的中庭，靠近北立面西端转角（全景 后、后西角）
    parts: [
      { at: [1415, 725], cuts: [C_CUT], keep: [1430, 690], h: [28, 90], high: [1590, 600], steps: 7, atrium: { w: 30, h: 32, t: 0.68 } },
      { at: [1415, 725], cuts: [C_CUT], keep: [1355, 820], h: [16, 44], high: [1320, 720], steps: 4 },
    ] },
  { id: 'D', name: 'D 座', style: 'curtain', f: 27,
    info: '园区西侧临澡港河的阶梯形玻璃塔楼，约 27 层，北高南低，北塔顶部为双峰；南端经会议中心裙房（X 形斜撑玻璃幕墙）与 E 座相连。',
    // 北塔约 27 层（height/D-层数.png），双峰顶与 3 级退台吻合（全景 后东角）；会议中心裙房东西两面为 X 形斜撑（全景 东、西），floorH 取 h / 8 使一张贴图一个 X
    parts: [
      { at: [1208, 813], cuts: [D_CUT1], keep: [1195, 700], h: [90, 108], high: [1190, 640], steps: 3 },
      { at: [1208, 813], cuts: [D_CUT1, D_CUT2], keep: [1165, 775], h: [61, 81], high: [1180, 730], steps: 3 },
      { at: [1208, 813], cuts: [D_CUT2, E_CUT], keep: [1165, 825], h: 22, style: 'xbrace', floorH: 2.75, podium: true },
    ] },
  { id: 'E', name: 'E 座', style: 'curtain', f: 24,
    info: '园区西南的阶梯形玻璃塔楼，约 24 层，西北端最高、向东南逐级跌落，顶部有斜切的标识墙。',
    // 约 24 层另加顶部标识墙（height/E-层数.png），北高南低（全景 东、后东角）
    parts: [{ at: [1208, 813], cuts: [E_CUT], keep: [1220, 910], h: [50, 100], high: [1170, 850], steps: 6 }] },
].map(b => ({
  ...b,
  parts: b.parts.map(p => {
    const i = ringAt(p.at); used.add(i);
    const px = (p.cuts || []).reduce((poly, cut) => cutPoly(poly, cut, p.keep), stretch(BUILDINGS[i].pts, p.extend));
    const c = centroid(px);
    return { ...p, poly: line(px), dir: p.high ? unit([p.high[0] - c[0], p.high[1] - c[1]]) : null };
  }),
}));
// F 座：三栋白色弧顶低层（卫星图量取；百度只给了一个 6 m 的合并轮廓，不用）。r 为平面圆角半径 m
export const F_BLOCKS = [
  { id: 'F1', name: 'F 座 · 北楼', px: [2269, 234], w: 120, d: 38, a: -0.124, r: 14, h: 17, f: 4,
    info: 'F 座三栋白色弧顶低层中最长的一栋，北临太湖东路。' },
  { id: 'F2', name: 'F 座 · 中楼', px: [2282, 319], w: 70, d: 38, a: -0.05, r: 10, h: 13, f: 3,
    info: 'F 座中间一栋，优学东方国际教育等入驻，屋面中部有采光天井。' },
  { id: 'F3', name: 'F 座 · 南楼', px: [2230, 407], w: 106, d: 48, a: 0, r: 18, h: 14, f: 3,
    info: 'F 座最南一栋，临世茂香槟湖，屋面中部有采光天井。' },
].map(place);
// 周边建筑：其余轮廓（中心落在园区、F 座地块内的不要）；低于 8 m 的（含百度没有对应、h 为 0 的）按 3 层住宅 / 别墅取 9.6 m
export const CONTEXT_BUILDINGS = BUILDINGS
  .filter((o, i) => !used.has(i) && !inPoly(centroid(o.pts), PARK_LOT_PX) && !inPoly(centroid(o.pts), F_LOT_PX))
  .map(o => ({ poly: line(o.pts), h: o.h, house: o.h < 8 }));

// 地名标注（底图像素）
export const PLACES = [
  { text: '世茂香槟湖', px: [2200, 1130] },
  { text: '水木年华花园', px: [760, 560] },
  { text: '塘岸村', px: [970, 1015] },
].map(place);
