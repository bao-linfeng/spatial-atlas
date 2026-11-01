# 百度地图网页操作（CDP）

经 web-access skill 的 CDP 代理（`http://localhost:3456`）操作用户日常 Chrome（已登录百度）。先跑 `bash ~/.claude/skills/web-access/scripts/check-deps.sh`。只在自己新建的后台标签页里操作，做完 `/close`，不要碰用户已有的标签页。

## 打开与准备

```bash
curl -s "http://localhost:3456/new?url=https://map.baidu.com/@13358712,3716594,18z"   # 返回 targetId
T=<targetId>
curl -s -X POST "http://localhost:3456/eval?target=$T" --data-binary @.claude/skills/park-from-map/scripts/prep.js
```

- URL 里 `@X,Y,Zz` 的 X / Y 是**百度墨卡托**（BD-09MC），不是经纬度。不知道园区坐标时，先打开 `https://map.baidu.com/`，在页面里搜索园区名（GUI 操作），再用 `map.getCenter()` 读中心。
- **后台标签页不重绘**：`requestAnimationFrame` 不触发，`visibilityState` 为 `hidden`。`prep.js` 会把它换成定时器、伪造成可见，再隐藏页面 UI。每次 `navigate` 之后都要重新执行。
- `prep.js` 逐级把地图容器祖先的兄弟节点设成 `display:none`，容器随之铺满视口（`rect` 为 `[0, 0, innerWidth, innerHeight]`）。不要用 `[class*=ad-]` 这类宽泛选择器隐藏，会误伤 `head-…` 一类类名。
- 截图是视口的**设备像素**（`dpr` 常见 1.35 / 1.5）。换算成容器 css 像素：`(u / dpr, v / dpr − rect.top)`。早期没隐藏 UI 的截图底部有 35–40 px 空白条，拼图时要裁掉；用了 `prep.js` 就没有这个问题。
- `map.centerAndZoom(new BMap.Point(X, Y), 19)` 后普通地图等 **9 s**、地球模式等 **16 s** 再截图，否则瓦片没出齐。
- 用 curl 传中文（`-d '...中文...'`）在 Git Bash 下会乱码。脚本写成 UTF-8 文件，用 `--data-binary @file` 传。
- 截图路径给**绝对路径**（代理在本机写文件）。Git Bash 下 `/tmp` 实际是 `%TEMP%`，代理看不到，要写成 `D:/...` 或 `$TEMP/...`。

## 常用页面对象

| 用途 | 写法 |
| --- | --- |
| 中心 / 缩放 | `map.getCenter()`（`{lng, lat}` 实为墨卡托 X / Y）、`map.getZoom()` |
| 定位 | `map.centerAndZoom(new BMap.Point(X, Y), z)` |
| 像素 ↔ 墨卡托 | `map.pointToPixel(pt)`、`map.pixelToPoint(new BMap.Pixel(x, y))`（容器 css 像素） |
| 容器 | `map.getContainer().getBoundingClientRect()` |
| 普通地图分辨率 | 每 css 像素 `2^(18 − zoom)` 墨卡托单位（19 级 0.5） |
| 地图类型卡片 | `.mapTypeCard.normal` / `.earth` / `.panorama`（`/click` 点选） |

## 地图类型

- **普通地图**（矢量）：截图用于颜色分类（道路、绿地、水面），瓦片缓存里有楼栋三维数据。
- **卫星图**：普通地图引擎下 `map.setMapType(BMAP_SATELLITE_MAP)` **不出图**。只能走「地球」模式：`navigate` 到 `https://map.baidu.com/@X,Y,19z/maptype%3DB_EARTH_MAP`，再执行 `prep.js`。navigate 后视野会被重置到约 13.5 级，要重新 `centerAndZoom`（`capture.mjs --earth` 会逐块定位）。
  - 地球模式下 `window.map` 换成了地球引擎对象：用的是透视相机，实际缩放约 18.91，x / y 分辨率相差约 0.5%，所以不能按 zoom 推算分辨率。要逐块读容器像素 (0,0)、(1000,0)、(0,1000) 处的 `pixelToPoint` 做仿射，写入元数据的 `p00 / p10 / p01`。
  - 地球模式没有 `map.tileMgr`，读楼栋前要 navigate 回普通地图。
  - 地球模式下 `map.getCenter().latLng` 给出 BD-09 经纬度，可用来求园区的高德坐标（见 `integration.md`）。
- **全景路线**（`.mapTypeCard.panorama`）：蓝色路线只覆盖有街景的路，支路不全。创意园试过之后改用矢量图提取，不推荐再用。

## 全景（街景实景）

用于核心楼八方位对照（`reconstruction.md` 第 6 节），由 `pano-near.mjs` / `pano-capture.mjs` 封装（2026-11 验证）。

