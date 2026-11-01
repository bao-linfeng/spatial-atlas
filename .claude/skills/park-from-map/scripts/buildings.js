// 浏览器端（map.baidu.com 普通地图，19 级）：从矢量瓦片缓存读楼栋顶面环，经 CDP 代理 /eval 执行，返回 JSON 字符串
//   { "col_row": [{ z, pts: [[x, y], ...] }, ...], ... }
// 数据位置：map.tileMgr.tileLayers[0].tileCache._cache[key].data，key 形如 B_NORMAL_MAP_default_<col>_<row>_19_19；
//   .tileInfo：{ col, row, zoom: 19, useZoom: 18, mercatorSize: 512, baseTileSize: 1024 }
//   .renderData.building3d：{ vertex: Float32Array（每 7 个数：x, y, z, 法向 x/y/z, 颜色）, index: Uint16Array（三角形）}
// 瓦片 512 墨卡托单位见方，局部坐标 0–1024（y 向北），z 与 x / y 同单位：墨卡托 X = col·512 + x/2，Y = row·512 + y/2。
// 做法：取法向 (0, 0, 1) 的顶面三角形，按共享顶点并查集分成连通块，每块取只被一个三角形用到的边（外边界），
// 串成环后保留面积最大的一个（不取内洞）。退台建筑的各台是各自的连通块（z 不同）；跨瓦片的楼在每块瓦片里各有一段。
// BOX 由 buildings-capture.mjs 替换为 [col0, col1, row0, row1]（null 为缓存中全部 19 级瓦片）。
// 瓦片缓存是 LRU（约 42 块），只装着当前视野附近的瓦片，所以要逐个中心定位后各读一次再合并。
(() => {
  const BOX = null;
  const C = map.tileMgr.tileLayers[0].tileCache._cache, out = {};
  for (const key of Object.keys(C)) {
    const m = key.match(/_(\d+)_(\d+)_19_19$/);
    if (!m) continue;
    const col = +m[1], row = +m[2];
    if (BOX && (col < BOX[0] || col > BOX[1] || row < BOX[2] || row > BOX[3])) continue;
    const d = C[key].data, rd = d && d.renderData;
    if (!rd || !rd.building3d) continue;
    if (d.tileInfo && d.tileInfo.mercatorSize !== 512) continue;   // 换算假定 512，见 tools/buildings.mjs
    const { vertex: V, index: I } = rd.building3d;
    const pk = i => V[i * 7].toFixed(2) + ',' + V[i * 7 + 1].toFixed(2) + ',' + V[i * 7 + 2].toFixed(2);
    const par = new Map();
    const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par.set(a, b); };
    const tris = [];
    for (let t = 0; t < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]];
      if (!ids.every(i => Math.abs(V[i * 7 + 5] - 1) < 1e-3 && Math.abs(V[i * 7 + 3]) < 1e-3)) continue;
      const ks = ids.map(pk);
      ks.forEach(k => { if (!par.has(k)) par.set(k, k); });
      uni(ks[0], ks[1]); uni(ks[1], ks[2]);
      tris.push(ks);
    }
    const comps = new Map();
    for (const ks of tris) { const r = find(ks[0]); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(ks); }
    const rings = [];
    for (const ts of comps.values()) {
      const ec = new Map();
      for (const [a, b, c] of ts) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? p + '|' + q : q + '|' + p; ec.set(k, (ec.get(k) || 0) + 1); }
      const adj = new Map();
      for (const [k, n] of ec) {
        if (n !== 1) continue;
        const [p, q] = k.split('|');
        (adj.get(p) || adj.set(p, []).get(p)).push(q);
        (adj.get(q) || adj.set(q, []).get(q)).push(p);
      }
      const seen = new Set();
      let best = null, ba = -1;
      for (const s of adj.keys()) {
        if (seen.has(s)) continue;
        const ring = [s]; seen.add(s);
        let prev = null, cur = s;
        for (;;) {
          const nx = (adj.get(cur) || []).find(n => n !== prev && !seen.has(n));
          if (!nx) break;
          ring.push(nx); seen.add(nx); prev = cur; cur = nx;
        }
        const pts = ring.map(k => k.split(',').map(Number));
        let A = 0;
        pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; });
        A = Math.abs(A) / 2;
        if (A > ba) { ba = A; best = pts; }
      }
      if (best && best.length >= 3) rings.push({ z: +best[0][2].toFixed(1), pts: best.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
    }
    out[col + '_' + row] = rings;
  }
  return JSON.stringify(out);
})()
