/**
 * 효자손 — 메인 앱 (3화면 SPA: 홈 / 결과 / 도움말)
 * 원칙: 회원가입 없음, 홈 → 결과까지 터치 2번 이내
 */

import { runRules, mergeRisk } from './rules.js';
import { SAMPLES, sampleImageURL } from './samples.js';
import { addRecord, listRecords, deleteRecord, clearRecords } from './db.js';
import { speakResult, stopSpeaking, isSpeaking } from './tts.js';
import { renderCard } from './card.js';
import { hydrateIcons, svgIcon } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// XSS 방지: 모델·외부 유래 텍스트를 innerHTML에 넣기 전 반드시 이스케이프
// (사진 속 악성 HTML 글자가 화면에서 스크립트로 실행되는 것을 차단)
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const state = {
  result: null,        // 현재 결과 JSON
  originalFile: null,  // 분석 직후 세션에서만 유지 (무저장 원칙 — 화면 이탈 시 폐기)
  fromHistory: false,  // 다시 보기에서 열었는지 (원본 동봉 불가)
  fontStep: Number(localStorage.getItem('fontStep') || 2),
  cardFile: null,      // 결과 카드 PNG File — 결과 화면에서 미리 생성해 캐시
  cardPromise: null,   // 생성 진행 중 Promise (race 대비)
};

const RISK_UI = {
  안전: { cls: 'safe', icon: 'safe', label: '안심하세요' },
  주의: { cls: 'warning', icon: 'caution', label: '주의가 필요해요' },
  위험: { cls: 'danger', icon: 'danger', label: '위험해요!' },
};

/* ---------- 화면 전환 ---------- */

// 하단 탭바가 보이는 탭 화면
const TAB_VIEWS = ['home', 'history', 'help'];

// 방문 기록(네비 스택) — 뒤로가기 화살표가 실제 이전 페이지로 가도록
let currentView = null;
const navStack = [];

function show(view, opts = {}) {
  // 뒤로가기가 아니고 화면이 바뀌면 현재 화면을 스택에 쌓음
  if (!opts.back && currentView && currentView !== view) {
    navStack.push(currentView);
    if (navStack.length > 20) navStack.shift();
  }
  currentView = view;

  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  window.scrollTo(0, 0);
  if (view !== 'result') {
    stopSpeaking();
    resetSpeakButton();
  }
  if (view === 'home') state.originalFile = null; // 세션 원본 폐기
  if (view === 'history') renderHistory();

  // 하단 탭바: 탭 화면에서만 표시하고 현재 탭 강조
  const tabbar = $('#tabbar');
  if (tabbar) tabbar.style.display = TAB_VIEWS.includes(view) ? '' : 'none';
  // 하단 탭 + 데스크톱 상단 내비 모두 현재 화면 강조
  $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

/** 뒤로가기: 방문 기록의 이전 화면으로 (없으면 홈) */
function goBack() {
  const prev = navStack.pop();
  show(prev || 'home', { back: true });
}

/* ---------- 글자 크기 3단 ---------- */

function applyFontStep() {
  document.documentElement.dataset.font = String(state.fontStep);
  localStorage.setItem('fontStep', String(state.fontStep));
  $('#btn-font .action-label').textContent = `글자 ${['작게', '보통', '크게'][state.fontStep - 1]}`;
}

function cycleFont() {
  state.fontStep = state.fontStep % 3 + 1;
  applyFontStep();
}

/* ---------- 로딩/알림 ---------- */

function setLoading(on, msg = '서류를 읽고 있어요…') {
  $('#loading-text').textContent = msg;
  $('#loading').classList.toggle('active', on);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('active');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('active'), 3200);
}

/* ---------- 사진 → 분석 ---------- */

async function compressImage(file, maxSize = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  return base64;
}

