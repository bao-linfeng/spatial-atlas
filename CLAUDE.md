# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「空间档案 · SPATIAL ATLAS」园区三维沙盘系列。`core/` 是系列共用的引擎和页面外壳，`parks/<id>/` 是各园区（目前只有 `sunan`，即 02 号苏南智城科技产业园）。纯静态页面，原生 ES Module + three.js（0.169.0，经各园区 `index.html` 中的 importmap 从 registry.npmmirror.com CDN 加载）。没有 package.json、构建步骤或 lint。

## 运行

```bash
node server.mjs          # http://127.0.0.1:5191/（系列首页），苏南在 /parks/sunan/；可传端口：node server.mjs 8080
```

服务器以仓库根目录为根，园区代码用相对路径（`../../core/...`）引用核心，所以必须从根目录起服务。URL 参数：`?night` 以夜景开场，`?tour` 开场后自动播放导览。

## 回归检查

```bash
MSYS_NO_PATHCONV=1 node tools/regress.mjs <playwright-core/index.mjs 的绝对路径> [--park sunan] [--update]
```

不安装依赖，借用本机已有的 Playwright（例如 `D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs`，对应已装的 chromium-1234）。脚本冻结页面时钟，只用 `__park.advance()` 推进时间，按固定顺序截 7 张图并统计场景数据（建筑、树、车、网格、顶点数、车辆瞬移点），与 `verification/baseline/<park>/` 逐像素比对；差异图写到 `verification/current/<park>/*.diff.png`。

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
- 需要单独分组时用 `ctx.addGroup('park')` / `ctx.addGroup('context')`；`placeBuilding` 加入 `ctx.park`，`contextBox` 加入 `ctx.context`。

`core/kit/` 是可复用构件：`ground`（底座、河道、池塘）、`roads`（地面道路、逐点高程的高架 / 匝道）、`buildings`（体量、屋面、塔楼、周边体量）、`scatter`（行道树、散植、片林、树丛）、`instances`（树、车、路灯的 InstancedMesh / Points）。车辆沿车道折线行驶，路口靠 `core/lanes.js` 的 `turnLane` 拼接转向。

具体的路网组合（青洋高架主线、匝道、T 形路口车流等）留在 `parks/sunan/build/`。只有出现第二个用例时，才往 core 里提炼。

### 页面

标注是 DOM 元素，每帧投影到屏幕（`core/labels.js`），不是 three.js 精灵。立面材质由 `facadeMaterial(style, widthM, floors)` 按 `style|开间数|层数` 缓存，并登记到 `facadeMaterials`，夜景和白模统一切换它们。所有动画走 `core/motion.js` 的 tween，由 `tick(dt)` 驱动，`advance(sec, step)` 可手动步进。`window.__park` 暴露 `{ scene, camera, controls, W, fly, runTour, applyNight, advance, toggleNight, select }`。

## 苏南：坐标系（最关键）

- 底图像素由 `P(x, y)` 换算为场景米（x 向东，z 向南；0.48 m/像素，原点为底图像素 `(1000, 560)`）。园区内部路网偏转约 12.7°（`GRID_ANGLE`），园区内对象用网格坐标 `G(u, v)`：u 沿东西主路，v 沿中轴向南，单位同为像素。`P` / `G` / `GRID_ANGLE` 由 `layout.js` 顶部的 `createFrame()` 生成。
- **单位规则**（两条，无例外）：
  1. 手写坐标：**位置**用底图记法（字段 `px` 为底图像素，`grid` 为网格坐标；折线 `pts` 的记法见各常量注释），方便和数字化工具对照；**尺寸一律写米**（宽 `w`、深 `d`、高 `h`、半径、偏移、里程），`f` 为层数。
  2. `layout.js` 的导出一律已换算为场景米：位置字段统一为 `pos`，像素矩形 `r` 导出为 `rect`。`build/` 直接使用，**不要再对 layout 数据调用 P / G 或乘 `PX`**。
- `build/` 中就地手写的少量坐标（地块绿地、门头、地名位置、中轴范围 `AXIS`）同样用 `P(...)` / `G(...)` 记法。
- `ELEVATED_RAMPS.tail` 是 `[沿 QINGYANG_AXIS 的里程 s 米, 东偏米]`，`join` 是接入连接线断面的横向偏移米。
- 道路宽度原本按像素测量，统一为米时取整到 0.1 m（底图精度约半米）；`LOCAL_ROADS` 的宽度里已含当初为显眼起见加的 1.4 倍。

## 开发辅助

- `tools/shot.html?park=sunan&cam=x,y,z&tgt=x,y,z`：iframe 载入园区，隐藏 UI，按指定机位截图。
- `tools/jump.html?park=sunan`：模拟 6000 帧车辆运动，检测沙盘内部的瞬移点（车道拼接错误）。回归检查也包含这一项。
- `parks/sunan/tools/crop.html` / `_overlay.html`：把参考底图或卫星图（`docs/`、`.research/sat5.png`）裁切后叠加 P 像素网格和现有路网，用于数字化道路。
- `parks/sunan/tools/_dbg.mjs`：Node 脚本，统计 `FORESTS` 林地内可布树点数。

## 资料来源约定

每个园区的资源独立存放在自己目录下：参考底图与航拍照片在 `parks/<id>/docs/`，数字化用的卫星截图等在 `parks/<id>/.research/`，只服务于该园区的工具在 `parks/<id>/tools/`。`core/` 和根目录 `tools/` 不放任何园区的资源。

布局以百度 / 高德地图和用户提供的航拍照片为准。层数、高度和不可见面属于估算。改动布局或数据时，同步更新代码注释里的依据，以及 `park.js` 中 `meta.notes` / `meta.sources`。栋数出现在 `park.js` 的 `meta.stats`（47 栋 / 38 栋独栋）、`meta.notes`、导览章节文字和 README 中。`VILLAS` 的数量由 `rows` × `villaCols` 推导，并扣除会所占位，所以改行列参数会改变栋数。
