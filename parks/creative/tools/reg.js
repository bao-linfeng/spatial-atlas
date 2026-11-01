// 参考截图 → 底图像素 P（docs/area-50m-map.png 的像素坐标）的配准：[a, b, c, d, e, f]，x = a·u + b·v + c，y = d·u + e·v + f。
// 以各图共有的 POI 定位针针尖（tools/crop.html?raw 读截图自身像素）最小二乘拟合相似变换。
// 卫星图与同视野矢量图共用变换（两种模式下定位针的绘制偏移约 4 屏幕像素，是图标样式差异而非视野平移）。
// park-20m：麦当劳、常高新 CHTC、芝麻管家、盒子艺术、德馨幼儿园 5 点，残差 ≤ 1.9 px（约 0.9 m）
const PARK20 = [0.753676, 0.00056, 338.8167, -0.00056, 0.753676, 165.3394];
// lake-50m：另一缩放级（50 m 比例尺 91 px，底图 104 px），麦当劳、常高新 CHTC、盒子艺术 3 点，残差 ≤ 0.3 px；德馨幼儿园校核差约 2.7 px
const LAKE50 = [1.138311, 0.001614, 783.199, -0.001614, 1.138311, 43.8527];

// amap-100m：用户给的高德 100 m 比例尺矢量图（amap.com 网页截图，对照用）。以水面色块与百度水面的 IoU 最大拟合相似变换（IoU 0.74）
const AMAP100 = [1.624338, 0.004315, 649.391548, -0.004315, 1.624338, 38.719028];

