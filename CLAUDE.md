# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「空间档案 · SPATIAL ATLAS」园区三维沙盘系列。`core/` 是系列共用的引擎和页面外壳，`parks/<id>/` 是各园区（目前有 `sunan` 02 号苏南智城科技产业园、`bigdata` 03 号常州大数据产业园、`creative` 04 号常州创意产业园（框架阶段））。纯静态页面，原生 ES Module + three.js（0.169.0，经各园区 `index.html` 中的 importmap 从 registry.npmmirror.com CDN 加载）。没有 package.json、构建步骤或 lint。

## 运行

```bash
node server.mjs          # http://127.0.0.1:5191/（系列首页），苏南在 /parks/sunan/；可传端口：node server.mjs 8080
```

服务器以仓库根目录为根，园区代码用相对路径（`../../core/...`）引用核心，所以必须从根目录起服务。URL 参数：`?night` 以夜景开场，`?tour` 开场后自动播放导览。

## 回归检查

```bash
MSYS_NO_PATHCONV=1 node tools/regress.mjs <playwright-core/index.mjs 的绝对路径> [--park sunan] [--update]
```

不安装依赖，借用本机已有的 Playwright（例如 `D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs`，对应已装的 chromium-1234）。脚本冻结页面时钟，只用 `__park.advance()` 推进时间，按固定顺序截 7 张图并统计场景数据（建筑、树、车、网格、顶点数、车流异常点 `carJumps` / `carHops` / `carFlips`，见下文「车流」），与 `verification/baseline/<park>/` 逐像素比对；差异图写到 `verification/current/<park>/*.diff.png`。

- 纯重构必须通过回归；有意改变画面时，确认截图后用 `--update` 重拍基准，并在提交信息里说明。
- Git Bash 下要加 `MSYS_NO_PATHCONV=1`，否则 `--path /` 这类参数会被改写成 Windows 路径。

### 确定性（改代码前必读）

- 所有随机数走 `core/rng.js` 的分流：`facade`（立面）、`texture`（路面水面）、`world`（场景构建，园区代码用 `ctx.rand`）、`trees`、`cars`。**不要用 `Math.random`**。
- 同一流内的结果取决于调用顺序。`park.build(ctx)` 里各步的先后顺序决定 world 流的消耗、材质 / 对象的创建次序（影响绘制排序）和标注叠放次序，调整顺序等于改画面。

## 架构

### 园区接入：`park.js`

每个园区导出一个配置对象（字段说明见 `core/viewer.js` 顶部注释）：`seed`、`meta`（页面文字，`core/ui.js` 按它生成整套 DOM，文字按 HTML 片段插入）、`plate`（沙盘范围，场景米）、`gridAngle`、`stage`（尺度相关参数，覆盖 `core/stage.js` 的默认值）、`views`、`growOrigin`、`chapters`（导览，格式见 `core/tour.js`）和 `build(ctx)`。园区 `index.html` 只保留 `<head>` 并调用 `createViewer(park)`。

新增园区还要在 `parks/index.js` 登记一项（编号、名称、所在区县、`lnglat` 高德坐标、目录摘要），系列首页（根目录 `index.html` + `home/`）据此在常州区县图上落点并生成目录；`district` 须与 `home/changzhou.json` 中的区县名一致，悬停时才能高亮对应区县。这里的名称和指标与 `park.js` 的 `meta` 是两份，改动时同步。

### 构建流程

`createViewer` → `createContext`（材质、world 分组、登记表）→ `buildPlate`（底座和农田底色）→ `park.build(ctx)` → `finalize`（过滤并生成树、车流、路灯）。

`ctx`（`core/context.js`）是园区与核心之间的约定。园区往登记表里放东西，由核心统一消费：
- `buildings` / `pickables` / `labels`：点选、标注、生长动画。建筑统一用 `core/kit/buildings.js` 的 `placeBuilding` / `tower` 登记，返回的 `grow` 分组用于生长缩放；完成后要设 `root.userData.height`。
- `treeSpots` / `lampSpots` / `carPaths`：最终在 `finalize` 里生成实例化网格。
- `blockers`：种树避让区（道路、河道、建筑矩形）。`elevatedRoad` 的桥墩也会避开已登记的道路，所以登记顺序有影响。
- `nightables`：夜景时 `emissiveIntensity = t × k`，用 `ctx.night(material, k)` 注册。
- `park.ground`（可选）传给 `buildPlate`：`holes` 在底座顶面开洞（下沉河道，洞内水面和驳岸由园区自绘），`fields` 为底色色块数。不传时与原先完全一致。
- 需要单独分组时用 `ctx.addGroup('park')` / `ctx.addGroup('context')`；`placeBuilding` 加入 `ctx.park`，`contextBox` 加入 `ctx.context`。

