/**
 * 🔊 듣기 — 1순위 Google Gemini TTS(/api/tts, 자연스러운 한국어),
 *           폴백 브라우저 Web Speech(ko-KR, 비용 0).
 *
 * Google 음성이 훨씬 자연스러워 기본으로 쓰되, 실패·미설정·오프라인이면
 * 즉시 Web Speech로 폴백해 서비스가 멈추지 않게 한다.
 */

let speaking = false;
let audioEl = null;        // Google TTS 재생용 HTMLAudioElement
let audioUrl = null;       // objectURL (해제용)
let cache = { text: null, promise: null }; // 프리페치된 음성(blob) 캐시

export function isSpeaking() {
  return speaking;
}

export function stopSpeaking() {
  speaking = false;
  if (audioEl) { try { audioEl.pause(); } catch { /* noop */ } audioEl = null; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** 긴 문단을 문장 단위로 쪼갠다 (Web Speech의 긴 발화 끊김 방지) */
function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 읽어줄 전체 안내문(한 덩어리). 음성안내가 있으면 그것을, 없으면 항목을 조합. */
function buildText(result) {
  if (result.음성안내 && result.음성안내.trim()) return result.음성안내.trim();
  const parts = [
    result.한줄요약,
    result.쉬운설명,
    ...(result.할일 || []).map((t) => {
      const bits = [t.내용, t.기한, t.장소 && `장소는 ${t.장소}`, t.준비물 && `${t.준비물} 준비하세요`];
      return bits.filter(Boolean).join('. ');
    }),
    result.위험도 === '위험' ? '이 서류는 위험해요. 가족에게 먼저 물어보세요.' : '',
  ].filter(Boolean);
  return parts.join(' ');
}

async function fetchTtsBlob(text) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('tts api');
  return res.blob();
}

/**
 * 결과 화면 진입 시 음성을 미리 만들어 둔다(생성에 수 초 걸려 UX상 필수).
 * 어르신이 화면을 읽는 동안 백그라운드로 준비 → '듣기'를 누르면 즉시 재생.
 */
export function prefetchTts(result) {
  const text = buildText(result);
  if (!text) return;
  if (cache.text === text && cache.promise) return; // 이미 준비 중/완료
  cache = { text, promise: fetchTtsBlob(text) };
  cache.promise.catch(() => { /* 실패해도 조용히 — 듣기 때 폴백 */ });
}

/** 1순위: Google TTS. 프리페치된 음성이 있으면 즉시, 없으면 생성 대기. */
async function speakGoogle(text, onEnd, onReady) {
  const blob = (cache.text === text && cache.promise)
    ? await cache.promise            // 프리페치 재사용(대개 즉시)
    : await fetchTtsBlob(text);
  if (!speaking) return; // 그새 멈춤 눌림
  audioUrl = URL.createObjectURL(blob);
  audioEl = new Audio(audioUrl);
  audioEl.playbackRate = 0.96; // 어르신 청취용 살짝 느리게
  audioEl.onended = () => {
    speaking = false;
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
    audioEl = null;
    onEnd?.();
  };
  await audioEl.play();
  onReady?.();
}

/** 폴백: 브라우저 Web Speech. */
function speakWebSpeech(result, onEnd, onReady) {
  if (!('speechSynthesis' in window)) { speaking = false; onEnd?.(); return false; }
  const parts = splitSentences(buildText(result));
  if (!parts.length) { speaking = false; onEnd?.(); return false; }
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === 'ko-KR')
    || voices.find((v) => v.lang && v.lang.startsWith('ko')) || null;
  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (voice) u.voice = voice;
    u.rate = 0.85;
    u.pitch = 1;
    if (i === parts.length - 1) {
      u.onend = () => { speaking = false; onEnd?.(); };
    }
    speechSynthesis.speak(u);
  });
  onReady?.();
  return true;
}

/**
 * 결과를 읽어 준다. 다시 부르면 멈춤.
 * @param onEnd   재생이 끝나면 호출 (버튼 원복용)
 * @param onReady 실제 소리가 나기 시작하면 호출 (로딩 → 멈추기 표시 전환용)
 * @returns 'stopped'(멈춤 처리) | true(시작) | false(읽을 내용 없음)
 */
export function speakResult(result, onEnd, onReady) {
  if (speaking) { stopSpeaking(); onEnd?.(); return 'stopped'; }
  const text = buildText(result);
  if (!text) return false;

  speaking = true;
  // 1순위 Google, 실패하면 Web Speech 폴백
  speakGoogle(text, onEnd, onReady).catch(() => {
    if (!speaking) return; // 사용자가 그새 멈춤
    const ok = speakWebSpeech(result, onEnd, onReady);
    if (!ok) { speaking = false; onEnd?.(); }
  });
  return true;
}
