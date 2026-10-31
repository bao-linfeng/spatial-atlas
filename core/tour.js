const $ = s => document.querySelector(s);

// 导览：按章节飞行并更新导览卡；录制：播放一遍导览，同时用 MediaRecorder 导出 WebM。
// chapter：{ title, en, text, pos, target, dur, night?, then?: { pos, target, dur } }
export function createTour({ chapters, home, motion, toggleNight, getNight, controls, select, setStatus, canvas, filename }) {
  const { fly, sleep } = motion;
  let touring = false, tourToken = 0;
  let recorder = null;
  const tourCard = $('#tour-card');
  const tourDots = $('#tour-dots');
  tourDots.innerHTML = chapters.map((c, i) => `<i data-i="${i}"></i>`).join('');

  async function runTour() {
    const token = ++tourToken;
    touring = true;
    controls.autoRotate = false; $('#btn-orbit').classList.remove('active');
    $('#btn-tour').classList.add('active');
    document.body.classList.add('touring');
    select(null);
    for (let i = 0; i < chapters.length; i++) {
      if (token !== tourToken) return;
      const c = chapters[i];
      $('#tour-index').textContent = String(i + 1).padStart(2, '0');
      $('#tour-title').textContent = c.title;
      $('#tour-en').textContent = c.en;
      $('#tour-text').textContent = c.text;
      [...tourDots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
      tourCard.classList.remove('show'); void tourCard.offsetWidth; tourCard.classList.add('show');
      const jobs = [fly(c.pos, c.target, c.dur)];
      if (c.night && getNight() < 0.5) jobs.push(toggleNight(true));
      await Promise.all(jobs);
      if (token !== tourToken) return;
      if (c.then) {
        await fly(c.then.pos, c.then.target, c.then.dur);
        if (token !== tourToken) return;
      }
      await sleep(c.night ? 3.5 : 1.6);
    }
    if (token !== tourToken) return;
    await Promise.all([toggleNight(false), fly(home.pos, home.target, 4)]);
    endTour();
  }
  function endTour(interrupted = false) {
    tourToken++;
    touring = false;
    $('#btn-tour').classList.remove('active');
    document.body.classList.remove('touring');
    tourCard.classList.remove('show');
    if (recorder && recorder.state === 'recording') recorder.stop();
    if (interrupted) setStatus('导览已中断 · 可随时重新播放');
  }
  $('#btn-tour').addEventListener('click', () => (touring ? endTour(true) : runTour()));

  $('#btn-record').addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') { endTour(true); return; }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) { setStatus('当前浏览器不支持录制'); return; }
    const stream = canvas.captureStream(60);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
    const chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      $('#btn-record').classList.remove('active');
      setStatus('导览视频已导出（WebM，仅含三维画面）');
    };
    recorder.start();
    $('#btn-record').classList.add('active');
    setStatus('正在录制导览…');
    runTour();
  });

  return { runTour, endTour, isTouring: () => touring };
}
