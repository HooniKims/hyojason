/**
 * /api/analyze — 서류 사진 분석 (완전 stateless)
 *
 * 3층 사기 지킴이 중 2층(KISA 블랙리스트 대조)·3층(AI 문맥 판단) 담당.
 * - 주 모델: OpenAI gpt-5.4-nano (API 입력 기본 미학습, Structured Outputs로 JSON 보장)
 * - GEMINI_API_KEY가 있으면 Gemini 2.5 Flash가 폴백으로 자동 추가 (이중화)
 *   (서로 다른 회사의 모델로 이중화 → 한쪽 장애·정책 변경에도 견고)
 * - 응답 후 이미지 즉시 폐기, 로그에 이미지·개인정보 미기록
 */

import { isPhishing } from './lib/phishing.js';
import { runFactChecks } from './lib/factcheck.js';
import { extractQrUrls } from './lib/qr.js';

export const config = { maxDuration: 60 };

/** 최근 n개월의 yyyymm 목록 (부동산 실거래 조회월) */
function recentMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 1; i <= n; i += 1) {
    d.setMonth(d.getMonth() - 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024; // base64 포함 요청 상한
const RATE_LIMIT = 20;                  // IP당 시간당 허용 횟수
const RATE_WINDOW_MS = 60 * 60 * 1000;

// 인스턴스 단위 rate limit (서버리스 특성상 완전하지 않음 — 과금 폭주 1차 방어선.
// 지출 한도는 모델 콘솔의 월 한도 설정이 최종 방어선)
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW_MS) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count += 1;
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  return rec.count > RATE_LIMIT;
}

const SYSTEM_PROMPT = `당신은 어르신의 다정한 손주 역할을 하는 AI입니다.
첨부된 서류 사진을 분석해 아래 JSON으로만 답하세요.

[말투 규칙]
- 존댓말, 초등학교 5학년이 이해할 어휘만 사용
- 한자어·행정용어는 반드시 일상어로 바꿈
  (예: "납부하다"→"돈을 내다", "과태료"→"벌금")

[문서 유형별 안내 — "핵심주의"에 무엇을 담을지]
- 고지서/납부: 얼마를, 언제까지, 안 내면 어떻게 되는지
- 약관/계약서(보험·통신·대출): 위약금, 해지 방법, 자동 연장 여부, 손해볼 수 있는 독소조항.
  여러 장 중 일부만 보이면 "계약서 전체를 다시 보여주시면 더 자세히 알려드려요"를 할일에 포함
- 문자 안내(택배·예약·은행·관공서): 무엇을 하라는 문자인지, 진짜인지 가짜인지
- 병원/약 안내: 언제 어떻게 먹거나 하는지, 주의할 점 (의료 판단은 단정하지 말 것)
- 신청서/동의서: 무엇에 동의하는지, 어떤 개인정보를 주게 되는지, 서명 전 확인할 점
- 복지/혜택: 받을 수 있는 것, 신청 방법과 기한

[출력 형식]
{
 "문서분류": "고지서|약관계약|문자안내|병원약|신청동의|복지혜택|사기의심|기타 중 하나",
 "문서종류": "",
 "한줄요약": "25자 이내",
 "쉬운설명": "3~4문장",
 "핵심주의": ["이 문서에서 특히 조심하거나 꼭 기억할 점 (문서 유형에 맞게, 없으면 빈 배열)"],
 "할일": [{"내용":"", "기한":"", "장소":"", "준비물":""}],
 "낱말풀이": [{"어려운말":"", "쉬운말":""}],
 "위험도": "안전|주의|위험",
 "위험이유": "",
 "URL목록": ["서류에 보이는 인터넷 주소를 그대로 나열, 없으면 빈 배열"],
 "사업자번호": "서류에 사업자등록번호(10자리)가 있으면 숫자만, 없으면 빈 문자열",
 "발신기관": "서류를 보낸 기관·회사 이름, 없으면 빈 문자열",
 "부동산거래": "매매|전세|월세 중 해당되면 하나, 부동산 서류가 아니면 빈 문자열",
 "부동산지역": "부동산의 시군구(예: 서울 강남구), 없으면 빈 문자열",
 "부동산금액": "매매가 또는 전세보증금(만원 단위 숫자만), 없으면 빈 문자열"
}

[안전 규칙]
- 다음 중 하나라도 뚜렷하면 위험도를 반드시 "위험"으로 정하세요:
  · 수사기관·정부기관·공공기관·금융회사 사칭 정황(가짜/위조 공문 포함)
  · 주민등록번호·계좌번호·비밀번호·인증번호 등 개인정보 입력·전송 요구
  · 국민지원금·환급금·당첨·대출 등을 미끼로 한 링크·QR 유도
  · "오늘까지·즉시·구속·압류·과태료" 등으로 겁을 주며 링크·이체를 재촉
  · 계좌이체·송금 요구
- 중요: 정상적인 서류(은행 명세서, 정부 고지서, 안내문)에도 인터넷 주소나 QR코드가
  들어 있을 수 있습니다. 링크·QR이 '있다'는 것만으로 위험으로 판정하지 마세요.
  링크·QR은 위의 사칭·미끼·개인정보 요구·겁박과 함께 있을 때만 위험 신호입니다.
- 애매하면 "주의"로, 안전 신호만 있으면 "안전"으로 정하세요.
  (QR·링크만 있고 사칭·미끼·개인정보 요구가 없으면 "주의"까지만.)
- 서류에 보이는 주민등록번호·계좌번호 등 식별정보는
  출력에서 일부 마스킹(예: 800101-1******)
- 내용이 불확실하면 추측하지 말고
  "가까운 주민센터나 해당 기관에 확인하세요"를 할일에 포함
- 의료·법률적 판단은 단정하지 않음
- 사진에서 서류 글자를 알아볼 수 없으면 문서종류를 "알수없음"으로 하고
  쉬운설명에 "사진이 흐려서 읽지 못했어요"라고 적음`;

