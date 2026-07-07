/**
 * 🔊 듣기 — 1순위 Google Gemini TTS(/api/tts, 자연스러운 한국어),
 *           폴백 브라우저 Web Speech(ko-KR, 비용 0).
 *
 * 핵심: 안내문을 문장 단위로 쪼개 동시에(병렬) 생성하고, 첫 문장이 준비되는
 * 즉시 재생을 시작한다. 전체를 한 번에 만들면 150자 안내문이 13초나 걸리지만,
 * 문장 병렬 + 순차 재생이면 첫 소리까지 ~3초로 줄어든다.
 * Google 실패·미설정·오프라인이면 Web Speech로 폴백해 서비스가 멈추지 않게 한다.
 */

let speaking = false;
let audioEl = null;                     // 현재 재생 중인 HTMLAudioElement
let cache = { key: null, blobs: null }; // 프리페치된 문장별 음성(blob Promise 배열)

export function isSpeaking() {
  return speaking;
}

export function stopSpeaking() {
  speaking = false;
  if (audioEl) { try { audioEl.pause(); } catch { /* noop */ } audioEl = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** 문단을 문장 단위로 쪼갠다 (문장별 병렬 생성 + 자연스러운 호흡) */
function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 읽어줄 전체 안내문. 음성안내가 있으면 그것을, 없으면 항목을 조합. */
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

async function fetchTtsBlob(text, prev, next) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // prev/next(앞뒤 문장)를 함께 넘겨 ElevenLabs가 문맥을 이어(stitching) 생성한다.
    body: JSON.stringify({ text, prev, next }),
  });
  if (!res.ok) throw new Error('tts api');
  return res.blob();
}

/**
 * 문장 배열을 병렬로 생성 시작(각각 blob Promise).
 * 앞뒤 문장을 문맥으로 함께 넘겨, 문장이 바뀔 때 톤·억양이 튀지 않게 한다.
 */
function generateSentences(sentences) {
  return sentences.map((s, i) => fetchTtsBlob(s, sentences[i - 1], sentences[i + 1]));
}

/**
 * 결과 화면 진입 시 문장별 음성을 미리(병렬) 만들어 둔다.
 * 어르신이 화면을 읽는 동안 준비 → '듣기'를 누르면 첫 문장부터 바로 재생.
 */
export function prefetchTts(result) {
  const text = buildText(result);
  if (!text) return;
  const sentences = splitSentences(text);
  if (!sentences.length) return;
  const key = sentences.join('|');
  if (cache.key === key && cache.blobs) return; // 이미 준비 중/완료
  cache = { key, blobs: generateSentences(sentences) };
  cache.blobs.forEach((p) => p.catch(() => { /* 실패는 듣기 때 폴백 */ }));
}

/** blob 하나를 재생하고 끝날 때까지 기다린다. onStart는 실제 소리가 날 때 1회. */
function playBlob(blob, onStart) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    audioEl = new Audio(url);
    audioEl.playbackRate = 0.96; // 어르신 청취용 살짝 느리게
    audioEl.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audioEl.onerror = () => { URL.revokeObjectURL(url); reject(new Error('play')); };
    audioEl.play().then(() => onStart?.()).catch(reject);
  });
}

/** 1순위: Google TTS. 문장별 병렬 생성 → 준비되는 순서대로 이어 재생. */
async function speakGoogle(result, onEnd, onReady) {
  const sentences = splitSentences(buildText(result));
  const key = sentences.join('|');
  const blobs = (cache.key === key && cache.blobs)
    ? cache.blobs                 // 프리페치 재사용
    : generateSentences(sentences);

  let started = false;
  for (let i = 0; i < blobs.length; i += 1) {
    if (!speaking) return;
    let blob;
    try {
      blob = await blobs[i];       // 첫 문장은 짧아 ~3초, 나머지는 대개 이미 준비됨
    } catch (err) {
      if (!started) throw err;     // 첫 문장 실패 → 전체 Web Speech 폴백
      continue;                    // 이미 재생 중이면 실패한 문장만 건너뜀(목소리 유지)
    }
    if (!speaking) return;
    try {
      // 첫 조각만 throw 허용(폴백 트리거). 이후엔 재생 중 다른 목소리로 바뀌지 않게 건너뜀.
      await playBlob(blob, () => { if (!started) { started = true; onReady?.(); } });
    } catch (err) {
      if (!started) throw err;
    }
  }
  speaking = false;
  onEnd?.();
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
  if (!buildText(result)) return false;

  speaking = true;
  // 1순위 Google, 실패하면 Web Speech 폴백
  speakGoogle(result, onEnd, onReady).catch(() => {
    if (!speaking) return; // 사용자가 그새 멈춤
    const ok = speakWebSpeech(result, onEnd, onReady);
    if (!ok) { speaking = false; onEnd?.(); }
  });
  return true;
}
