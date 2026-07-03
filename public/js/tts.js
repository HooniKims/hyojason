/**
 * 🔊 듣기 — 브라우저 Web Speech API (ko-KR), 외부 의존성·비용 0
 */

let speaking = false;

function pickKoreanVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'ko-KR')
    || voices.find((v) => v.lang && v.lang.startsWith('ko'))
    || null;
}

export function isSpeaking() {
  return speaking;
}

export function stopSpeaking() {
  speaking = false;
  speechSynthesis.cancel();
}

/** 긴 문단을 문장 단위로 쪼갠다 (Chrome의 긴 발화 끊김 방지 + 자연스러운 호흡) */
function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 읽어줄 문장 목록을 만든다. 음성안내(자연스러운 설명)가 있으면 그것을, 없으면 항목을 조합. */
function buildParts(result) {
  if (result.음성안내 && result.음성안내.trim()) {
    return splitSentences(result.음성안내);
  }
  // 폴백: 예전 방식(항목 조합) — 음성안내가 없는 기록 등
  return [
    result.한줄요약,
    result.쉬운설명,
    result.할일?.length ? '할 일을 알려드릴게요.' : '',
    ...(result.할일 || []).map((t, i) => {
      const bits = [t.내용, t.기한, t.장소 && `장소는 ${t.장소}`, t.준비물 && `${t.준비물} 준비하세요`];
      return `${i + 1}번. ${bits.filter(Boolean).join('. ')}`;
    }),
    result.위험도 === '위험' ? '이 서류는 위험해요. 가족에게 먼저 물어보세요.' : '',
  ].filter(Boolean);
}

/** 결과를 어르신 속도로 또박또박 읽는다. 다시 누르면 멈춤. */
export function speakResult(result, onEnd) {
  if (!('speechSynthesis' in window)) return false;
  if (speaking) {
    stopSpeaking();
    onEnd?.();
    return true;
  }
  const parts = buildParts(result);
  if (!parts.length) return false;

  speaking = true;
  const voice = pickKoreanVoice();
  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (voice) u.voice = voice;
    u.rate = 0.85; // 어르신 청취 속도
    u.pitch = 1;
    if (i === parts.length - 1) {
      u.onend = () => { speaking = false; onEnd?.(); };
    }
    speechSynthesis.speak(u);
  });
  return true;
}

// 일부 브라우저는 voices를 늦게 로드함
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {};
}
