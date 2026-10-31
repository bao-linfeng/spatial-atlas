// 按 park.meta 生成系列统一的页面外壳。meta 中的文字按 HTML 片段插入（可含 <br>、<a>、&amp;）。
// meta：{ no, year, name, nameEn, region, headline, intro, stats: [[数值, 单位, 说明]], accuracy: [标签, 正文],
//        reference: { href, title, sub }, model, notes: [[项, 内容]], sources: [HTML], disclaimer }
export function renderUI({ meta: m }) {
  const stats = m.stats.map(([v, u, label]) => `<div><strong>${v}<small>${u}</small></strong><span>${label}</span></div>`).join('\n        ');
  const notes = m.notes.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('\n      ');
  const sources = m.sources.map(s => `<li>${s}</li>`).join('\n      ');
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="sky sky-day"></div><div class="sky sky-night"></div>
  <main id="viewer" aria-label="可交互三维园区">
    <div id="canvas-host"></div>
    <div id="labels"></div>

    <header class="topbar">
      <a class="brand" href="./" aria-label="园区首页">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 3 12 7v13l-12 7-12-7V10Zm0 14 12-7M16 17 4 10m12 7v13" stroke="currentColor" stroke-width="1.5"/></svg>
        <span>空间档案<small>SPATIAL ATLAS</small></span>
      </a>
      <div class="project-name">${m.name}<span>${m.nameEn}</span></div>
      <button id="sources-button" class="top-link">建模说明 <span>↗</span></button>
    </header>

    <aside class="intro panel">
      <p class="eyebrow"><i></i> ${m.region}</p>
      <h1>${m.headline}<span>。</span></h1>
      <p class="intro-copy">${m.intro}</p>
      <div class="project-meta">
        ${stats}
      </div>
      <div class="accuracy">
        <span>${m.accuracy[0]}</span>
        <p>${m.accuracy[1]}</p>
      </div>
      <a class="reference-card" href="${m.reference.href}" target="_blank" rel="noopener">
        <span class="ref-thumb" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M4 32h32M8 32V14h6v18M16 32V8h8v24M26 32V18h6v14" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
        <span>${m.reference.title}<small>${m.reference.sub}</small></span>
      </a>
    </aside>

    <div class="scene-status"><span class="status-dot"></span><span id="status" role="status">正在构建三维场景…</span></div>

    <aside class="selection panel" id="selection" hidden>
      <button id="close-selection" class="close" aria-label="关闭建筑详情">×</button>
      <p class="eyebrow">BUILDING <span id="building-id">A</span></p>
      <h2 id="building-name"></h2>
      <p id="building-info"></p>
      <div id="building-stats" class="stats"></div>
      <button id="focus-button">靠近这栋建筑 <span>↗</span></button>
    </aside>

    <section id="tour-card" class="tour-card" aria-live="polite">
      <div class="tour-head"><em id="tour-index">01</em><span id="tour-en">LOCATION</span></div>
      <h3 id="tour-title">区位</h3>
      <p id="tour-text"></p>
      <div id="tour-dots" class="tour-dots"></div>
    </section>

    <nav class="view-tools" aria-label="视角工具">
      <button id="home" title="复位视角" aria-label="复位视角">⌂</button>
      <button id="top" title="俯视布局" aria-label="俯视布局">⊞</button>
      <hr>
      <button id="zoom-in" title="放大" aria-label="放大">+</button>
      <button id="zoom-out" title="缩小" aria-label="缩小">−</button>
    </nav>

    <nav class="toolbar panel" aria-label="场景工具">
      <button id="btn-tour" class="primary"><span class="ico">▶</span>导览动画</button>
      <button id="btn-grow"><span class="ico">↑</span>生长</button>
      <i class="sep"></i>
      <button id="btn-orbit"><span class="ico">↻</span>环绕</button>
      <button id="btn-night"><span class="ico">☾</span>夜景</button>
      <button id="btn-labels"><span class="ico">◎</span>标注</button>
      <button id="btn-white"><span class="ico">□</span>白模</button>
      <i class="sep"></i>
      <button id="btn-record" title="播放导览并导出 WebM 视频"><span class="ico rec"></span>录制</button>
    </nav>

    <p class="hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击建筑查看</p>
    <p class="foot">${m.model} <b>${m.no} / ${m.year}</b></p>
  </main>

  <dialog id="sources" class="sources">
    <button id="sources-close" class="close" aria-label="关闭">×</button>
    <p class="eyebrow">MODELING NOTES</p>
    <h2>建模说明</h2>
    <dl>
      ${notes}
    </dl>
    <h4>依据</h4>
    <ul>
      ${sources}
    </ul>
    <p class="muted">${m.disclaimer}</p>
  </dialog>
`);
}