async function analyzePhoto(file) {
  setLoading(true, '사진을 준비하고 있어요…');
  try {
    const base64 = await compressImage(file);
    setLoading(true, '손주가 서류를 읽고 있어요…');
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
    });
    if (res.status === 429) throw new Error('rate');
    if (!res.ok) throw new Error('api');
    const data = await res.json();
    if (!data.ok) throw new Error('api');

    const result = data.result;
    // 1층 규칙 엔진: AI가 읽어낸 내용을 규칙으로 재검사 (이중 방어)
    const rules = runRules(result);
    result.위험도 = mergeRisk(result.위험도, rules.score);
    if (rules.reasons.length) {
      result.위험이유 = [result.위험이유, ...rules.reasons].filter(Boolean).join(' ');
    }

    if (result.문서종류 === '알수없음') {
      setLoading(false);
      showRetakeDialog();
      return;
    }

    state.result = result;
    state.originalFile = file;
    state.fromHistory = false;
    await addRecord(result);
    renderResult(result);
    show('result');
  } catch (err) {
    toast(err.message === 'rate'
      ? '너무 많이 사용했어요. 1시간 뒤에 다시 해주세요.'
      : '잠시 후 다시 시도해주세요.');
  } finally {
    setLoading(false);
  }
}

function showRetakeDialog() {
  $('#retake-dialog').classList.add('active');
}

/* ---------- 샘플 체험 ---------- */

function renderSamplePicker() {
  const wrap = $('#sample-list');
  wrap.innerHTML = '';
  for (const sample of SAMPLES) {
    const btn = document.createElement('button');
    btn.className = 'sample-item';
    btn.innerHTML = `
      <span class="sample-emoji">${sample.emoji}</span>
      <span class="sample-text">
        <span class="sample-label">${sample.label}</span>
        <span class="sample-caption">${sample.caption}</span>
      </span>
      <span class="chev">${svgIcon('chevron')}</span>`;
    btn.addEventListener('click', () => runSample(sample));
    wrap.appendChild(btn);
  }
}

async function runSample(sample) {
  $('#sample-dialog').classList.remove('active');
  // 샘플 서류를 잠깐 보여주고 분석 연출 (심사위원 체험 플로우)
  $('#sample-preview-img').src = sampleImageURL(sample);
  $('#sample-preview').classList.add('active');
  await new Promise((r) => { $('#btn-sample-analyze').onclick = r; });
  $('#sample-preview').classList.remove('active');

  setLoading(true, '손주가 서류를 읽고 있어요…');
  await new Promise((r) => setTimeout(r, 1400));
  setLoading(false);

  const result = JSON.parse(JSON.stringify(sample.result));
  state.result = result;
  state.originalFile = null;
  state.fromHistory = false;
  await addRecord(result);
  renderResult(result);
  show('result');
}

/* ---------- 결과 렌더링 ---------- */

