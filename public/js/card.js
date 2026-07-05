/**
 * 📷 결과 카드 — Canvas API 세로형 이미지 생성 (외부 라이브러리 불요)
 * 갤러리 썸네일에서도 신호등 색이 보이도록 상단 배너를 크게.
 * 내용(요약·설명·핵심주의·할 일·낱말풀이·신고처)이 모두 들어가도록 높이를 자동 확장한다.
 */

const W = 1080;
const M = 72;                 // 좌우 여백
const MIN_H = 1350;           // 최소 높이(9:16 느낌 유지). 내용 많으면 자동으로 늘어남

const RISK_STYLE = {
  안전: { bg: '#1E8E3E', label: '🟢 안심하세요', text: '#FFFFFF' },
  주의: { bg: '#F9AB00', label: '🟡 주의가 필요해요', text: '#1A1A1A' },
  위험: { bg: '#D93025', label: '🔴 위험해요!', text: '#FFFFFF' },
};

function font(ctx, size, weight = 700) {
  ctx.font = `${weight} ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
}

/** 한글 단어 단위 줄바꿈 */
function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
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

/**
 * 카드에 그릴 블록 목록을 만든다. 각 블록은 {draw(ctx,y)→다음y, measure(ctx)→높이}.
 * 측정 패스와 그리기 패스가 같은 로직을 쓰도록 draw 하나로 통일(측정 시엔 그리기 스킵).
 */
function buildBlocks(result) {
  const contentW = W - M * 2;
  const blocks = [];

  // 문서종류
  blocks.push((ctx, y, paint) => {
    font(ctx, 42, 700);
    if (paint) { ctx.fillStyle = '#666'; ctx.textAlign = 'left'; ctx.fillText(result.문서종류 || '서류', M, y + 42); }
    return y + 42 + 26;
  });

  // 한 줄 요약 (대형)
  blocks.push((ctx, y, paint) => {
    font(ctx, 66, 900);
    const lines = wrap(ctx, result.한줄요약 || '', contentW);
    let yy = y;
    for (const ln of lines) { if (paint) { ctx.fillStyle = '#1A1A1A'; ctx.fillText(ln, M, yy + 66); } yy += 66 + 14; }
    return yy + 16;
  });

  // 구분선
  blocks.push((ctx, y, paint) => {
    if (paint) { ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); }
    return y + 40;
  });

  // 섹션 헬퍼: 제목 + 여러 줄
  const section = (title, titleColor, lines, lineSize = 40) => (ctx, y, paint) => {
    let yy = y;
    font(ctx, 46, 900);
    if (paint) { ctx.fillStyle = titleColor; ctx.textAlign = 'left'; ctx.fillText(title, M, yy + 46); }
    yy += 46 + 22;
    font(ctx, lineSize, 700);
    for (const ln of lines) {
      const wrapped = wrap(ctx, ln, contentW - 20);
      for (const w of wrapped) { if (paint) { ctx.fillStyle = '#1A1A1A'; ctx.fillText(w, M + 12, yy + lineSize); } yy += lineSize + 12; }
      yy += 8;
    }
    return yy + 26;
  };

  // 쉬운 설명
  if (result.쉬운설명) blocks.push(section('📖 쉬운 설명', '#1B6BD6', [result.쉬운설명], 40));

  // 핵심 주의
  const keypoints = (result.핵심주의 || []).filter(Boolean);
  if (keypoints.length) blocks.push(section('⚠️ 꼭 기억하세요', '#C77F00', keypoints.map((k) => `• ${k}`), 40));

  // 할 일 (전부)
  const todos = (result.할일 || []).filter((t) => t && (t.내용 || t.기한 || t.장소 || t.준비물));
  if (todos.length) {
    const todoLines = todos.map((t) => `• ${[t.내용, t.기한, t.장소, t.준비물].filter(Boolean).join(' / ')}`);
    blocks.push(section('✅ 할 일', '#1E8E3E', todoLines, 42));
  }

  // 낱말 풀이
  const words = (result.낱말풀이 || []).filter((w) => w && w.어려운말);
  if (words.length) blocks.push(section('🔤 어려운 말 풀이', '#1B6BD6', words.map((w) => `• ${w.어려운말} → ${w.쉬운말}`), 40));

  // 위험 시 신고처
  if (result.위험도 === '위험') {
    blocks.push(section('🚨 이렇게 하세요', '#D93025', [
      '가족에게 먼저 물어보세요.',
      '경찰신고 112 · 금융감독원 1332 · 스미싱 118',
    ], 42));
  }

  return blocks;
}

/** 분석 결과 → 카드 Blob(PNG). 주민번호류는 이미 서버/샘플 단계에서 마스킹됨 */
export async function renderCard(result) {
  const BANNER = 300;
  const FOOTER = 150;
  const blocks = buildBlocks(result);

  // 1패스: 측정용 캔버스로 필요한 본문 높이 계산
  const meas = document.createElement('canvas').getContext('2d');
  let bodyY = BANNER + 60;
  for (const b of blocks) bodyY = b(meas, bodyY, false);
  const H = Math.max(MIN_H, Math.ceil(bodyY + 60 + FOOTER));

  // 2패스: 실제 그리기
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const style = RISK_STYLE[result.위험도] || RISK_STYLE.주의;

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 상단 신호등 배너
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, BANNER);
  ctx.fillStyle = style.text;
  font(ctx, 80, 900);
  ctx.textAlign = 'center';
  ctx.fillText(style.label, W / 2, BANNER / 2 + 28);

  // 본문
  ctx.textAlign = 'left';
  let y = BANNER + 60;
  for (const b of blocks) y = b(ctx, y, true);

  // 하단 푸터
  ctx.fillStyle = '#F1F3F5';
  ctx.fillRect(0, H - FOOTER, W, FOOTER);
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#555555';
  font(ctx, 38, 700);
  ctx.textAlign = 'left';
  ctx.fillText(dateStr, M, H - FOOTER / 2 + 14);
  ctx.fillStyle = '#1B6BD6';
  font(ctx, 40, 900);
  ctx.textAlign = 'right';
  ctx.fillText('효자손 — 서류 읽어주는 AI 손주', W - M, H - FOOTER / 2 + 14);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
