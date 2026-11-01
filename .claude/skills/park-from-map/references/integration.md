# 园区接入、文档同步与校验

## 目录骨架（照 parks/creative/）

```
parks/<id>/
  index.html          只留 <head>（标题、描述、图标、importmap），调用 createViewer(park)
  park.js             配置对象：seed、meta、plate、ground、gridAngle、stage、views、growOrigin、chapters、build(ctx)
  layout.js           坐标框架 + 全部布局数据（导出一律为场景米）
  build/              water / greens / roads / campus / context / trees ……
  data/               生成文件（buildings / roads / greens / water），不要手改
  docs/               用户截图、航拍（参考资料）
  .research/          网页截图 + 元数据、baidu-buildings.json、vmap.json
  tools/              reg.js、crop.html、buildings.mjs、vmap.html、vmap.mjs
```

- `park.js` 的字段说明见 `core/viewer.js` 顶部注释；`build(ctx)` 的步骤顺序决定 world 随机数流的消耗和绘制次序，定下来之后不要随便调整。
- 随机数只用 `ctx.rand` / `core/rng.js` 的分流，**不要用 `Math.random`**。
- 建筑用 `placeBuilding` 登记（点选、标注、生长动画），完成后设 `root.userData.height`。周边楼合并成少数几个网格，不参与点选，但要往 `ctx.blockers.rects` 登记，免得树种进楼里。
- 水面不在避让表里时，`trees.js` 最后要剔除落在水里的树点。

## 车流（CLAUDE.md「车流」一节）

- 沙盘范围要让主干道**串成闭环或两端都到沙盘边缘**。范围定得太小、主干道止于丁字路口的话，车会在路中间瞬移。创意园就是为此把沙盘往东、往南扩到龙沧路和北塘河的。
- 丁字路口用 `route` 转向拼接；围成街区的几条主干道用 `closeLoop` 拼成闭环。支路尽头交给 `finalize`，自动改成半圆掉头。
- 校核：`tools/jump.html?park=<id>`，`jump` / `hop` / `flip` 三类计数都要为 0。

## 登记与文档（数字要保持一致）

- `parks/index.js` 追加一项：`id`、`no`、名称、`district`（须与 `home/changzhou.json` 的区县名一致）、地址、摘要、`stats`、`lnglat`（**高德 GCJ-02**）。
- `lnglat` 的求法：园区中心的 P → MERC 反算出墨卡托 → 地球模式下 `centerAndZoom` 到该点，读 `map.getCenter().latLng` 得到 BD-09 → 转 GCJ-02：
  ```js
  const xPi = Math.PI * 3000 / 180, x = lng - 0.0065, y = lat - 0.006;
  const z = Math.hypot(x, y) - 0.00002 * Math.sin(y * xPi), t = Math.atan2(y, x) - 0.000003 * Math.cos(x * xPi);
  const gcj = [z * Math.cos(t), z * Math.sin(t)];
  ```
  MERC 反算：`u = P.x − c`，`v = P.y − f`，`X = (a·u − b·v) / (a² + b²)`，`Y = −(b·u + a·v) / (a² + b²)`（`tiles.mjs` 里有同样的代码）。在注释里写明求法和读取日期。
- `park.js` 的 `meta`：`stats`、`notes`（范围、园区、周边、路网）、`sources`（每类数据的来源和对应工具）、`accuracy`、`disclaimer`。这里的名称、指标和 `parks/index.js` 是两份，改动时同步。
- `README.md`：加园区一节，并在目录结构里加一行。
- `CLAUDE.md`：
  - 项目概述里的园区列表；
  - 新增「<园区>：坐标系」一节：底图文件、m/px、ORIGIN、PLATE_PX、GRID_ANGLE 的取法、各截图配准的残差、数据来源与生成链、这个园区特有的坑；
  - 车流用例清单（如有新的路口拼接）。
- 代码注释里写依据：每条主干道取自哪张图、怎么取的；楼高和层数哪些来自百度、哪些是按航拍估的。

## 校验

```bash
# 场景机位截图（看效果）
node .claude/skills/park-from-map/scripts/run-page.mjs "tools/shot.html?park=<id>&cam=x,y,z&tgt=x,y,z" /tmp/shot.png
# 车流：tools/jump.html?park=<id>
# 回归：新园区第一次用 --update 建立基准（先看过截图再建）；之后的纯重构必须通过
MSYS_NO_PATHCONV=1 node tools/regress.mjs D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs --park <id> [--update]
```

- 改动已有园区的数据（重读瓦片、重跑 vmap）会改变画面，要重拍基准，并在提交信息里说明原因。
- `.research/` 里试探用的临时文件（`_probe.png`、`_crop.png`、`_*.mjs`）在收尾时删掉；CDP 标签页 `/close`。
