import * as THREE from 'three';

export const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// 补间动画：全部由 stepTweens(dt) 推进，不依赖 requestAnimationFrame，便于手动步进
export function createMotion(camera, controls) {
  const tweens = new Set();
  function tween(dur, fn, { easing = ease } = {}) {
    return new Promise(resolve => {
      const tw = { t: 0, dur, fn, easing, resolve };
      tweens.add(tw);
    });
  }
  function stepTweens(dt) {
    for (const tw of [...tweens]) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      tw.fn(tw.easing(tw.t), tw.t);
      if (tw.t >= 1) { tweens.delete(tw); tw.resolve(); }
    }
  }
  const sleep = s => tween(s, () => {});

  // 相机沿弧线飞行；新的飞行或 cancelFlight() 会让进行中的飞行停止更新
  let flightToken = 0;
  function fly(pos, target, dur = 4) {
    const token = ++flightToken;
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
    const lift = Math.min(260, p0.distanceTo(p1) * 0.18);
    return tween(dur, k => {
      if (token !== flightToken) return;
      camera.position.lerpVectors(p0, p1, k);
      camera.position.y += Math.sin(k * Math.PI) * lift;
      controls.target.lerpVectors(t0, t1, k);
    });
  }
  const cancelFlight = () => { flightToken++; };

  return { tween, stepTweens, sleep, fly, cancelFlight };
}
