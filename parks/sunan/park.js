import { G, PLATE, GRID_ANGLE, TOWERS, PLAZA, SOUTH_GATE } from './layout.js';
import { buildWater, buildContext } from './build/surroundings.js';
import { buildRoads } from './build/roads.js';
import { buildCampus } from './build/campus.js';
import { plantTrees } from './build/trees.js';

const HOME = { pos: [-170, 360, 640], target: [-10, 10, -10] };

// 导览章节
const A = TOWERS.find(t => t.id === 'A').pos, PL = PLAZA.pos, AX = G(37, 40);
const CHAPTERS = [
  { title: '区位', en: 'LOCATION', pos: [560, 560, 700], target: [0, 0, 0], dur: 5,
    text: '西临青洋路高架，北经青龙收费站连接线接入 G42 沪蓉高速，南沿创客路、东南望北塘河——三面路网、一面临水。' },
  { title: '西南塔楼群', en: 'LANDMARK TOWERS', pos: [A[0] + 210, 120, A[1] + 330], target: [A[0] + 20, 46, A[1] - 50], dur: 5,
    text: '41号楼主塔约 24 层，白色网格立面，楼顶「苏南智城」标识；北侧深色竖肋塔楼与之一深一浅。' },
  { title: '中轴景观带', en: 'CENTRAL AXIS', pos: [SOUTH_GATE[0] + 20, 24, SOUTH_GATE[1] + 90], target: [SOUTH_GATE[0] - 10, 10, SOUTH_GATE[1] - 80], dur: 5,
    text: '南入口环形雕塑起势，宽阔的铺装中轴向北延伸至双塔，两侧玻璃带独栋夹道，“一轴多节点”串联各组团。',
    then: { pos: [AX[0] + 10, 30, AX[1] + 40], target: [AX[0] - 25, 14, AX[1] - 160], dur: 5 } },
  { title: '风车式独栋', en: 'GARDEN OFFICES', pos: [-80, 190, 210], target: [-70, 0, 50], dur: 5,
    text: '38 栋 4–6 层花园独栋，以四合院母题风车式错位排布，单栋约 1688–1848㎡。' },
  { title: '北区 · 下沉广场', en: 'SUNKEN PLAZA', pos: [PL[0] + 90, 165, PL[1] + 240], target: [PL[0] - 5, 18, PL[1] - 40], dur: 5,
    text: '中轴北端两栋高层商务办公，下沉式商业广场与高层裙房结合，形成全天候活力空间。' },
  { title: '夜色', en: 'NIGHT', pos: [-360, 280, 420], target: [0, 20, -10], dur: 5, night: true,
    text: '华灯初上，高架与沪蓉高速车流如织。' },
];

export default {
  id: 'sunan',
  seed: 20260724,
  meta: {
    no: '02', year: 2026, model: 'MAP-REFERENCED MODEL',
    name: '苏南智城科技产业园', nameEn: 'SUNAN SMART CITY SCIENCE &amp; TECHNOLOGY PARK', sign: '苏南智城',
    region: '江苏 · 常州 · 天宁',
    headline: '三面环路，<br>一轴生长',
    intro: '青洋高架之东、沪蓉高速之南、北塘河之畔。<br>拖动场景，或播放导览动画。',
    stats: [['47', '栋', '建筑（含 38 栋独栋）'], ['13.3', 'ha', '用地 · 约 200 亩'], ['48', '万㎡', '总建筑面积']],
    accuracy: ['地图定位 · 航拍校核', '路网与轮廓取自百度 / 高德地图，体量与立面按 2026 年航拍照片重绘；层数、高度与不可见面为估算。'],
    reference: { href: 'https://www.vcg.com/creative/1673826950', title: '对照实景航拍', sub: '视觉中国 · 2026-07 ↗' },
    notes: [
      ['地址', '常州市天宁区青龙街道创客路28号'],
      ['四至', '西至青洋北路（高架），北至沪蓉高速，东、南至北塘河 / 创客路'],
      ['指标', '用地约 13.3 公顷 · 总建筑面积约 48 万㎡ · 容积率 2.5 · 绿化率 15%'],
      ['构成', '38 栋花园独栋（4–6 层）· 7 栋集中办公（17–25 层）· 2 栋配套 · 下沉式商业广场'],
      ['布局', '南侧入口，南北中轴“一轴多节点”；独栋四合院母题、风车式排布；北端双塔与下沉庭院'],
    ],
    sources: [
      '百度地图 / 高德卫星图：园区红线、内部路网、建筑轮廓与相对位置',
      '百度 50m 比例尺矢量图 + 卫星图：周边路网逐段数字化（青洋路高架及两条匝道、青洋北路、河海东路、创客路、虹阳路、沪蓉高速连接线），周边厂区 / 管理处 / 网球俱乐部体量与片林范围',
      '视觉中国 2026-07-24 航拍（VCG211673826950 / 1656866554 / 1656874856）：塔楼位置、立面色系、独栋形态',
      '<a href="https://y.qianzhan.com/yuanqu/item/443e393d6764b2d3.html" target="_blank" rel="noopener">前瞻产业园区库</a> · <a href="http://gen-design.cn/detail/21" target="_blank" rel="noopener">简和建筑设计方案</a> · <a href="http://www.czfdc.com/sjview.asp?id=2858" target="_blank" rel="noopener">常房网</a> · <a href="https://www.cztn.gov.cn/html/cztn/2019/CNPOLQOF_0619/19762.html" target="_blank" rel="noopener">天宁区政府</a>',
    ],
    disclaimer: '本模型为示意性三维重建，非测绘成果。独栋数量与排布按资料与底图推算，单体细部为程序化生成。',
  },
  plate: PLATE,
  gridAngle: GRID_ANGLE,
  stage: {
    start: [-1100, 900, 1300], maxDistance: 1800, fog: [1600, 4200],
    shadow: { left: -460, right: 460, top: 420, bottom: -420, near: 50, far: 1400 },
  },
  views: { home: HOME, top: { pos: [0.1, 820, 40], target: [0, 0, 30] } },
  growOrigin: SOUTH_GATE,
  chapters: CHAPTERS,
  // 构建顺序固定：各步依次消耗 world 随机数流，并决定标注的叠放次序
  build(ctx) {
    const water = buildWater(ctx);
    const roads = buildRoads(ctx, water);
    buildCampus(ctx);
    buildContext(ctx);
    plantTrees(ctx, { ...water, ...roads });
  },
};
