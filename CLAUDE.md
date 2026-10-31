# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

苏南智城科技产业园三维沙盘：「空间档案 · SPATIAL ATLAS」系列第 02 号。纯静态页面，原生 ES Module + three.js（0.169.0，经 `index.html` 中的 importmap 从 registry.npmmirror.com CDN 加载）。没有 package.json、构建步骤、lint 或测试框架。

## 运行

ES Module 与 importmap 需要通过 HTTP 访问，不能直接双击打开：

```bash
node server.mjs          # 默认 http://127.0.0.1:5191/，可传端口参数：node server.mjs 8080
```

URL 参数：`?night` 以夜景开场，`?tour` 在开场动画结束后自动播放导览。

## 架构

数据与构建分离，四个模块按依赖方向排列：

- `src/layout.js`：**纯数据**，没有 three.js 依赖。园区红线、外部路网、高架匝道、河道、周边厂区、林地、塔楼（`TOWERS`）、独栋（`VILLAS`，由行列参数程序化生成的风车式排布）、`FACTS`。改布局只改这里。
- `src/textures.js`：Canvas 程序化贴图（立面 + 夜景自发光、路面、标识、光伏、水面）。`facadeMaterial(style, widthM, floors)` 按 `style|开间数|层数` 缓存材质，并登记到 `facadeMaterials`，供夜景和白模统一切换。随机数使用固定种子的 `mulberry32`，结果可复现。
- `src/world.js`：`buildWorld(scene)` 读取 layout 数据生成全部几何体，返回 `{ world, park, buildings, labels, pickables, trees, cars, lamps, plateRect, materials, fountain }`。车辆使用 InstancedMesh，沿车道折线行驶，路口靠 `turnLane` 拼接转向。
- `src/main.js`：渲染器、相机、灯光，以及交互：点选、视角飞行 `fly`、导览 `CHAPTERS`、生长动画 `grow`、夜景 `applyNight(t)`、白模、MediaRecorder 录制 WebM。所有动画走自带的 `tween` 系统，由 `tick(dt)` 驱动。

### 坐标系（最关键）

- 所有坐标先按**百度底图截图像素**记录，再由 `P(px, py)` 换算为场景米（x 向东，z 向南；`PX = 0.48` m/像素，原点为底图像素 `(1000, 560)`）。
- 园区内部路网偏转约 12.7°（`GRID_ANGLE`）。园区内对象用网格坐标 `G(u, v)` 表示：u 沿东西主路，v 沿中轴向南，单位同为像素。`TOWERS` 中的 `at: [u, v]` 是网格坐标，`px: [x, y]` 是底图像素。
- 新增或修改道路、建筑时，**位置**沿用原有记法（P 像素或 G 网格），不要直接写米。各字段单位并不统一，改之前先看同类条目和 `world.js` 中的用法：
  - `PARK_ROADS` / `NORTH_ROADS` / `LOCAL_ROADS` 的 `w` 是像素宽度，`world.js` 会乘以 `PX`（`LOCAL_ROADS` 还会再乘 1.4）。
  - 建筑的 `w` / `d` / `h`、`podium`、`FRONTAGE`、`DECK_START` / `LANDING` 是米，`f` 是层数。
  - `RIVER`、`PONDS`、`QINGYANG_AXIS` 等常量在 layout.js 中已经 `.map(p => P(...p))` 转成米；`NORTH_ROADS`、`LOCAL_ROADS`、`CONTEXT_BLOCKS`、`ELEVATED_RAMPS.pts` 保留原始像素，由 `world.js` 换算。
  - `ELEVATED_RAMPS.tail` 是 `[沿 QINGYANG_AXIS 的 s 米, 东偏米]`，`join` 是接入连接线断面的横向偏移米。

### 页面 UI

`index.html` 是静态 DOM，包括标题卡、建筑详情、导览卡、工具栏和建模说明 dialog。`main.js` 按 id 绑定事件。标注是 DOM 元素，每帧投影到屏幕坐标（`updateLabels`），不是 three.js 精灵。

## 调试与开发辅助

`main.js` 末尾暴露 `window.__park = { scene, camera, controls, W, fly, runTour, applyNight, advance, toggleNight, select }`。`advance(sec, step)` 可以按固定步长手动推进时间，并让导览的 Promise 链继续执行，适合无头截图和确定性检查。

`tools/` 下的页面需要同样经 HTTP 打开：

- `_shot.html?cam=x,y,z&tgt=x,y,z`：iframe 载入主页面，隐藏 UI，按指定机位截图。
- `_jump.html`：模拟 6000 帧车辆运动，检测沙盘内部的瞬移点（车道拼接错误）。
- `crop.html` / `_overlay.html`：把参考底图或卫星图（`docs/`、`.research/sat5.png`）裁切后叠加 P 像素网格和现有路网，用于数字化道路。
- `_dbg.mjs`：Node 脚本（`node tools/_dbg.mjs`），统计 `FORESTS` 林地内可布树点数。

`.research/shots/` 存放历史截图，`world.js.bak` 是旧版备份，都不参与运行。

## 资料来源约定

布局以百度 / 高德地图和用户提供的航拍照片为准（照片放在 `docs/`）。层数、高度和不可见面属于估算。改动布局或数据时，同步更新代码注释里的依据，以及 `index.html` 建模说明 dialog 中的指标与依据。栋数同时出现在 `index.html` 标题卡（47 栋 / 38 栋独栋）、dialog、`FACTS` 和 README 中。`VILLAS` 的数量由 `rows` × `villaCols` 推导，并扣除会所占位，所以改行列参数会改变栋数。
