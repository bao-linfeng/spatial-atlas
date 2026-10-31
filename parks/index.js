// 园区登记表：系列首页按它在常州地图上落点、生成目录。新增园区时在此追加一项。
// lnglat 为高德坐标（GCJ-02），与 home/changzhou.json 的区县边界同一坐标系。
export default [
  {
    id: 'sunan', no: '02',
    name: '苏南智城科技产业园', nameEn: 'SUNAN SMART CITY',
    district: '天宁区',
    address: '创客路 28 号',
    summary: '青洋高架之东、沪蓉高速之南、北塘河之畔，三面环路，一轴生长。',
    stats: [['47', '栋'], ['13.3', 'ha'], ['48', '万㎡']],
    // 高德 POI「苏南智城科技产业园」（2026-10 查询；未认证账号只返回两位小数，精度约 ±500 m）
    lnglat: [120.03, 31.81],
  },
];
