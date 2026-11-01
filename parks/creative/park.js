import { P, PLATE, GRID_ANGLE, F_BLOCKS } from './layout.js';
import { buildWater } from './build/water.js';
import { buildGreens } from './build/greens.js';
import { buildRoads } from './build/roads.js';
import { buildCampus } from './build/campus.js';
import { buildContext } from './build/context.js';
import { plantTrees } from './build/trees.js';

// 主视角：自东向西望园区（与视觉中国航拍同向；东南方向有世茂香槟湖 4 期高层遮挡）
const HOME = { pos: [190, 310, 110], target: [-390, 20, -70] };

// 导览章节（框架阶段的占位文字，待内容定稿后改写）
const A = P(1400, 720), F = F_BLOCKS.find(b => b.id === 'F2').pos, LK = P(2250, 1000);
const CHAPTERS = [
  { title: '区位', en: 'LOCATION', pos: [300, 1050, 1250], target: [-80, 0, -30], dur: 5,
    text: '太湖东路以南、澡港河以东，湖西路与青丰路围合出三角形的主园区；东侧隔湖西路是 F 座与世茂香槟湖，再往东到龙沧路。' },
  { title: '主楼群', en: 'MAIN CAMPUS', pos: [A[0] + 200, 160, A[1] + 220], target: [A[0] - 40, 30, A[1]], dur: 5,
    text: 'C、D、E 三栋阶梯形玻璃塔楼围合南广场，北侧是 A 座与 B 座两栋同款塔楼（白框蓝窗 / 红棕框格），西侧临澡港河。' },
  { title: 'F 座', en: 'BLOCK F', pos: [F[0] + 120, 90, F[1] + 170], target: [F[0], 8, F[1]], dur: 5,
    text: '湖西路以东三栋白色弧顶低层，北临太湖东路，南望世茂香槟湖。' },
  { title: '世茂香槟湖', en: 'CHAMPAGNE LAKE', pos: [LK[0] + 160, 200, LK[1] + 260], target: [LK[0] - 40, 0, LK[1] - 60], dur: 5,
    text: 'C 形湖面环抱别墅半岛，夏季满湖荷叶。' },
  { title: '环路', en: 'RING ROAD', pos: [900, 640, 700], target: [330, 0, 20], dur: 5,
    text: '太湖东路、龙沧路、湖兴路与湖西路围出环湖街区，湖兴路沿北塘河北岸接回龙沧路，车流沿环路循环。' },
  { title: '夜色', en: 'NIGHT', pos: [190, 300, 460], target: [-320, 20, -40], dur: 5, night: true,
    text: '华灯初上，太湖东路车流不息。' },
];

export default {
  id: 'creative',
  seed: 20261101,
  meta: {
    no: '04', year: 2026, model: 'MAP-REFERENCED MODEL',
    name: '常州创意产业园', nameEn: 'CHANGZHOU CREATIVE INDUSTRY PARK', sign: '常州创意',
    region: '江苏 · 常州 · 新北',
    headline: '河湖之间，<br>高楼叠阶',
    intro: '太湖东路以南、澡港河以东、世茂香槟湖之西。<br>拖动场景，或播放导览动画。',
    stats: [['8', '栋', '园区楼宇（A–E 座、F 座三栋）'], ['108', 'm', '最高楼（D 座，约 27 层）'], ['200+', '栋', '周边楼栋（高德轮廓）']],
    accuracy: ['地图数据 · 航拍校核', '以高德地图为准：楼栋轮廓、支路、绿地、水面取自高德 19 级矢量图，主干道中线吸附到高德路面；周边楼高取自百度矢量瓦片；园区 A–E 座的层数与楼高按百度全景数窗带估算（百度楼高对这几栋明显偏低），退台、立面、中庭、雨棚按航拍与全景八方位对照重绘，周边楼栋为轮廓挤出的概念体量。'],
    reference: { href: 'https://www.vcg.com/creative/1404207800', title: '对照实景航拍', sub: '视觉中国 · VCG211404207800 ↗' },
    notes: [
      ['地址', '常州市新北区太湖东路以南、湖西路以西（门牌待核实）'],
      ['范围', '西至巫山路、澡港河，北至太湖东路，东至龙沧路，南至北塘河；约 1510 m × 745 m'],
      ['园区', 'A 座（常高新 CHTC）与 B 座（常州创意）为两栋约 25 层的同款塔楼，阶梯形玻璃塔楼 C / D / E 座（22–27 层）围合南广场；F 座三栋白色弧顶低层位于湖西路以东'],
      ['周边', '水木年华花园、塘岸村、世茂香槟湖（别墅半岛、南区、三期、五期）、北塘河'],
      ['路网', '太湖东路、龙沧路、湖兴路、湖西路在沙盘内围成闭环'],
    ],
    sources: [
      '高德地图（JSAPI 19 级矢量图整幅截图，.research/amap-z19.png；对照用户给的 100 m 比例尺截图 docs/amap-100m-map.png）：楼栋轮廓、支路、绿地、水面（tools/vmap.html?src=amap + vmap.mjs → data/roads.js、greens.js、water.js；buildings.mjs → data/buildings.js），主干道中线吸附（tools/amap-roads.mjs）；以水面与百度数据拟合配准（tools/reg.js 的 AMAP_MERC）',
      '百度地图矢量图（50 m / 20 m 比例尺）与同视野卫星图：底图坐标（P）、地名；以 POI 定位针配准各截图（parks/creative/tools/reg.js）',
      '百度地图网页（19 级）：矢量瓦片中的楼栋高度（按高德轮廓平移匹配）、主干道的初始数字化、卫星图（F 座三栋弧顶楼、湖面荷叶与露水面处、A 座屋顶构架）',
      '视觉中国航拍（VCG211349735243 等 19 张，parks/creative/docs/）：楼群形态与退台、B 座顶部白墙标识、香槟湖荷塘与别墅半岛',
      '百度全景（2017–2022 年街景，.research/pano/，各楼八方位与同机位模型对照）：园区八栋的层数与楼高、立面材质、C 座与会议中心的 X 形斜撑中庭、B 座西段与正门雨棚、A 座标识与裙房',
    ],
    disclaimer: '本模型为示意性三维重建，非测绘成果。周边楼栋按高德轮廓挤出、高度取百度数据（据园区楼核对，百度楼高对高层可能偏低），低层建筑高度统一取 3 层；园区沿湖西路的场地高差未建；楼名 A–F 依百度地图标注。',
  },
  plate: PLATE,
  ground: { fields: 40 },
  gridAngle: GRID_ANGLE,
  stage: {
    start: [-1400, 1100, 1600], maxDistance: 2400, fog: [2200, 5400],
    shadow: { left: -820, right: 820, top: 560, bottom: -560, near: 50, far: 2000 },
  },
  views: { home: HOME, top: { pos: [0.1, 1500, 40], target: [0, 0, 30] } },
  growOrigin: P(1480, 800),
  chapters: CHAPTERS,
  // 构建顺序固定：各步依次消耗 world 随机数流，并决定标注的叠放次序
  build(ctx) {
    const water = buildWater(ctx);
    buildGreens(ctx);
    const roads = buildRoads(ctx);
    buildCampus(ctx);
    buildContext(ctx);
    plantTrees(ctx, { ...water, ...roads });
  },
};
