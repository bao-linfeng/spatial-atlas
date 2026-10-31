import * as THREE from 'three';

// 标注是 DOM 元素，每帧投影到屏幕坐标。建筑标注在楼宇生长完成后才显示，点击时调用 onSelect。
export function createLabels(labels, { host, layer, camera, fade, onSelect }) {
  const els = labels.map(l => {
    const el = document.createElement('div');
    el.className = `label label-${l.kind}`;
    if (l.kind === 'building') {
      el.innerHTML = `<b>${l.text}</b><span>${l.sub}</span>`;
      el.addEventListener('click', () => onSelect(l.bld));
    } else el.textContent = l.text;
    layer.appendChild(el);
    return el;
  });
  let visible = true;
  const tmpV = new THREE.Vector3();
  function update() {
    const w = host.clientWidth, h = host.clientHeight;
    labels.forEach((l, i) => {
      const el = els[i];
      let show = visible;
      if (l.kind === 'building') show = show && l.bld.userData.grow.scale.y > 0.98;
      if (!show) { el.style.display = 'none'; return; }
      tmpV.copy(l.pos).project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(-50%, -100%) translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px)`;
      const dist = camera.position.distanceTo(l.pos);
      el.style.opacity = l.kind === 'place' ? THREE.MathUtils.clamp(1.6 - dist / fade, 0.25, 1) : 1;
    });
  }
  return {
    update,
    get visible() { return visible; },
    set visible(v) { visible = v; },
  };
}