`core/kit/` 是可复用构件：`ground`（底座、河道、池塘）、`roads`（地面道路、逐点高程的高架 / 匝道）、`buildings`（体量、屋面、塔楼、周边体量）、`scatter`（行道树、散植、片林、树丛）、`instances`（树、车、路灯的 InstancedMesh / Points）。车辆沿车道折线行驶，路口靠 `core/lanes.js` 拼接（见下文「车流」）。

具体的路网组合（青洋高架主线、匝道等）留在各园区的 `build/`。只有出现第二个用例时，才往 core 里提炼。

### 车流

车辆沿 `carPaths` 折线循环行驶，`s` 到头就回绕到起点，所以**每条车道要么首尾相接成闭环，要么两头都在沙盘边缘**（离边缘 25 m 内的回绕看不出来）。`tools/carcheck.js` 按 0.05 s 步进 6000 帧，把沙盘内部的异常分三类计数（`tools/jump.html` 和回归检查共用，基准要求三类都为空）：

| 类别 | 现象 | 常见成因 | 修法 |
| --- | --- | --- | --- |
| `jump`（单帧位移 > 6 m） | 车在路中凭空消失、在别处出现 | ① 主干道止于丁字路口，车道开到路口就回绕；② 同一条路分段数字化（隔路口相对的两段、过桥断开）；③ 道路数字化截短，端点没到沙盘边缘 | ① 用 `route` 把车道在路口转入相交道路，串成「边缘进、边缘出」的路线；② 两段中线拼成一条再取车道（端点错开时换成中点，免得路口里横移）；③ 照底图把道路补到沙盘边缘（创意园青丰路南段） |
| `hop`（单帧 2.5–6 m） | 车横移到对侧 | 往返车道在尽头直接折返、拼接点错位 | 尽头用 `shuttleLane` 半圆掉头 |
| `flip`（单帧转向 > 100°） | 原地调头 | 同上 | 同上 |

`core/lanes.js` 的工具（车道 `{ pts, ys }` 均按行驶方向，右侧通行，横向偏移 > 0 在行驶方向右侧）：
- `laneOn(pts, o, y)`：道路中线上偏移 o 米的车道，o > 0 顺中线方向，o < 0 逆向。
- `route(a, b, [c, r], ...)`：依次 `turnLane` 转入后续车道。右转从外侧车道转入外侧车道（r 取默认 9 m），左转从内侧车道转入内侧车道（r ≈ 12 m）。`turnLane` 把两条车道各延长 40 m 求交，交点取沿 a 的最后一个，所以 a 可以是已经拼接过的长路线。
- `shuttleLane(pts, o, y, open)`：往返车道，尽头半圆掉头（半径 o）。`finalize` 自动把带 `offset` 的双向单车道小路（groundRoad 的 `lanes: [[0, ±1]]` + `offset`）中端点落在沙盘内部的改成往返车道，园区代码不用管。

做法约定：
- 主干道的丁字路口一律转向拼接，不用往返掉头；路线的车辆数按路线长度给（每条 2–4 辆），`speed` 的随机数每条路线取一次。现有用例：苏南青洋北路 × 河海东路 / 虹阳路、大数据园董子河东 / 西路 × 玉兰路、创意园湖西路 / 青丰路西端 / 湖兴路西端 / 龙沧路 × 太湖东路 / 巫山路南北段。
- 围成街区的几条主干道可以拼成闭环路线：`route` 最后转回起始车道，再截去重叠段使首尾相接（创意园 `build/roads.js` 的 `closeLoop`，太湖东路—龙沧路—湖兴路—湖西路顺、逆时针各一圈）。顺弯道相连的两条路（龙沧路南端拐入湖兴路）把中线拼成一条再取车道。
- 为了不改动场景其余部分，改车流时尽量保持 world 流的消耗次数不变（例如原来每条路一次 `rand()`，改成路线后仍只取一次）。车辆数一变，cars 流在后续车道上的取值全部错位，车的位置都会变，需要重拍基准。
- 支路尽头目前只是半圆掉头。更细的做法是让支路在主干道路口右转汇入（需要支路与主干道的连接关系，vmap.mjs 的「尽头接到主干道中线」已经有端点信息），留待以后。

### 页面