const REQUIRED_KEYS = ['문서종류', '한줄요약', '쉬운설명', '할일', '낱말풀이', '위험도'];
const RISK_LEVELS = ['안전', '주의', '위험'];

// OpenAI Structured Outputs 스키마 (strict: 모든 필드 required + additionalProperties:false)
const OPENAI_SCHEMA = {
  name: 'document_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      문서분류: { type: 'string' },
      문서종류: { type: 'string' },
      한줄요약: { type: 'string' },
      쉬운설명: { type: 'string' },
      핵심주의: { type: 'array', items: { type: 'string' } },
      할일: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            내용: { type: 'string' },
            기한: { type: 'string' },
            장소: { type: 'string' },
            준비물: { type: 'string' },
          },
          required: ['내용', '기한', '장소', '준비물'],
        },
      },
      낱말풀이: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            어려운말: { type: 'string' },
            쉬운말: { type: 'string' },
          },
          required: ['어려운말', '쉬운말'],
        },
      },
      위험도: { type: 'string', enum: RISK_LEVELS },
      위험이유: { type: 'string' },
      URL목록: { type: 'array', items: { type: 'string' } },
      사업자번호: { type: 'string' },
      발신기관: { type: 'string' },
      부동산거래: { type: 'string' },
      부동산지역: { type: 'string' },
      부동산금액: { type: 'string' },
    },
    required: ['문서분류', '문서종류', '한줄요약', '쉬운설명', '핵심주의', '할일', '낱말풀이', '위험도', '위험이유', 'URL목록',
      '사업자번호', '발신기관', '부동산거래', '부동산지역', '부동산금액'],
  },
};

function parseAndValidate(text) {
  // 모델이 코드펜스로 감싸는 경우 제거
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no json');
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  for (const k of REQUIRED_KEYS) {
    if (!(k in obj)) throw new Error(`missing key: ${k}`);
  }
  if (!RISK_LEVELS.includes(obj.위험도)) obj.위험도 = '주의';
  if (!Array.isArray(obj.할일)) obj.할일 = [];
  if (!Array.isArray(obj.낱말풀이)) obj.낱말풀이 = [];
  if (!Array.isArray(obj.URL목록)) obj.URL목록 = [];
  if (!Array.isArray(obj.핵심주의)) obj.핵심주의 = [];
  if (typeof obj.문서분류 !== 'string') obj.문서분류 = '기타';
  return obj;
}

