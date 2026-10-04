/** 可收起的課堂引導；不把學習進度混入機構作品格式。 */
import { createCourseStart, createCourseDrafts, checkCourseAssembly } from './fourbar-course.js';
import { getExampleLesson } from './examples.js?v=20261004_fourbar_r1';

export function createTeachingUI({ loadExample, undo, saveFile, openFile, selectMember, measureSwing, togglePlay, fitView, getSnapshot, applyLessonSnapshot, onCourseState = () => {}, startLink = () => {} }) {
  const root = document.getElementById('teachingTools');
  const panel = document.getElementById('teachingPanel');
  const title = document.getElementById('teachingTitle');
  const body = document.getElementById('teachingBody');
  const reset = document.getElementById('lessonReset');
  let active = null;
  let step = 0;
  let lastMeasurement = null;
  let baseline = null;
  let course = false, stage = 'observe', outside = null, applying = false;
  let drafts = createCourseDrafts(), result = '', previousReset = null;
  const records = new Map();
  const stages = [['observe', '① 看懂範例'], ['build', '② 接好半成品'], ['challenge', '③ 自己完成考驗'], ['create', '④ 變化應用']];
  const hints = document.createElement('p'); hints.id = 'courseTaskHint'; hints.hidden = true; root.append(hints);
  const assembly = () => course && ['build', 'challenge'].includes(stage);
  const tasks = { observe: '播放觀察，指出機架、主動桿、浮桿與從動桿。', build: '補上浮桿：把 C、D 兩個活動端真正連接。', challenge: '不靠接點提示，補上缺少的桿並說明連接關係。', create: '先記錄原始擺動角，再改一根桿，用前後證據說明結果。' };
  function announce() {
    hints.hidden = !course; hints.textContent = course ? tasks[stage] : '';
    onCourseState({ active: course, stage, task: course ? tasks[stage] : '', hints: course && stage === 'build', assembly: assembly(), complete: assembly() && checkCourseAssembly(getSnapshot()).complete });
  }
  function apply(snapshot) {
    applying = true;
    try { applyLessonSnapshot(snapshot); } finally { applying = false; }
    fitView();
  }
  function chooseStage(next) {
    if (course && stage === next) return;
    if (course) { drafts.save(stage, getSnapshot()); records.set(stage, { step, baseline, lastMeasurement }); }
    stage = next; course = true; result = ''; previousReset = null; baseline = null; lastMeasurement = null;
    step = records.get(stage)?.step ?? (stage === 'create' ? 3 : 0);
    baseline = records.get(stage)?.baseline || null; lastMeasurement = records.get(stage)?.lastMeasurement || null;
    active = { id: 'fourbar-crank-rocker', title: '四連桿：從連接到設計' };
    apply(drafts.load(stage)); render();
  }
  const isFourbar = () => course || active?.id.startsWith('fourbar-');
  const steps = [
    ['1 / 7 認識四連桿', 'AB 是固定桿（機架兩個固定軸之間，即使沒有另畫一根桿也算）；CD 是浮桿，兩端都不固定在機架。AC 是主動桿（輸入桿），BD 是從動桿（輸出桿）；CD 也稱聯接桿。曲柄能整圈轉，搖桿只能來回擺；裝馬達不代表一定是曲柄。初始範例 AC 是曲柄、BD 是搖桿。'],
    ['2 / 7 先猜，再看動作', '先在學習單猜 AC、BD 各能不能轉滿一圈。按播放觀察，再暫停記錄：哪根是曲柄？哪根是搖桿？修改後要重新依運動能力判斷，不能只看顏色或有沒有馬達。'],
    ['3 / 7 比較三種四連桿', '切換比較範例前先記下猜測。觀察 AC、BD 的運動：一轉一擺、兩根都轉、還是兩根都擺？每次記四根桿長與固定桿 AB。範例名稱只說明初始組態；改過桿長後可能變成另一類。'],
    ['4 / 7 留下改造前的紀錄', '回到曲柄搖桿，按「記錄原始擺動角」。擺動角是 BD 兩個極限方向之間的角度，不是端點走過的距離。先預測：把 BD 加長 8 mm，擺動角會增加、減少，還是不變？'],
    ['5 / 7 只改一根桿，驗證預測', '按「選 BD 改長度」，把孔距增加一次（8 mm），再打開教學任務量一次擺動角。比較前後的角度並寫一句解釋。結果不如預期也要留下紀錄；可復原再試，其他桿先保持不變。'],
    ['6 / 7 創意挑戰：自己的雨刷或揮手臂', '選一個目標：讓 BD 擺得更大、擺得更小，或變成會揮手的角色。每次只改一根桿，播放、量測，再調整。記下「想做到什麼、改了哪裡、結果如何」，若遇到失敗，也留下原因與下一次的調整；造型可以畫在成果截圖上。'],
    ['7 / 7 自己歸納並保存', '完成這句話：「固定桿保持不變時，我把＿＿從＿＿改成＿＿，BD 擺動角從＿＿變成＿＿。」桿長比例與固定桿選擇會影響動作，但不是越長擺動角一定越大。下載作品、截圖並提交學習單；用開啟作品確認保存成功。曲柄滑塊留到下一單元。']
  ];
  function closePanel() {
    panel.hidden = true; document.body.dataset.teachingOpen = 'false';
    document.getElementById('lessonToggle').setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new Event('resize'));
  }
  function switchExample(id, targetStep) {
    applying = true; try { loadExample(id); } finally { applying = false; }
    step = targetStep; lastMeasurement = null; baseline = null; render();
  }
  function takeMeasurement(saveBaseline) {
    lastMeasurement = measureSwing();
    if (saveBaseline && lastMeasurement.ok) baseline = lastMeasurement;
    render();
  }
  function describeMeasurement(result) {
    if (!result.ok) return result.message;
    const names = { ground: 'AB', input: 'AC', coupler: 'CD', output: 'BD' };
    const lengths = Object.entries(result.lengths || {}).map(([name, value]) => `${names[name] || name} ${Number(value).toFixed(1)}`).join('、');
    return `${result.outputMode === 'rotate' ? 'BD 可整圈轉，不以搖桿擺動角表示' : `BD 擺動角約 ${result.spanDeg.toFixed(1)}°`}；桿長（mm）：${lengths}。取樣估計，非精密公差檢驗。`;
  }
  function show() {
    render();
    panel.hidden = !panel.hidden;
    document.body.dataset.teachingOpen = String(!panel.hidden);
    if (!panel.hidden && document.body.dataset.mobilePanel === 'edit') window.blocks.setMobilePanel('build');
    document.getElementById('lessonToggle').setAttribute('aria-expanded', String(!panel.hidden));
    window.dispatchEvent(new Event('resize'));
  }
  function render() {
    body.replaceChildren();
    announce();
    reset.disabled = !active && !course;
    reset.textContent = assembly() ? '重新練習' : '還原範例';
    reset.title = course ? '回到本階段起點；可用「找回重設前作品」恢復' : '重載範例，可復原回修改前';
    title.textContent = active ? active.title : '快速試錯・數位樂高';
    if (!active) {
      const p = document.createElement('p');
      p.textContent = '按「開始第一課」進入四階段任務；切換階段會保留本次頁面中的作品。課程中可按「回到我的作品」取回課前作品。重新整理前請下載作品保存。';
      body.append(p);
      return;
    }
    if (course) {
      const tabs = document.createElement('div'); tabs.className = 'teaching-actions';
      stages.forEach(([id, name]) => { addButton(tabs, name, () => chooseStage(id)); tabs.lastChild.setAttribute('aria-pressed', String(stage === id)); });
      addButton(tabs, '回到我的作品', () => { drafts.save(stage, getSnapshot()); records.set(stage, { step, baseline, lastMeasurement }); course = false; active = null; document.getElementById('lessonStart').textContent = '繼續第一課'; apply(outside); render(); });
      if (previousReset) addButton(tabs, '找回重設前作品', () => { apply(previousReset); previousReset = null; render(); });
      body.append(tabs);
    }
    if (assembly()) {
      const h = document.createElement('strong'); h.textContent = stage === 'build' ? '補接練習' : '獨立考驗';
      const p = document.createElement('p'); p.textContent = tasks[stage] + '完成後再播放，說明為什麼機架也算一根桿。';
      const actions = document.createElement('div'); actions.className = 'teaching-actions';
      addButton(actions, '開始連接', () => { startLink(); closePanel(); });
      addButton(actions, '檢查連接', () => { result = checkCourseAssembly(getSnapshot()).message; render(); });
      if (checkCourseAssembly(getSnapshot()).complete) addButton(actions, '播放／暫停', togglePlay);
      addButton(actions, '下一階段', () => chooseStage(stage === 'build' ? 'challenge' : 'create'));
      const feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); feedback.textContent = result || '這是刻意保留缺桿的起始作品；先補接，再檢查。';
      body.append(h, p, actions, feedback); return;
    }
    if (isFourbar()) {
      const h = document.createElement('strong'); h.textContent = steps[step][0];
      const p = document.createElement('p'); p.textContent = steps[step][1];
      const nav = document.createElement('div'); nav.className = 'teaching-actions';
      [['上一步', -1], ['下一步', 1]].forEach(([label, delta]) => {
        const b = document.createElement('button'); b.textContent = label;
        b.disabled = step + delta < 0 || step + delta > (course && stage === 'observe' ? 2 : 6) || (course && stage === 'create' && step + delta < 3);
        b.onclick = () => { step += delta; render(); }; nav.append(b);
      });
      if (step >= 0 && step <= 5) addButton(nav, '播放／暫停', togglePlay);
      if (step === 2) {
        [['曲柄搖桿', 'fourbar-crank-rocker'], ['雙曲柄', 'fourbar-double-crank'], ['雙搖桿', 'fourbar-double-rocker']].forEach(([name, id]) => addButton(nav, name, () => switchExample(id, 2)));
      }
      if (step === 3) {
        addButton(nav, '回到曲柄搖桿', () => switchExample('fourbar-crank-rocker', 3));
        addButton(nav, '記錄原始擺動角', () => takeMeasurement(true));
      }
      if (step === 4 || step === 5) {
        addButton(nav, '選 BD 改長度', () => { selectMember('Link3'); closePanel(); });
        addButton(nav, '量目前擺動角', () => takeMeasurement(false));
      }
      if (step === 5) {
        addButton(nav, '選 AC 改長度', () => { selectMember('Link1'); closePanel(); });
        addButton(nav, '選浮桿 CD', () => { selectMember('Link2'); closePanel(); });
      }
      if (step === 6) { addButton(nav, '下載作品', saveFile); addButton(nav, '開啟作品', openFile); }
      if (course && stage === 'observe' && step === 2) addButton(nav, '進入補接練習', () => chooseStage('build'));
      body.append(h, p, nav);
      if (step >= 3 && baseline) { const note = document.createElement('p'); note.textContent = '改造前紀錄：' + describeMeasurement(baseline); body.append(note); }
      if (step >= 3 && lastMeasurement && lastMeasurement !== baseline) { const note = document.createElement('p'); note.textContent = '上次量測（修改後請重新量）：' + describeMeasurement(lastMeasurement); body.append(note); }
    }
    const lesson = getExampleLesson(active.id);
    const details = document.createElement('details');
    details.open = !isFourbar();
    const summary = document.createElement('summary'); summary.textContent = '預測 → 量測 → 解釋'; details.append(summary);
    [['預測', lesson.predict], ['量測', lesson.measure], ['解釋', lesson.explain]].forEach(([label, value]) => {
      const p = document.createElement('p'); p.textContent = `${label}：${value || '每次只改一個參數，記錄前後差異。'}`; details.append(p);
    });
    const p = document.createElement('p'); p.textContent = lesson.learn; details.append(p);
    body.append(details);
  }
  function addButton(parent, text, action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; parent.append(b);
  }
  document.getElementById('lessonToggle').onclick = show;
  document.getElementById('lessonStart').onclick = () => {
    if (!course) { outside = getSnapshot(); chooseStage(stage); }
    panel.hidden = false;
    document.getElementById('lessonRoles').checked = true;
    document.body.dataset.teachingOpen = 'true';
    document.getElementById('lessonToggle').setAttribute('aria-expanded', 'true');
    render(); window.dispatchEvent(new Event('resize')); fitView();
  };
  document.getElementById('lessonUndo').onclick = undo;
  reset.onclick = () => { if (course) { previousReset = getSnapshot(); apply(drafts.reset(stage)); result = ''; baseline = null; lastMeasurement = null; render(); } else if (active) switchExample(active.id, 0); };
  document.getElementById('lessonHideEditor').onclick = () => { document.body.dataset.mobilePanel = 'view'; window.blocks.setMobilePanel('view'); };
  document.getElementById('lessonRoles').onchange = e => { root.dataset.roles = String(e.target.checked); window.blocks.fitView(); };
  render();
  return {
    lessonChanged(example) { if (course || applying) return; if (active?.id !== example?.id) { step = 0; baseline = null; lastMeasurement = null; } active = example; reset.disabled = !example; render(); },
    snapshotApplied(source) { if (applying || source === 'lesson' || source === 'undo') return; if (course) { drafts.save(stage, getSnapshot()); records.set(stage, { step, baseline, lastMeasurement }); course = false; active = null; document.getElementById('lessonStart').textContent = '繼續第一課'; render(); } },
    get courseActive() { return course; },
    get stage() { return stage; },
    get assemblyExpected() { return assembly() && !checkCourseAssembly(getSnapshot(), false).complete; },
    get expectedMissingLink() {
      if (!assembly()) return false;
      const comps = getSnapshot().comps || [];
      return comps.length === 4 && comps.filter(c => c.type === 'anchor').length === 2
        && ['Link1', 'Link3'].every(id => comps.some(c => c.type === 'bar' && c.id === id));
    },
    get hintsEnabled() { return course && stage === 'build'; },
    get rolesEnabled() { return !(course && stage === 'challenge') && document.getElementById('lessonRoles').checked; }
  };
}
