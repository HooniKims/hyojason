/**
 * 📷 결과 카드 — Canvas API 세로형(9:16) 이미지 생성 (외부 라이브러리 불요)
 * 갤러리 썸네일에서도 신호등 색이 보이도록 상단 배너를 크게.
 */

const W = 1080;
const H = 1920;

const RISK_STYLE = {
  안전: { bg: '#1E8E3E', label: '🟢 안심하세요', text: '#FFFFFF' },
  주의: { bg: '#F9AB00', label: '🟡 주의가 필요해요', text: '#1A1A1A' },
  위험: { bg: '#D93025', label: '🔴 위험해요!', text: '#FFFFFF' },
};

/** 한글 단어 단위 줄바꿈 */
function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function font(ctx, size, weight = 700) {
  ctx.font = `${weight} ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
}

/** 분석 결과 → 카드 Blob(PNG). 주민번호류는 이미 서버/샘플 단계에서 마스킹됨 */
export async function renderCard(result) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const style = RISK_STYLE[result.위험도] || RISK_STYLE.주의;
  const M = 72; // 좌우 여백

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 상단 신호등 배너 (썸네일 시인성)
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = style.text;
  font(ctx, 84, 900);
  ctx.textAlign = 'center';
  ctx.fillText(style.label, W / 2, 185);

  ctx.textAlign = 'left';
  let y = 420;

  // 문서종류
  ctx.fillStyle = '#666666';
  font(ctx, 44, 700);
  ctx.fillText(result.문서종류 || '서류', M, y);
  y += 90;

  // 한 줄 요약 (최대 글씨)
  ctx.fillStyle = '#1A1A1A';
  font(ctx, 76, 900);
  for (const line of wrap(ctx, result.한줄요약, W - M * 2)) {
    ctx.fillText(line, M, y);
    y += 100;
  }
  y += 40;

  // 구분선
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  y += 90;

  // 할 일 체크리스트
  ctx.fillStyle = '#1A1A1A';
  font(ctx, 56, 900);
  ctx.fillText('✅ 할 일', M, y);
  y += 90;

  font(ctx, 48, 700);
  const todos = (result.할일 || []).slice(0, 4);
  for (const todo of todos) {
    const bits = [todo.내용, todo.기한, todo.장소, todo.준비물].filter(Boolean);
    const lines = wrap(ctx, `• ${bits.join(' / ')}`, W - M * 2 - 20);
    for (const line of lines.slice(0, 3)) {
      if (y > H - 320) break;
      ctx.fillText(line, M + 10, y);
      y += 68;
    }
    y += 24;
  }

  // 위험 시 신고처
  if (result.위험도 === '위험' && y < H - 380) {
    y += 20;
    ctx.fillStyle = '#D93025';
    font(ctx, 48, 900);
    ctx.fillText('🚨 가족에게 먼저 물어보세요', M, y);
    y += 70;
    font(ctx, 42, 900);
    ctx.fillText('경찰신고 112 · 금감원 1332 · 스미싱 118', M, y);
  }

  // 하단 푸터
  ctx.fillStyle = '#F1F3F5';
  ctx.fillRect(0, H - 180, W, 180);
  ctx.fillStyle = '#555555';
  font(ctx, 40, 700);
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(dateStr, M, H - 75);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1B6BD6';
  font(ctx, 44, 900);
  ctx.fillText('효자손 — 서류 읽어주는 AI 손주', W - M, H - 75);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