/** 주민번호·카드번호 후처리 마스킹 (프롬프트 마스킹의 2차 방어) */
function maskPII(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(\d{6})[-\s]?([1-4])\d{6}/g, '$1-$2******')
      .replace(/(\d{4})[-\s]?(\d{4})[-\s]?\d{4}[-\s]?(\d{4})/g, '$1-$2-****-$3');
  }
  if (Array.isArray(value)) return value.map(maskPII);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskPII(v);
    return out;
  }
  return value;
}

async function callGemini(imageBase64, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini http ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini empty response');
  return text;
}

async function callOpenAI(imageBase64, mimeType) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-5.4-nano',
      reasoning_effort: 'low',        // 단순 추출 작업 — 비용·지연 최소화
      max_completion_tokens: 3000,    // 추론 토큰 + JSON 출력 여유분
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '첨부한 서류 사진을 분석해 규칙에 맞는 JSON으로 답하세요.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: OPENAI_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`openai http ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai empty response');
  return text;
}

/**
 * 모델 어댑터 체인: 각 어댑터를 순서대로 시도(어댑터당 2회 재시도).
 * 주 모델은 gpt-5.4-nano. GEMINI_API_KEY가 있으면 Gemini 2.5 Flash를 폴백으로 뒤에 추가.
 */
async function analyze(imageBase64, mimeType) {
  const adapters = [{ name: 'openai', fn: callOpenAI }];
  if (process.env.GEMINI_API_KEY) adapters.push({ name: 'gemini', fn: callGemini });
  let lastErr;
  for (const adapter of adapters) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await adapter.fn(imageBase64, mimeType);
        return { result: parseAndValidate(text), model: adapter.name };
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr;
}

/** 2층: KISA 피싱 URL 블랙리스트 대조 (KV 미설정 시 조용히 건너뜀) */
async function checkBlacklist(urls) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token || !urls.length) return [];
  try {
    const res = await fetch(`${base}/get/kisa_phishing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const { result } = await res.json();
    if (!result) return [];
    const index = JSON.parse(result); // { urls: [...], domains: [...] }
    return urls.filter((u) => isPhishing(u, index));
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '허용되지 않는 요청입니다' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    res.status(429).json({ error: '잠시 후 다시 시도해주세요' });
    return;
  }

  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: '사진이 없습니다' });
      return;
    }
    if (image.length > MAX_BODY_BYTES) {
      res.status(413).json({ error: '사진이 너무 큽니다. 다시 찍어주세요' });
      return;
    }
    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      ? mimeType : 'image/jpeg';

    const { result, model } = await analyze(image, mime);

    // QR 코드 디코딩 — 이미지 속 QR에서 URL 추출(접속하지 않음, 실패 시 조용히 무시).
    // 가짜 고지서가 링크 대신 QR을 쓰는 신종 수법 대응.
    const qrUrls = extractQrUrls(image, mime);
    const allUrls = [...new Set([...(result.URL목록 || []), ...qrUrls])];
    if (qrUrls.length) result.URL목록 = allUrls;

    // 2층 블랙리스트 대조 — 걸리면 무조건 '위험'으로 격상
    const flagged = await checkBlacklist(allUrls);
    const qrFlagged = flagged.filter((u) => qrUrls.includes(u));
    if (flagged.length) {
      result.위험도 = '위험';
      result.위험이유 = [
        qrFlagged.length
          ? 'QR코드가 사기 사이트로 연결됩니다. QR코드를 절대 찍지 마세요.'
          : '서류에 있는 인터넷 주소가 사기 사이트 명단(한국인터넷진흥원)에 있습니다.',
        result.위험이유,
      ].filter(Boolean).join(' ');
    }

    // 사실확인: 사업자등록·DART·부동산 시세 대조 (실존/시세로 사기 정황 보강)
    const { checks, riskBump } = await runFactChecks(result, recentMonths(6));
    result.사실확인 = checks;
    if (riskBump === '위험') result.위험도 = '위험';
    else if (riskBump === '주의' && result.위험도 === '안전') result.위험도 = '주의';

    const masked = maskPII(result);
    // 이미지 변수는 이 응답과 함께 폐기됨 (저장·로깅 없음)
    res.status(200).json({ ok: true, model, result: masked });
  } catch {
    // 오류 로그에도 요청 내용(이미지)은 남기지 않음
    res.status(502).json({ error: '잠시 후 다시 시도해주세요' });
  }
}