标注是 DOM 元素，每帧投影到屏幕（`core/labels.js`），不是 three.js 精灵。立面风格见 `core/textures.js` 的 `STYLES`（`punch` 白墙方窗为大数据园塔楼所加）。立面材质由 `facadeMaterial(style, widthM, floors)` 按 `style|开间数|层数` 缓存，并登记到 `facadeMaterials`，夜景和白模统一切换它们。所有动画走 `core/motion.js` 的 tween，由 `tick(dt)` 驱动，`advance(sec, step)` 可手动步进。`window.__park` 暴露 `{ scene, camera, controls, W, fly, runTour, applyNight, advance, toggleNight, select }`。

## 苏南：坐标系（最关键）

- 底图像素由 `P(x, y)` 换算为场景米（x 向东，z 向南；0.48 m/像素，原点为底图像素 `(1000, 560)`）。园区内部路网偏转约 12.7°（`GRID_ANGLE`），园区内对象用网格坐标 `G(u, v)`：u 沿东西主路，v 沿中轴向南，单位同为像素。`P` / `G` / `GRID_ANGLE` 由 `layout.js` 顶部的 `createFrame()` 生成。
- **单位规则**（两条，无例外）：
  1. 手写坐标：**位置**用底图记法（字段 `px` 为底图像素，`grid` 为网格坐标；折线 `pts` 的记法见各常量注释），方便和数字化工具对照；**尺寸一律写米**（宽 `w`、深 `d`、高 `h`、半径、偏移、里程），`f` 为层数。
  2. `layout.js` 的导出一律已换算为场景米：位置字段统一为 `pos`，像素矩形 `r` 导出为 `rect`。`build/` 直接使用，**不要再对 layout 数据调用 P / G 或乘 `PX`**。
- `build/` 中就地手写的少量坐标（地块绿地、门头、地名位置、中轴范围 `AXIS`）同样用 `P(...)` / `G(...)` 记法。
- `ELEVATED_RAMPS.tail` 是 `[沿 QINGYANG_AXIS 的里程 s 米, 东偏米]`，`join` 是接入连接线断面的横向偏移米。
- 道路宽度原本按像素测量，统一为米时取整到 0.1 m（底图精度约半米）；`LOCAL_ROADS` 的宽度里已含当初为显眼起见加的 1.4 倍。

## 大数据产业园：坐标系

- 底图为 `parks/bigdata/docs/area-50m-map.png`（百度 50 m 比例尺矢量图），其像素即 `P` 坐标；0.537 m/像素，原点为底图像素 `(820, 460)`（沙盘中心）。片区路网偏转约 −27.9°（`GRID_ANGLE`，沿玉兰路）。单位规则同苏南：手写位置用底图像素，尺寸写米，`layout.js` 导出一律为场景米。
- 其余截图（20 m 矢量 / 卫星、大范围矢量 / 卫星、桥头卫星）按 `tools/reg.js` 的仿射参数配准到同一 `P` 坐标，以百度「常州大数据产业园」面的折点拟合，残差约 1–2 m。`tools/crop.html?img=…&x0=&y0=&x1=&y1=&s=&step=[&layout]` 按配准裁切并叠加网格与现有布局。
- 道路以矢量图为准。百度卫星影像本身与矢量图有局部偏移（西北角约 15 m），河岸、绿地、屋面取自卫星图时要留意；运河宽度和位置按高清卫星图水面取。
- 运河下沉（`build/water.js` 的 `CANAL_Y`），底座按运河范围开洞；玉新桥桥面与路面齐平。
- 住宅片区（`RES_ZONES`）在路网和建筑登记之后按行排布并避让，所以 `build` 里 `buildHousing` 必须放在路网、园区、周边之后。

## 创意产业园：坐标系

