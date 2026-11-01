import { P, PLATE, GRID_ANGLE, TOWERS, STUDIO } from './layout.js';
import { buildWater, canalHole } from './build/water.js';
import { buildRoads } from './build/roads.js';
import { buildCampus } from './build/campus.js';
import { buildGreens, buildContext, buildHousing } from './build/context.js';
import { plantTrees } from './build/trees.js';

const HOME = { pos: [-150, 300, 470], target: [110, 10, -40] };

// 导览章节
const A = TOWERS[0].pos, C = STUDIO.pos, BR = P(1520, 168), CB = P(1180, 120), XG = P(820, 560);
const CHAPTERS = [
  { title: '区位', en: 'LOCATION', pos: [520, 520, 640], target: [60, 0, -20], dur: 5,
    text: '北临京杭运河，东倚玉龙南路，玉兰路、银杏路、董子河西路与玉龙南路围合成片区；园区居片区东北角，隔河与运河路相望。' },
  { title: '五栋白楼', en: 'WHITE TOWERS', pos: [A[0] + 160, 150, A[1] + 240], target: [A[0] - 90, 50, A[1] - 30], dur: 5,
    text: '园区内两栋、红线以西三栋，五栋约 20–23 层的白色塔楼一字排开：白色实墙、方形窗洞，楼顶一角是橙色标识。' },
  { title: '玉新桥', en: 'YUXIN BRIDGE', pos: [BR[0] - 90, 26, BR[1] + 70], target: [BR[0] + 10, 0, BR[1] - 5], dur: 5,
    text: '玉龙南路跨京杭运河的低平三跨梁桥，桥宽约 40 m；石栏板、方柱，桥侧一绿一黄两根管线。' },
  { title: '运河绿带', en: 'CANAL PARK', pos: [CB[0] - 150, 60, CB[1] + 40], target: [CB[0] + 60, 0, CB[1] - 40], dur: 5,
    text: '运河南岸与玉兰路之间是一条约 70 m 宽的林带，石砌驳岸外设亲水步道，向西经仕庄桥接白鹤河公园。' },
  { title: '文创楼 · 屋顶球场', en: 'ROOFTOP COURTS', pos: [C[0] + 70, 80, C[1] + 90], target: [C[0], 8, C[1]], dur: 5,
    text: '园区北部的四合院式文创楼，影视、传媒企业聚集；东南裙房屋顶铺设篮球、网球场地。' },
  { title: '星港花苑', en: 'NEIGHBORHOOD', pos: [XG[0] - 120, 220, XG[1] + 300], target: [XG[0] + 40, 0, XG[1] - 40], dur: 5,
    text: '园区西南是成片的多层住宅星港花苑，白鹤河两岸带状公园沿董子河路伸展。' },
  { title: '夜色', en: 'NIGHT', pos: [-260, 260, 380], target: [120, 20, -40], dur: 5, night: true,
    text: '华灯初上，玉龙南路车流不息，白楼窗灯映在运河上。' },
];

export default {
  id: 'bigdata',
  seed: 20261031,
  meta: {
    no: '03', year: 2026, model: 'MAP-REFERENCED MODEL',
    name: '常州大数据产业园', nameEn: 'CHANGZHOU BIG DATA INDUSTRIAL PARK', sign: '大数据产业园',
    region: '江苏 · 常州 · 钟楼',
    headline: '运河之畔，<br>五塔临风',
    intro: '京杭运河南岸、玉龙南路西侧、玉新桥头。<br>拖动场景，或播放导览动画。',
    stats: [['5', '栋', '白色塔楼（园区内 2 栋）'], ['3.9', 'ha', '园区面积（百度地图面）'], ['19', 'ha', '片区 · 四路围合']],
    accuracy: ['地图定位 · 航拍校核', '路网取自百度矢量图，河岸、绿地、建筑轮廓取自卫星图，体量与立面按航拍照片重绘；层数、高度与不可见面为估算。'],
    reference: { href: 'https://www.vcg.com/creative/1452883496', title: '对照实景航拍', sub: '视觉中国 · VCG211452883496 ↗' },
    notes: [
      ['地址', '常州市钟楼区玉龙南路 280 号（玉兰路以南、玉龙南路以西，北临京杭运河）'],
      ['片区', '玉兰路、玉龙南路、银杏路、董子河西路围合，约 19 公顷；沙盘外扩 100–200 m'],
      ['园区', '百度地图「常州大数据产业园」面约 3.9 公顷：两栋白色塔楼（约 23 层）、四合院式文创楼、裙房、常州青商大厦与配套'],
      ['周边', '红线以西三栋同风格白塔（常州数字经济产业园）、星港花苑住宅区、白鹤河带状公园、阿里巴巴内容中心（常州基地）'],
      ['桥梁', '玉新桥：玉龙南路跨京杭运河，图册载长 60.78 m、宽 40.6 m、三跨简支板梁；为突出桥墩，运河水面做了下沉处理'],
    ],
    sources: [
      '百度地图矢量图（20 m / 50 m 比例尺）：道路中线、园区面、地名；以园区面 8 个折点配准各截图（parks/bigdata/tools/reg.js）',
      '百度卫星图：运河与白鹤河岸线、绿地与林带、建筑屋面位置（按高楼倾斜回推落地位置）与屋面配色（parks/bigdata/build/roofs.js）',
      '视觉中国航拍（VCG211452883135 / 883221 / 883400 / 883496 / 883574）：塔楼立面、层数、裙房与玉龙南路断面',
      '<a href="https://www.sohu.com/a/729614164_121123904" target="_blank" rel="noopener">2023 年园区航拍（克而瑞常州）</a> · <a href="http://www.china-qiao.com/ql16/czql/czql012.htm" target="_blank" rel="noopener">老百晓集桥 · 玉新桥</a>',
    ],
    disclaimer: '本模型为示意性三维重建，非测绘成果。住宅楼栋按片区程序化排布，单体细部为程序化生成；楼名 A–J 为本模型编号。',
  },
  plate: PLATE,
  ground: { fields: 40, holes: [canalHole(PLATE)] },
  gridAngle: GRID_ANGLE,
  stage: {
    start: [-1100, 900, 1300], maxDistance: 1800, fog: [1600, 4200],
    shadow: { left: -460, right: 460, top: 420, bottom: -420, near: 50, far: 1400 },
  },
  views: { home: HOME, top: { pos: [0.1, 1250, 40], target: [0, 0, 30] } },
  growOrigin: P(1170, 370),
  chapters: CHAPTERS,
  // 构建顺序固定：各步依次消耗 world 随机数流，并决定标注的叠放次序；住宅须在路网与建筑登记之后排布
  build(ctx) {
    buildGreens(ctx);
    const water = buildWater(ctx);
    const roads = buildRoads(ctx, water);
    buildCampus(ctx);
    buildContext(ctx);
    buildHousing(ctx);
    plantTrees(ctx, { ...water, ...roads });
  },
};
