// 百度地图网页（map.baidu.com，CDP 代理新建的后台标签页）截图前的准备，经代理 /eval 执行：
//   curl -s -X POST "http://localhost:3456/eval?target=$T" --data-binary @prep.js
// 1. 后台标签页不触发 requestAnimationFrame、visibilityState 为 hidden，地图不重绘：换成定时器并伪造可见。
// 2. 隐藏地图容器以外的页面 UI（左侧面板、搜索框、工具条、头像等，逐级隐藏容器祖先的兄弟节点），
//    以及容器内的控件（比例尺、版权、全景按钮、右键菜单、点击波纹）。隐藏后地图容器铺满视口，rect 为 [0, 0, innerWidth, innerHeight]。
// 每次 navigate（含切换到地球模式）之后都要重新执行。
(() => {
  if (!window.map || !map.getContainer) return 'no map（页面还没加载完，稍后重试）';
  window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = id => clearTimeout(id);
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  const mc = map.getContainer();
  let hidden = 0;
  for (let e = mc; e && e.parentElement && e !== document.body; e = e.parentElement)
    for (const s of e.parentElement.children)
      if (s !== e && s.tagName !== 'SCRIPT' && s.tagName !== 'STYLE') { s.style.setProperty('display', 'none', 'important'); hidden++; }
  for (const k of mc.children)
    if (/anchor|street-view|contextMenu|ripple/.test(k.className)) k.style.setProperty('display', 'none', 'important');
  const r = mc.getBoundingClientRect();
  return JSON.stringify({ hidden, rect: [r.left, r.top, r.width, r.height], dpr: devicePixelRatio, zoom: map.getZoom() });
})()