// 高德（GCJ-02）Web 墨卡托 (X, Y)（米，Y 向北）→ P：P.x = s·X + c，P.y = −s·Y + f，不含旋转。
// 拟合：.research/amap-z19.png 的水面色块 (130,220,250) 与百度 19 级矢量图提取的水面（改用高德数据前的 data/water.js）IoU 最大，
// IoU 0.747；放开旋转只升到 0.748（旋转 −0.2°），按两家坐标系之间理应只有平移取 0。主干道吸附时太湖东路西段、巫山路两家相差 ≤ 2 m
export const AMAP_MERC = { s: 1.776352051, c: -23726292.4116, f: 6641663.57279 };
const R_EARTH = 6378137;
export const gcjMerc = ([lng, lat]) => [R_EARTH * lng * Math.PI / 180, R_EARTH * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
// 高德 JSAPI 截图（.research/amap-*.png，元数据见同名 json，capture 用 deviceScaleFactor 1）：css 像素 (u, v) → P。
// 每 css 像素 2πR / 256 / 2^zoom 墨卡托米，视口中心为 center
function amap({ center, zoom, size: [w, h] }) {
  const r = 2 * Math.PI * R_EARTH / 256 / 2 ** zoom, [Xc, Yc] = gcjMerc(center), { s, c, f } = AMAP_MERC;
  return [s * r, 0, s * (Xc - w / 2 * r) + c, 0, s * r, -s * (Yc + h / 2 * r) + f];
}
// 19 级整幅（6160 × 3170，覆盖沙盘外扩约 30 m）：amap-z19.png 只留底色 / 道路 / 楼栋、不带标注，供 vmap.html?src=amap 提取；
// amap-z18-label.png 同视野、18 级带标注（19 级整幅截图时标注层不出图），供对照路名、POI
const AMAP19 = amap({ center: [119.996979, 31.810573], zoom: 19, size: [6160, 3170] });

// 百度墨卡托 (X, Y) → P：P.x = a·X − b·Y + c，P.y = −b·X − a·Y + f（Y 向北，P 向南）。
// 在已知中心、缩放级的截图（.research/baidu-pano-z18.png）上自动识别 5 个定位针针尖（麦当劳、常高新 CHTC、盒子艺术、
// 之上便利店、优学东方）与底图拟合，残差 ≤ 1.2 px（约 0.6 m），旋转约 0.01°
export const MERC = { a: 1.791207191633969, b: 0.0002581666805967686, c: -23925317.581810083, f: 6661420.080921134 };
// 百度地图网页截图（.research/*-z19-*.png，元数据见同名 json）：设备像素 (u, v) → 容器像素 (u / dpr, v / dpr − top)，
// 每 css 像素 2^(18 − zoom) 墨卡托单位，centerPx 处为 center
function baidu({ center: [cx, cy], centerPx: [px, py], zoom, rect: [, top], dpr }) {
  const r = 2 ** (18 - zoom), k = r / dpr;
  const X0 = cx - px * r, Y0 = -cy - (py + top) * r;       // u = v = 0 处的 X 与 −Y
  const { a, b, c, f } = MERC;
  return [a * k, b * k, a * X0 + b * Y0 + c, -b * k, a * k, -b * X0 + a * Y0 + f];
}
// 全景路线图层（.research/pano-z19-*.png）：19 级 2 列 × 3 行，覆盖扩大前的沙盘 (650, 50)–(2800, 1350)
const PANO19 = [[13358290, 3716852], [13358890, 3716852], [13358290, 3716639], [13358890, 3716639], [13358290, 3716426], [13358890, 3716426]];
const tiles = {};
PANO19.forEach((center, i) => {
  tiles[`.research/pano-z19-${i}.png`] = baidu({ center, centerPx: [854, 421], zoom: 19, rect: [0, -23.3333], dpr: 1.5 });
});
// 普通矢量图（.research/map-z19-*.png）：19 级 3 列 × 3 行，覆盖扩大后的沙盘 (650, 50)–(3800, 1600)；页面 UI 已隐藏，容器满屏
export const MAP19 = [3716790, 3716510, 3716230].flatMap(y => [13358440, 13359070, 13359700].map(x => [x, y]));
MAP19.forEach((center, i) => {
  tiles[`.research/map-z19-${i}.png`] = baidu({ center, centerPx: [949, 468], zoom: 19, rect: [0, 0], dpr: 1.35 });
});

// 卫星图（地球模式，.research/sat-z19-*.png）：地球引擎用透视相机，实际缩放 18.91，x / y 分辨率差约 0.5%，
// 因此按容器像素 (0,0)、(1000,0)、(0,1000) 处的墨卡托坐标（pixelToPoint 读出，见同名 json）逐块做仿射
function earth([p00, p10, p01], dpr = 1.5) {
  const { a, b, c, f } = MERC;
  const k = 1 / (1000 * dpr);
  // 设备像素 → (X, −Y)：线性部分与平移
  const xu = (p10[0] - p00[0]) * k, xv = (p01[0] - p00[0]) * k, yu = -(p10[1] - p00[1]) * k, yv = -(p01[1] - p00[1]) * k;
  const X0 = p00[0], Y0 = -p00[1];
  return [a * xu + b * yu, a * xv + b * yv, a * X0 + b * Y0 + c, -b * xu + a * yu, -b * xv + a * yv, -b * X0 + a * Y0 + f];
}
const SAT19 = [
  [[13357873.76, 3717056.16], [13358361.35, 3717056.16], [13357873.78, 3716570.96]],
  [[13358473.88, 3717056.16], [13358961.48, 3717056.16], [13358473.90, 3716570.95]],
  [[13357874.01, 3716843.18], [13358361.55, 3716843.18], [13357874.03, 3716358.03]],
  [[13358474.00, 3716843.20], [13358961.46, 3716843.21], [13358474.01, 3716358.13]],
  [[13357873.66, 3716630.15], [13358361.36, 3716630.15], [13357873.67, 3716144.84]],
  [[13358473.76, 3716630.15], [13358961.47, 3716630.15], [13358473.77, 3716144.83]],
];
SAT19.forEach((corners, i) => { tiles[`.research/sat-z19-${i}.png`] = earth(corners); });

export const REG = {
  'area-50m-map.png': [1, 0, 0, 0, 1, 0],
  'area-50m-sat.png': [1, 0, 0, 0, 1, 0],
  'park-20m-map.png': PARK20,
  'park-20m-sat.png': PARK20,
  'lake-50m-map.png': LAKE50,
  'amap-100m-map.png': AMAP100,
  '.research/amap-z19.png': AMAP19,
  '.research/amap-z18-label.png': amap({ center: [119.996979, 31.810573], zoom: 18, size: [3080, 1585] }),
  '.research/baidu-pano-z18.png': baidu({ center: [13358712.006, 3716594.774], centerPx: [854, 421], zoom: 18, rect: [0, -23.3333], dpr: 1.5 }),
  ...tiles,
};