- **元数据接口**（公开、不需登录，Node 端直接 `fetch`）：
  - `https://mapsv0.bdimg.com/?qt=qsdata&x=X&y=Y&l=19&action=0&mode=day`：最近的全景点 `{ id, x, y, RoadName }`（坐标 × 100）。只在离全景点约十几米内才有返回，所以要按网格撒点找种子。
  - `?qt=sdata&sid=<ID>&pc=1`：单点详情。`X / Y`（× 100）、`Date`（拍摄日期）、`Rname`、`DeviceHeight`（约 2.3 m）、`Roads[].Panos`（同一条路上的相邻点）、`Links`、`TimeLine`（历年版本）。沿 `Roads[].Panos` 和 `Links` 遍历就能找出一片区域内的全部点。
  - 不要在后台标签页里用 `setTimeout` 串行请求：后台定时器会被限流，几十个请求要等好几分钟。
- **打开全景**：navigate 到 `https://map.baidu.com/?newmap=1&shareurl=1&panotype=street&pid=<ID>&panoid=<ID>&heading=<罗盘方位>&pitch=<向上为正>&l=21&tn=B_NORMAL_MAP&sc=0`。URL 里的 heading 是罗盘方位，实测与模型对得上。
- **全景控件**：`$BAIDU$._._maps_id` 下带 `_panoFlashWraper` 的对象（如 `TANGRAM_38`），`.getPanoStatus()` 给出当前 ID、墨卡托坐标、拍摄日期；`._panoFlashWraper.panorama` 为渲染器：
  - `setZoom(z)` 为绝对缩放，`fov = 90 − 15z`（1 / 2 / 3 / 4 → 75° / 60° / 45° / 30°），是**垂直**视场角。这一点是从 WebGL 的投影矩阵核实的：拦截 `uniformMatrix4fv`，第二行的模为 1 / tan(fov / 2)。
  - 缩放带动画，后台标签页里动画跑得很慢，`setZoom` 几秒后读 `panorama.fov` 常常还是旧值，但截图已经是新缩放。所以 fov 一律按 zoom 推算，不读 `panorama.fov`（2026-11 A 座那批截图的 json 一度全写成了 75°）。
  - `setPov(heading, pitch)` 用的是全景内部朝向，与罗盘差一个随点而变的改正角，**不要用**；朝向一律经 URL 给定。
  - `curPanoId` 可用来判断全景是否已打开；偶尔会黑屏不出图（读回的 heading 为 360、pitch 为 0），换相邻的点重拍即可。
- **隐藏控件**：从全景画布（不在 `#MapHolder` 里的那个 canvas）逐级把祖先的兄弟节点设成 `display:none`，搜索框、底部缩略图条和右侧按钮就都去掉了。
- 视口是 1707 × 898 css 像素（dpr 1.5，截图 2561 × 1347）；模型对照截图用同样的画幅比。

## 楼栋：矢量瓦片缓存

`scripts/buildings.js` / `buildings-capture.mjs` 已经封装好，这里记录数据结构，方便百度改版后重新定位：

- `map.tileMgr.tileLayers[0].tileCache`：LRU 缓存（构造器名是混淆过的），字段 `_size`（约 42）、`_cache`。`_cache[key]` 为 `{ key, data, older, newer }`。
- key 形如 `B_NORMAL_MAP_default_<col>_<row>_19_19`；12–13 级的底图瓦片 key 形如 `..._407_113_12_13`，没有楼栋。
- `data.tileInfo`：`{ col, row, zoom: 19, useZoom: 18, mercatorSize: 512, baseTileSize: 1024, tileSize: 512 }`。
- `data.renderData.building3d`：`{ vertex: Float32Array, index: Uint16Array }`，每个顶点 7 个数：`x, y, z, nx, ny, nz, 颜色`。局部坐标 0–1024（y 向北），对应 512 墨卡托单位：`X = col·512 + x/2`，`Y = row·512 + y/2`，`z` 同样要 ÷2。
- 顶面取法向 `(0, 0, 1)` 的三角形。早期按顶点顺序切环的写法会漏环、错环，现在的做法是三角形按共享顶点并查集分块，再取只属于一个三角形的边作为外轮廓。
- 缓存只装当前视野附近的瓦片，必须**每定位一个中心读一次**再合并。
- 高度：高层可信；低层多为 6–8 m 的默认值，按 3 层 9.6 m 处理（`house: h < 8`）。几栋相邻的低层有时会合并成一个轮廓（创意园 F 座），这种情况按卫星图量取、手写体量。

### 探查（百度改版、字段名变了时）

`renderData` 的其他字段名是混淆过的（`rd.a`、`rd.A`、`rd.D`……），只有 `building3d` 是明文。找不到时，在页面里递归遍历 `map`，找键名匹配 `/build|3d|house/i` 的路径，再打印 `vertex` 的前几十个数，按「7 个数一组、法向为单位向量」确认格式。

## 不可用的路子

- 搜索接口 `/?newmap=1&qt=s&wd=...`：返回 `need_recaptcha`，取不到 POI 坐标。POI 只能从截图上的定位针读。
- 短时间内大量 `/new` 标签页容易触发风控。一个标签页里依次 `centerAndZoom` 就够了。
