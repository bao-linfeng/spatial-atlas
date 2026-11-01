---
name: park-from-map
description: 新建或扩展园区三维沙盘的数据流程：以用户给的园区范围地图截图为底图建立坐标系，配准各截图，经 CDP 操作百度地图网页批量截图（矢量 / 地球卫星），读矢量瓦片里的楼栋轮廓与高度，按颜色提取支路、绿地、水面，手工数字化主干道，最后接入 parks/<id>/ 并校验。用户说「做 XX 园区 3D / 新增园区 / 从百度地图取建筑、道路、水系 / 扩大沙盘范围 / 重新提取楼栋或路网 / 配准截图」时使用。
---

# 园区沙盘：从地图截图与百度地图取数

这套流程是做 04 常州创意产业园时总结的，`parks/creative/` 是完整的参考实现。开始前先读 CLAUDE.md 的「架构」「车流」和「创意产业园：坐标系」几节。各类信息以哪个来源为准、做到多细、怎样记录和验收，以及创意园的待办，见 `references/reconstruction.md`。

**分工**：本 skill 的 `scripts/` 是与园区无关的通用工具，直接在仓库根目录运行；园区专用的工具（`reg.js`、`crop.html`、`buildings.mjs`、`vmap.html`、`vmap.mjs`）从 `parks/creative/tools/` 复制到新园区再改常量，见 `references/extraction.md` 开头的表。

| 脚本 | 作用 |
| --- | --- |
| `scripts/prep.js` | 浏览器端：后台标签页重绘补丁 + 隐藏百度 UI |
| `scripts/capture.mjs` | 按中心列表分块截图，写配准元数据（`--earth` 为卫星） |
| `scripts/buildings-capture.mjs` + `buildings.js` | 逐块定位，从瓦片缓存读楼栋顶面环，合并成 `baidu-buildings.json` |
| `scripts/tiles.mjs` | 由沙盘范围（P 像素 + MERC）生成分块中心 |
| `scripts/fit.mjs` | 控制点拟合：截图 → P（REG），或网页截图 / 墨卡托 → P（MERC） |
| `scripts/run-page.mjs` | 无头运行工具页（vmap.html、crop.html、shot.html），可导出页内结果 |
| `scripts/amap-capture.mjs` | 高德地图整幅截图（无头浏览器 + amap.com 的 JSAPI，不需登录），写 GCJ-02 中心与缩放元数据 |
| `scripts/pano-near.mjs` | 列出某点周围的百度全景点（方位角、距离、拍摄日期） |
| `scripts/pano-pick.mjs` | 按八方位列出候选全景点，用楼栋轮廓估算视线遮挡 |
| `scripts/pano-capture.mjs` | 百度全景定向截图：朝向目标楼，按楼高自动取俯仰与视场角，隐藏控件，写机位元数据 |
| `scripts/pano-model.mjs` | 按全景机位截模型图，并与实景上下拼成对照图（核心楼八方位对照，见 `references/reconstruction.md` 第 6 节） |
| `scripts/pano-sheet.mjs` | 把多张对照图拼成一张总览（每格标方位名） |

## 前置

- 不安装依赖。无头浏览器借用本机已有的 playwright-core（`run-page.mjs` 的 `PW`，缺省用 CLAUDE.md 里记的路径）。CDP 用 web-access skill 的代理：先跑 `bash ~/.claude/skills/web-access/scripts/check-deps.sh`，未通过时引导用户在 Chrome 里开启远程调试。
- 用户的 Chrome 已登录百度。只在自己新建的后台标签页里操作，结束时 `/close`。
- Git Bash 下截图路径写绝对路径（`D:/...`），带 `--path /` 一类参数的命令要加 `MSYS_NO_PATHCONV=1`。

## 流程

### 1. 收资料、定范围

1. 把用户给的截图和航拍放进 `parks/<id>/docs/`。先用 md5 查重，有重复的告诉用户，由用户决定删哪张。常见组合：50 m 比例尺矢量图（作底图）、同视野卫星图、20 m 局部图、航拍照片。
2. 量比例尺得到 m/px，选沙盘中心作 `ORIGIN`，按主楼长轴或主路方向定 `GRID_ANGLE`。
3. 定沙盘范围 `PLATE_PX`（底图像素）：**主干道要在范围内串成闭环或两端到边**，否则车流会出现瞬移。范围宁大勿小，扩大的代价是之后要补截图、补瓦片。

### 2. 截图配准 → `tools/reg.js` 的 `REG`

用各图共有的 POI 定位针针尖（或园区面折点、路口）做控制点，拟合相似变换，目标残差 ≤ 2 px。
```bash
node .claude/skills/park-from-map/scripts/fit.mjs --mpp 0.48 u,v=x,y=名称 ...
```
读点和校核方法见 `references/registration.md`。