- 底图为 `parks/creative/docs/area-50m-map.png`（百度 50 m 比例尺矢量图，2559 px 宽），其像素即 `P` 坐标；0.48 m/像素（比例尺 50 m = 104 px），原点为底图像素 `(2225, 825)`（沙盘中心）。沙盘范围 `PLATE_PX` 为底图像素 (650, 50)–(3800, 1600)，东到龙沧路、南到北塘河，让太湖东路、龙沧路、湖兴路、湖西路在沙盘内闭合；`tools/buildings.mjs`、`tools/vmap.html` 里的范围要与它一致。`GRID_ANGLE` ≈ 29°，取 A 座主楼长轴；各楼朝向不一，个别用 `a` 覆盖。
- 其余截图按 `parks/creative/tools/reg.js` 配准（POI 定位针针尖拟合相似变换）：`park-20m-*` 残差 ≤ 2 px；`lake-50m-map.png` 是 90% 浏览器缩放下截的，缩放比 1.138，与比例尺长度比一致。卫星图与同视野矢量图共用变换。
- 主干道用像素颜色分类手工提取（黄色主干道、白色道路），逐行 / 逐列取中点；道路折线两端多取一点，由 `layout.js` 的 `clip` 截到沙盘内。
- 楼栋与支路来自百度地图网页（用户已登录的 Chrome，经 web-access 的 CDP 代理在后台标签页操作）：后台页要把 `requestAnimationFrame` 换成定时器并伪造 `visibilityState` 才会重绘；二维卫星类型不出图，卫星图只能走「地球」模式（`map` 换成地球引擎对象，透视相机，按 `pixelToPoint` 读四角逐块配准）。百度墨卡托 → P 的变换在 `tools/reg.js` 的 `MERC`。
- `data/` 下都是生成文件，不要手改：`buildings.js` 由 `tools/buildings.mjs` 从 `.research/baidu-buildings.json`（矢量瓦片 `renderData.building3d` 的顶面环）生成；`roads.js` / `greens.js` / `water.js` 由 `tools/vmap.html`（拼接 19 级矢量图截图，按颜色分出水面、绿地、白色路面；路面细化追踪中线并量路宽，面取外轮廓）+ `tools/vmap.mjs`（道路吸附、剪毛刺、补缺、去掉主干道、尽头接到主干道中线）生成。细化结果的阶梯拐角有 3 个邻点，节点要按 8 邻域跳变数判断，否则路会被截成碎段。`layout.js` 的园区各栋按轮廓中心 `at` 引用楼栋环，重新生成后要核对。
- 19 级矢量图截图 `.research/map-z19-*.png` 为 3 × 3 块，覆盖扩大后的沙盘（页面 UI 与地图控件隐藏，元数据见同名 json，配准见 `tools/reg.js` 的 `MAP19`）。太湖东路弧段以东、龙沧路、湖兴路、青丰路南段从这组截图按颜色逐列 / 逐行取路面中点（黄色主路 (255, 236, 186)，白色路面的中心虚线两侧合并）。楼栋瓦片 `.research/baidu-buildings.json` 按 "列_行" 存放，扩大时只补新瓦片（同一瓦片重读的环数与旧数据略有出入，旧瓦片保留原数据以免园区楼栋引用变化）。
- `tools/pano.html` 的全景路线（`.research/pano-lines.json`、`pano-z19-*.png`，只覆盖扩大前的沙盘）已不再用于道路数据。改了 `layout.js` 的主干道后要重跑 `vmap.mjs`（它按主干道去掉重合的支路）。
- 世茂香槟湖是 C 形水面（`LAKE` = `WATERS[0]`，含半岛内凹）。水面不在避让表里，`trees.js` 末尾直接剔除水里的树点；岸坡沿 `SHORES`（去掉被沙盘边界截断的边）。湖面满铺荷叶贴图（`build/water.js`，画布按 0.3 m/像素覆盖湖面外接矩形，用 `rng.texture`），`OPEN_WATER` 为卫星图上露出水面的几处。

## 开发辅助

- `tools/shot.html?park=sunan&cam=x,y,z&tgt=x,y,z`：iframe 载入园区，隐藏 UI，按指定机位截图。
- `tools/jump.html?park=sunan`：模拟 6000 帧车辆运动，按类别统计沙盘内部的车流异常（`tools/carcheck.js`，见「车流」）。回归检查也包含这一项。
- `parks/sunan/tools/crop.html` / `_overlay.html`：把参考底图或卫星图（`docs/`、`.research/sat5.png`）裁切后叠加 P 像素网格和现有路网，用于数字化道路。
- `parks/sunan/tools/_dbg.mjs`：Node 脚本，统计 `FORESTS` 林地内可布树点数。

## 资料来源约定

每个园区的资源独立存放在自己目录下：参考底图与航拍照片在 `parks/<id>/docs/`，数字化用的卫星截图等在 `parks/<id>/.research/`，只服务于该园区的工具在 `parks/<id>/tools/`。`core/` 和根目录 `tools/` 不放任何园区的资源。

布局以百度 / 高德地图和用户提供的航拍照片为准。层数、高度和不可见面属于估算。改动布局或数据时，同步更新代码注释里的依据，以及 `park.js` 中 `meta.notes` / `meta.sources`。栋数出现在 `park.js` 的 `meta.stats`（47 栋 / 38 栋独栋）、`meta.notes`、导览章节文字和 README 中。`VILLAS` 的数量由 `rows` × `villaCols` 推导，并扣除会所占位，所以改行列参数会改变栋数。
