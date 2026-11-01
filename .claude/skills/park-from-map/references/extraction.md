# 数据提取：楼栋、主干道、支路 / 绿地 / 水面

园区专用工具从 `parks/creative/tools/` 复制到 `parks/<id>/tools/`，再改其中的常量（CLAUDE.md 约定：只服务于一个园区的工具放在园区目录下，core 和根目录 tools 不放园区资源）。

| 文件 | 要改的常量 |
| --- | --- |
| `reg.js` | `REG` 各截图、`MERC`、`MAP19` / `SAT19` 及其 `centerPx` / `dpr`；删掉不用的 `PARK20` / `LAKE50` / `PANO19` |
| `crop.html` | `names` 里 `*` 展开的块数（creative 写死为 0–5 号，块数不同要改）；底部 40 px 空白条的裁切（`prep.js` 截的图不需要）；`?layout` 叠加的导出名要与新 `layout.js` 一致 |
| `buildings.mjs` | `M_PER_P`（= layout 的 PX）、沙盘范围 `R`（= `PLATE_PX` 内缩 0.5） |
| `vmap.html` | `X0, Y0, PW, PH`（= PLATE_PX）、`MAP19` 块数、三种颜色及容差（先取样核对） |
| `vmap.mjs` | 依赖 `layout.js` 的 `ROADS`、`PX`、`ORIGIN`；`nearMain` 的 13 m（双幅路两幅间距）、路宽三档阈值；`data/water.js` 头注释里的水体名称 |

`pano.html` 不用复制（全景路线已废弃）。

## 楼栋（data/buildings.js）

```bash
node .claude/skills/park-from-map/scripts/buildings-capture.mjs --target $T --out parks/<id>/.research/baidu-buildings.json @centers.json
node parks/<id>/tools/buildings.mjs          # → data/buildings.js（P 坐标 + 高度 m，裁到沙盘）
```

- 校核：`crop.html?img=area-50m-map.png&x0=&y0=&x1=&y1=&s=1&step=50&bld&ids` 按高度着色画出轮廓，并在中心标 `序号:高度`。
- `layout.js` 里的园区楼按轮廓中心 `at`（顶点均值，P 像素）引用 `data/buildings.js` 的环（`ringAt`，容差 12 px），所以重新生成后要逐栋核对。同一园区楼可以由多个环组成（退台各台、裙房）。周边楼取剩下的环，园区地块内的不要。
- 园区楼的高度、退台、立面按航拍改写，周边楼直接挤出轮廓。

## 主干道（layout.js 的 ROADS，手工）

主干道在矢量图上是黄色 `(255, 236, 186)` 或较宽的白色路面，车流要求它们在沙盘内串成闭环或两端到边。按以下步骤手工数字化：

1. 用 `crop.html?img=<底图或 .research/map-z19-*.png>&x0=&y0=&x1=&y1=&s=1&step=50` 截出路段。
2. 逐列（东西走向的路）或逐行（南北走向的路）每 50 px 取路面上下沿（或左右沿）的中点。白色路面有中心虚线时，把虚线两侧当成同一块路面合并。弯道改成逐行取。也可以在 crop 页里用 `EVAL` 读 `#c` 画布的 `getImageData` 按颜色程序化取中点。
3. 折线两端各多取一点伸出沙盘，由 `layout.js` 的 `clip` / `road()` 截齐。宽度按矢量图路面像素 × PX 估算后取整，主干道可以适当加宽。
4. 注释里写明来源（哪张图、逐行还是逐列、路面宽）。

改了主干道之后**要重跑 `vmap.mjs`**：它按主干道去掉重合的支路，并把尽头接到主干道中线上。

## 支路 / 绿地 / 水面（data/roads.js、greens.js、water.js）

```bash
EVAL='JSON.stringify(window.VMAP)' OUT=parks/<id>/.research/vmap.json W=1200 H=800 \
  node .claude/skills/park-from-map/scripts/run-page.mjs "parks/<id>/tools/vmap.html" /tmp/vmap.png
node parks/<id>/tools/vmap.mjs
```

`vmap.html` 按 reg.js 把 19 级矢量图拼到沙盘画布（每 P 像素 K = 2 个画布像素），逐像素分类：

| 类别 | 颜色 | 处理 |
| --- | --- | --- |
| 水面 | (144, 221, 246) ± (22, 16, 12) | 闭运算 r4 → 连通域（≥ 400 P px²）→ Moore 外轮廓 → RDP 1 px |
| 绿地 | (194, 240, 195) ± (20, 12, 22) | 开运算 r1、闭运算 r4 → 同上（≥ 150 P px²），不含内洞 |
| 道路 | 白色，RGB 均 ≥ 248 | 开运算 r2 去掉文字白边 → Zhang–Suen 细化 → 剪毛刺（8 次剥端点再沿原像素长回）→ 节点间追踪 → RDP；路宽取中线上距离变换的中位数 × 2 |

颜色随百度样式变化，先在 crop 页上取样核对。

细化与追踪有个坑：**节点要按 8 邻域一周 0→1 的跳变数判断**（端点为 1，岔口 ≥ 3）。细化结果的阶梯拐角有 3 个邻点，按邻点个数判断会把路截成碎段。

`vmap.mjs` 再按图结构清理（参数单位都是 P 像素）：端点吸附（SNAP 3）→ 收缩岔口极短边（TINY 4）→ 反复剪毛刺（SPUR 12）并合并度为 2 的节点 → 补缺（被图标、文字压断的路：两个悬空端点相距 < 26 且走向一致，夹角 < 35°）→ 去掉与主干道重合 ≥ 60% 的线 → 尽头停在主干道路缘外 8 m 以内的，沿法向延伸到中线 → 丢掉短线（尽头段 < 24，两头都接路的 < 10）→ 路宽分档 8 / 6 / 4.5 m。

校核：
- `vmap.html?show=roads|greens|water` 叠加在拼图上看（`run-page.mjs` 截图）。
- `crop.html?...&roads` 给 data/roads.js 的每条线标序号，方便在 layout 里按序号挑出园区内部路。
- 水面与卫星图核对湖岸（创意园差 ≤ 5 m，岸边有树冠遮挡时以矢量图为准）。卫星图与矢量图本身可能有局部偏移（大数据园西北角约 15 m），高楼在卫星图上会倾斜成像（创意园 A 座屋顶影像向西偏约 20 m），从卫星图取轮廓时要留意。

## 卫星图的用途

- 湖岸、河岸、绿地边界的核对，荷叶、露水面等细节（`crop.html?img=.research/sat-z19-*.png&layout`）。
- 屋面颜色、屋顶构架、楼栋朝向（GRID_ANGLE、个别楼的 `a`）。
- 百度没有轮廓或者轮廓合并了的楼，按卫星图量取 `px / w / d / a`。