function renderResult(result) {
  const risk = RISK_UI[result.위험도] || RISK_UI.주의;

  const banner = $('#risk-banner');
  banner.className = `risk-banner ${risk.cls}`;
  banner.innerHTML = `<span class="risk-emoji">${svgIcon(risk.icon)}</span> ${risk.label}`;

  $('#doc-type').textContent = result.문서종류 || '서류';
  $('#one-line').textContent = result.한줄요약 || '';

  // 핵심 주의 (약관 독소조항·동의 범위·복약 주의·문자 확인포인트 등)
  const kpList = $('#keypoint-list');
  kpList.innerHTML = '';
  const keypoints = result.핵심주의 || [];
  for (const kp of keypoints) {
    const li = document.createElement('li');
    li.className = 'keypoint-item';
    li.innerHTML = `<span class="kp-dot">•</span><span class="kp-text">${esc(kp)}</span>`;
    kpList.appendChild(li);
  }
  $('#card-keypoints').style.display = keypoints.length ? '' : 'none';

  // 할 일
  const todoList = $('#todo-list');
  todoList.innerHTML = '';
  const todos = result.할일 || [];
  for (const todo of todos) {
    const li = document.createElement('li');
    const meta = [
      todo.기한 && `<span class="todo-meta">⏰ ${esc(todo.기한)}</span>`,
      todo.장소 && `<span class="todo-meta">📍 ${esc(todo.장소)}</span>`,
      todo.준비물 && `<span class="todo-meta">🎒 ${esc(todo.준비물)}</span>`,
    ].filter(Boolean).join('');
    li.innerHTML = `<span class="todo-check">${svgIcon('checkbig')}</span>
      <span class="todo-body"><span class="todo-main">${esc(todo.내용 || '')}</span>${meta}</span>`;
    todoList.appendChild(li);
  }
  $('#card-todo').style.display = todos.length ? '' : 'none';

  // 쉬운 설명
  $('#easy-text').textContent = result.쉬운설명 || '';

  // 낱말 풀이
  const wordList = $('#word-list');
  wordList.innerHTML = '';
  const words = result.낱말풀이 || [];
  for (const w of words) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="word-hard">${esc(w.어려운말)}</span><span class="word-easy">→ ${esc(w.쉬운말)}</span>`;
    wordList.appendChild(li);
  }
  $('#card-words').style.display = words.length ? '' : 'none';

  // 사실 확인 (사업자등록·DART·시세)
  const fcList = $('#factcheck-list');
  fcList.innerHTML = '';
  const checks = result.사실확인 || [];
  for (const c of checks) {
    const iconName = c.정상 === true ? 'checkbig' : c.정상 === false ? 'warning' : 'verify';
    const iconCls = c.정상 === true ? 'fact-ok' : c.정상 === false ? 'fact-bad' : 'fact-info';
    const li = document.createElement('li');
    li.className = 'fact-item';
    const tel = c.전화
      ? `<a class="fact-tel" href="tel:${esc(c.전화.replace(/[^0-9]/g, ''))}">${svgIcon('phone')} ${esc(c.전화)} 전화 걸기</a>`
      : '';
    li.innerHTML = `<span class="fact-icon ${iconCls}">${svgIcon(iconName)}</span><span class="fact-body"><span class="fact-kind">${esc(c.종류)}</span><span class="fact-text">${esc(c.결과)}</span>${tel}</span>`;
    fcList.appendChild(li);
  }
  $('#card-factcheck').style.display = checks.length ? '' : 'none';

  // 위험 안내 (위험/주의 시)
  const dangerBox = $('#danger-box');
  if (result.위험도 !== '안전' && result.위험이유) {
    dangerBox.style.display = '';
    dangerBox.classList.toggle('is-danger', result.위험도 === '위험');
    $('#danger-reason').textContent = result.위험이유;
    $('#danger-actions').style.display = result.위험도 === '위험' ? '' : 'none';
  } else {
    dangerBox.style.display = 'none';
  }

  // 원본 동봉 체크박스: 분석 직후(원본 보유 시)에만 노출
  $('#share-original-row').style.display = state.originalFile ? '' : 'none';
  $('#chk-share-original').checked = false;

  // 결과 카드 PNG를 미리 생성해 캐시 (iOS Web Share는 탭 제스처 중 await가 있으면
  // 사용자 활성화가 소멸돼 실패하므로, 저장/공유 시점엔 이미 준비돼 있어야 함)
  prepareCard(result);
}

/** 결과 카드 File을 미리 만들어 state.cardFile에 캐시 */
function prepareCard(result) {
  state.cardFile = null;
  state.cardPromise = renderCard(result)
    .then((blob) => {
      const file = new File([blob], `효자손_${Date.now()}.png`, { type: 'image/png' });
      state.cardFile = file;
      return file;
    })
    .catch(() => null);
  return state.cardPromise;
}

/* ---------- 듣기 ---------- */

function resetSpeakButton() {
  $('#btn-speak .action-icon').innerHTML = svgIcon('volume');
  $('#btn-speak .action-label').textContent = '듣기';
}

function toggleSpeak() {
  if (!state.result) return;
  if (isSpeaking()) {
    stopSpeaking();
    resetSpeakButton();
    return;
  }
  const ok = speakResult(state.result, resetSpeakButton);
  if (!ok) {
    toast('이 휴대폰에서는 소리 읽기가 안 돼요.');
    return;
  }
  $('#btn-speak .action-icon').innerHTML = svgIcon('stop');
  $('#btn-speak .action-label').textContent = '멈추기';
}

/* ---------- 저장/공유 ---------- */

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// PC에서 <a download>로 카드 저장 (Android도 이 경로 → Downloads→갤러리 노출)
function downloadCardFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Web Share 파일 지원 여부 (iOS Safari·Android Chrome). canShare는 동기 호출이라 제스처 안전.
function canShareFiles(files) {
  try { return !!navigator.canShare && navigator.canShare({ files }); } catch { return false; }
}

async function saveCard() {
  if (!state.result) return;
  // iOS: 카드가 준비돼 있으면 await 없이 즉시 공유(사용자 활성화 유지) → 시트에서 '이미지 저장' → 사진 앱
  if (isIOS() && state.cardFile && canShareFiles([state.cardFile])) {
    try {
      await navigator.share({ files: [state.cardFile], title: '효자손 결과' });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('저장하지 못했어요. 다시 눌러주세요.');
    }
    return;
  }
  // Android/PC: 다운로드. 카드가 아직이면 잠깐 준비.
  setLoading(true, '사진을 만들고 있어요…');
  try {
    const file = state.cardFile || await (state.cardPromise || prepareCard(state.result));
    if (!file) throw new Error('no card');
    if (isIOS() && canShareFiles([file])) {
      await navigator.share({ files: [file], title: '효자손 결과' });
    } else {
      downloadCardFile(file);
      toast('사진첩(갤러리)에 저장했어요.');
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast('저장하지 못했어요. 다시 눌러주세요.');
  } finally {
    setLoading(false);
  }
}

async function shareToFamily() {
  if (!state.result) return;
  // 원본 동봉: 분석 직후 + 옵트인 체크 시에만 (원본은 마스킹 불가). originalFile은 동기 접근 가능.
  const includeOriginal = state.originalFile && $('#chk-share-original').checked;

  // iOS/Android: 카드가 준비돼 있으면 await 없이 즉시 공유 → 카톡 등 앱 목록(공유 시트)
  if (state.cardFile) {
    const files = [state.cardFile];
    if (includeOriginal) {
      files.push(new File([state.originalFile], '서류_원본.jpg',
        { type: state.originalFile.type || 'image/jpeg' }));
    }
    const payload = { files, title: '효자손', text: `[효자손] ${state.result.한줄요약}` };
    if (canShareFiles(files)) {
      try { await navigator.share(payload); } catch (err) {
        if (err?.name !== 'AbortError') toast('보내지 못했어요. 다시 눌러주세요.');
      }
      return;
    }
    if (canShareFiles([state.cardFile])) { // 카드만 폴백
      try { await navigator.share({ files: [state.cardFile], title: '효자손' }); } catch (err) {
        if (err?.name !== 'AbortError') toast('보내지 못했어요. 다시 눌러주세요.');
      }
      return;
    }
    // 공유 미지원(PC 등) → 저장 폴백
    downloadCardFile(state.cardFile);
    toast('공유가 안 되는 기기예요. 사진을 저장했으니 문자로 보내주세요.');
    return;
  }

  // 카드가 아직 준비 안 됨(드묾): 준비 후 저장 폴백
  setLoading(true, '보낼 준비를 하고 있어요…');
  try {
    const file = await (state.cardPromise || prepareCard(state.result));
    if (file) { downloadCardFile(file); toast('사진을 저장했어요. 문자로 보내주세요.'); }
  } finally {
    setLoading(false);
  }
}

/* ---------- 지난 서류 다시 보기 ---------- */

function riskDot(risk) {
  return { 안전: 'safe', 주의: 'warning', 위험: 'danger' }[risk] || 'warning';
}

async function renderHistory() {
  const wrap = $('#history-list');
  const empty = $('#history-empty');
  let records = [];
  try {
    records = await listRecords();
  } catch { /* IndexedDB 미지원 시 목록만 비움 */ }
  wrap.innerHTML = '';
  empty.style.display = records.length ? 'none' : '';
  $('#history-toolbar').style.display = records.length ? '' : 'none';

  for (const rec of records.slice(0, 20)) {
    const date = new Date(rec.date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `
      <button class="history-open">
        <span class="dot ${riskDot(rec.위험도)}"></span>
        <span class="history-text">
          <span class="history-title">${esc(rec.문서종류)}</span>
          <span class="history-date">${esc(date)}</span>
        </span>
        <span class="chev">${svgIcon('chevron')}</span>
      </button>
      <button class="history-del" aria-label="이 기록 지우기">${svgIcon('trash')}</button>`;
    row.querySelector('.history-open').addEventListener('click', () => {
      state.result = rec.result;
      state.originalFile = null;
      state.fromHistory = true;
      renderResult(rec.result);
      show('result');
    });
    row.querySelector('.history-del').addEventListener('click', async () => {
      // 어르신 오터치 방지: 개별 삭제도 한 번 확인
      if (!confirm(`'${rec.문서종류}' 기록을 지울까요?`)) return;
      await deleteRecord(rec.id);
      renderHistory();
    });
    wrap.appendChild(row);
  }
}

/* ---------- 초기화 ---------- */

function init() {
  hydrateIcons();
  applyFontStep();
  renderSamplePicker();
  renderHistory();

  // 홈
  $('#btn-camera').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) analyzePhoto(file);
  });
  $('#btn-sample').addEventListener('click', () => $('#sample-dialog').classList.add('active'));
  $('#btn-sample-close').addEventListener('click', () => $('#sample-dialog').classList.remove('active'));
  $('#btn-clear-history').addEventListener('click', async () => {
    if (confirm('기록을 모두 지울까요?')) {
      await clearRecords();
      renderHistory();
    }
  });

  // 결과
  $('#btn-back').addEventListener('click', goBack);
  $('#btn-speak').addEventListener('click', toggleSpeak);
  $('#btn-font').addEventListener('click', cycleFont);
  $('#btn-save').addEventListener('click', saveCard);
  $('#btn-share').addEventListener('click', shareToFamily);

  // 하단 탭바 + 데스크톱 상단 내비 (홈/기록/도움말)
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  // 약관·개인정보 처리방침 (푸터 링크 + 뒤로가기 화살표=이전페이지 / 홈버튼=처음화면)
  $('#link-terms').addEventListener('click', (e) => { e.preventDefault(); show('terms'); });
  $('#link-privacy').addEventListener('click', (e) => { e.preventDefault(); show('privacy'); });
  $('#btn-terms-back').addEventListener('click', goBack);
  $('#btn-terms-home').addEventListener('click', () => show('home'));
  $('#btn-privacy-back').addEventListener('click', goBack);
  $('#btn-privacy-home').addEventListener('click', () => show('home'));
  // 기록·도움말 화면의 뒤로가기 화살표
  $('#btn-history-back').addEventListener('click', goBack);
  $('#btn-help-back').addEventListener('click', goBack);

  // 다시 찍기 안내
  $('#btn-retake').addEventListener('click', () => {
    $('#retake-dialog').classList.remove('active');
    $('#file-input').click();
  });
  $('#btn-retake-close').addEventListener('click', () => $('#retake-dialog').classList.remove('active'));

  // 눌림 피드백: 어떤 버튼이든 누르는(터치·클릭) 즉시 플래시 클래스를 붙여
  // 최소 200ms 보이게 한다. 듣기·글자크기처럼 클릭 직후 내부(아이콘·라벨)를
  // 교체하는 버튼도 이 방식은 버튼 요소 자체에 표시하므로 리렌더에 씹히지 않는다.
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button, .tel-btn, .fact-tel, a.footer-links, .nav-link');
    if (!btn) return;
    btn.classList.add('tap-flash');
    setTimeout(() => btn.classList.remove('tap-flash'), 220);
  }, { passive: true });

  show('home');
}

init();