### 3. 百度网页 → `MERC`

在 CDP 标签页里执行 `prep.js`，截一张含 3–5 个已知定位针的 18 级锚图（`capture.mjs --prefix anchor --zoom 18`），用针尖拟合墨卡托 → P：
```bash
node .claude/skills/park-from-map/scripts/fit.mjs --meta parks/<id>/.research/anchor-0.json --mpp 0.48 u,v=x,y=名称 ...
```
把输出的 `MERC` 写进 reg.js。页面操作的细节和坑见 `references/baidu-web.md`。

### 4. 批量截图

```bash
S=.claude/skills/park-from-map/scripts
node $S/tiles.mjs --reg parks/<id>/tools/reg.js --plate x0,y0,x1,y1 --view <prep 返回的宽x高> > /tmp/centers.json
node $S/capture.mjs --target $T --out parks/<id>/.research --prefix map-z19 @/tmp/centers.json
# 卫星：先 navigate 到 https://map.baidu.com/@X,Y,19z/maptype%3DB_EARTH_MAP
node $S/capture.mjs --target $T --out parks/<id>/.research --prefix sat-z19 --earth @/tmp/centers.json
```
把元数据写进 reg.js（`baidu()` / `earth()`），再用 `crop.html?img=.research/map-z19-*.png&...&layout` 看拼接和配准是否吻合。

### 5. 楼栋 → `data/buildings.js`

navigate 回普通地图后执行：
```bash
node $S/buildings-capture.mjs --target $T --out parks/<id>/.research/baidu-buildings.json @/tmp/centers.json
node parks/<id>/tools/buildings.mjs
```

### 6. 主干道（手工）→ `layout.js` 的 `ROADS`

逐列或逐行取路面中点，两端各多取一点伸出沙盘。

### 7. 支路 / 绿地 / 水面 → `data/roads.js`、`greens.js`、`water.js`

```bash
EVAL='JSON.stringify(window.VMAP)' OUT=parks/<id>/.research/vmap.json W=1200 H=800 node $S/run-page.mjs "parks/<id>/tools/vmap.html" /tmp/vmap.png
node parks/<id>/tools/vmap.mjs      # 依赖 layout.js 的 ROADS；改了主干道要重跑
```
第 5–7 步的算法、参数和校核方法见 `references/extraction.md`。

### 8. 布局与场景

`layout.js` 里：园区楼按轮廓中心 `at` 引用楼栋环，高度和退台按航拍改写；周边楼直接挤出；水面、岸线、绿地、支路用 `data/` 的数据。`build/` 照 creative 的写法搭。

### 9. 接入、文档、校验

接入 `parks/index.js`（高德坐标），同步 `meta` / README / CLAUDE.md，跑车流检查和回归基准。清单见 `references/integration.md`。

## 以高德地图校正（创意园 2026-11 的做法）

用户要求以高德为准时：`amap-capture.mjs --clean` 截 19 级整幅（一张覆盖沙盘）→ 以水面与现有数据 IoU 最大拟合 `AMAP_MERC`（GCJ Web 墨卡托 → P，只拟合平移和缩放）→ `vmap.html?src=amap` 提取路面（分主 / 次 / 支三级）、楼栋、绿地、水面 → `amap-roads.mjs` 把手工主干道吸附到高德中线 → `buildings.mjs` 用高德轮廓，楼高按百度环平移匹配 → `vmap.mjs`。高德的路宽是按等级画的固定宽度，不能拿来量路宽；楼栋轮廓比百度粗（相邻体量常合成一个），园区楼用 `cuts` 切开。细节见 CLAUDE.md「创意产业园：坐标系」。

## 扩大已有园区的范围

做法同创意园那次：改 `PLATE_PX`，同步 `buildings.mjs` 的 `R` 和 `vmap.html` 的范围 → 旧截图挪到 `.research/_old-*` → `tiles.mjs` 重新分块并重截 → `buildings-capture.mjs` 默认保留旧瓦片、只补新瓦片 → 补主干道 → 重跑 `buildings.mjs`、`vmap.html`、`vmap.mjs` → 核对园区楼的 `at`、车流和回归基准。

## 原则

- 每类数据都要可追溯：在代码注释里写清楚取自哪张图、哪个工具、用的什么参数；`data/` 文件头写明生成方式并标注「请勿手改」。
- 布局以百度地图和航拍为准，层数、高度、看不到的立面属于估算，在 `meta.accuracy` / `disclaimer` 里说明。
- 先用 crop.html 叠加图核对，再往下走。配准错了，后面的所有数据都会跟着错。
