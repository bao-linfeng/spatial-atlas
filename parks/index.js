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
  {
    id: 'bigdata', no: '03',
    name: '常州大数据产业园', nameEn: 'CHANGZHOU BIG DATA PARK',
    district: '钟楼区',
    address: '玉龙南路 280 号',
    summary: '京杭运河南岸、玉龙南路西侧、玉新桥头，五栋白塔临河而立。',
    stats: [['5', '栋'], ['3.9', 'ha'], ['19', 'ha']],
    // 地址取自高德 POI「常州大数据产业园」（2026-10 查询）；坐标为估算（高德页面触发验证码未取到），待按高德 POI 核实
    lnglat: [119.92, 31.79],
  },
  {
    id: 'creative', no: '04',
    name: '常州创意产业园', nameEn: 'CHANGZHOU CREATIVE INDUSTRY PARK',
    district: '新北区',
    address: '太湖东路 · 湖西路口',
    summary: '太湖东路以南、澡港河以东，阶梯形玻璃塔楼与世茂香槟湖隔路相望。',
    stats: [['8', '栋'], ['108', 'm'], ['200+', '栋']],
    // 坐标：园区中心（底图像素 (1400, 720)）经 parks/creative/tools/reg.js 的 MERC 反算百度墨卡托，以百度地球模式读到的
    // 墨卡托—经纬度对应点（2026-11 读取）换算为 BD-09，再按标准公式转 GCJ-02；门牌待核实
    lnglat: [119.993, 31.811],
  },
];
