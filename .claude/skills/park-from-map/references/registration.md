# 坐标链与配准

```
各截图像素 (u, v) ──REG[name]──▶ 底图像素 P ──createFrame──▶ 场景米 (x 东, z 南)
百度墨卡托 (X, Y) ──MERC──────▶ 底图像素 P
百度网页截图设备像素 ──baidu(meta) / earth(corners)──▶ P（经 MERC 合成）
```

## 底图与 P

- 用户给的「园区范围」截图里，选一张**百度 50 m 比例尺矢量图**做底图（`docs/area-50m-map.png`）。它的像素就是 `P` 坐标，所有手写位置都按它记。
- 比例尺：量出比例尺线的像素长度，得到每像素米数（创意园 50 m = 104 px → 0.48；大数据园 0.537）。浏览器缩放下截的图（创意园 `lake-50m-map.png` 是 90% 缩放）比例尺长度会不同，这样的图不当底图，只按配准使用。
- `layout.js` 顶部：
  ```js
  export const ORIGIN = [cx, cy];                 // 沙盘中心（底图像素）
  export const { PX, P, G, GRID_ANGLE } = createFrame({ origin: ORIGIN, scale: 0.48, axis: [cos, sin] });
  ```
  `axis` 取园区主路或主楼长轴在像素坐标系里的单位向量（y 向南，所以向东北是 `[cos, sin]`、`sin > 0`）。

## 截图 → P：相似变换

1. 找控制点：各截图共有的、能精确定位的点。
   - **POI 定位针针尖**（首选）：图钉图标最下端的像素。可以人工读，也可以自动找：在小窗口里找与图钉颜色相近的像素，取最低一行的 x 均值。矢量图和卫星图上图钉的绘制偏移差约 4 屏幕像素，属于图标样式差异，同视野的两张图共用一个变换。
   - 百度园区面（蓝色虚线）的折点（大数据园用的是这个）、路口中心、楼角。
2. 读像素：`tools/crop.html?img=<name>&raw&x0=&y0=&x1=&y1=&s=4&step=5` 放大截图并叠加截图自身的像素网格，用 `run-page.mjs` 截下来看；底图上的对应点用 `crop.html?img=area-50m-map.png&...` 读。
3. 拟合：
   ```bash
   node .claude/skills/park-from-map/scripts/fit.mjs --mpp 0.48 u,v=x,y=麦当劳 u,v=x,y=CHTC ...
   ```
   输出的 `[a, b, c, d, e, f]` 写进 `tools/reg.js` 的 `REG[name]`，残差和所用控制点写进注释。目标残差 ≤ 2 px；某个点的残差 > 3 px 时多半读错了，剔除后重新拟合，再用这个点校核。
4. 校核：`crop.html?img=<name>&x0=&y0=&x1=&y1=&s=1&step=50&layout`，看叠加的现有路网、水面是否贴合。

## 百度墨卡托 → P：MERC

拿到 MERC 之后，百度网页上的一切（截图、楼栋、`pixelToPoint`）都能换算到 P。

1. 在 CDP 标签页里 `prep.js`，`centerAndZoom` 到园区，18 级（视野要包含底图上至少 3–5 个能认出的定位针），用 `capture.mjs --prefix anchor --zoom 18 X,Y` 截一张，同时得到元数据 `anchor-0.json`。
2. 在 `anchor-0.png` 上读针尖的设备像素（`crop.html?img=.research/anchor-0.png&raw...`），在底图上读同一批针尖的 P。
3. 拟合：
   ```bash
   node .claude/skills/park-from-map/scripts/fit.mjs --meta parks/<id>/.research/anchor-0.json --mpp 0.48 u,v=x,y=名称 ...
   ```
   输出 `export const MERC = { a, b, c, f }`，即 `P.x = a·X − b·Y + c`，`P.y = −b·X − a·Y + f`（Y 向北、P 向南）。旋转通常只有 0.01° 量级；明显偏大时检查读点。创意园残差 ≤ 1.2 px。
4. 同时打印的 `1 墨卡托单位 ≈ … m` 就是 `buildings.mjs` 里的 `M_PER_MERC`（常州约 0.86，即 cos 31.8°）。

`fit.mjs` 内部的换算与 `reg.js` 的 `baidu()` 完全一致：用 `baidu()` 正算几组点，再用 `--meta` 反拟合，可以原样拿回 MERC（误差 0）。

## reg.js 里的网页截图配准

从 `parks/creative/tools/reg.js` 复制 `baidu()` 与 `earth()`，它们按截图元数据和 MERC 合成「设备像素 → P」的仿射：

```js
// 普通地图：capture.mjs 写的 { center, centerPx, zoom, rect, dpr }
MAP19.forEach((center, i) => { tiles[`.research/map-z19-${i}.png`] = baidu({ center, centerPx: [...], zoom: 19, rect: [0, 0], dpr }); });
// 地球模式：{ p00, p10, p01, dpr }
SAT19.forEach((corners, i) => { tiles[`.research/sat-z19-${i}.png`] = earth(corners, dpr); });
```

创意园是把元数据数值抄进 reg.js 的（MAP19 中心数组、SAT19 角点）。新园区也可以让 reg.js 在 Node 里直接读同名 json，但 reg.js 同时被浏览器里的 crop.html / vmap.html 引用，用 `fetch` 读的话得改成异步，所以照抄数值最省事。同一组截图的 `centerPx`、`dpr` 相同，只有 `center` 不同。

## 场景米 ↔ P

- `layout.js` 导出的一律是场景米：`P(px, py)`、`line(pts)`、`road(pts)`（裁到沙盘）。
- 工具里要从场景米回到 P：`[x / L.PX + L.ORIGIN[0], z / L.PX + L.ORIGIN[1]]`（见 `vmap.mjs`、`crop.html?layout`）。
