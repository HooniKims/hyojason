/**
 * 1층 사기 지킴이 — 클라이언트 규칙 엔진 (정규식·휴리스틱)
 * KISA 보호나라 공식 수칙 기반 규칙화. 출처: KISA 보호나라(boho.or.kr)
 */

const SHORT_URL = /(bit\.ly|han\.gl|me2\.do|url\.kr|t\.ly|c11\.kr|vo\.la|buly\.kr|lrl\.kr|zrr\.kr|abit\.ly|tinyurl\.com|goo\.gl)/i;
const URGENCY = /(긴급|즉시|금일|오늘까지|지금 바로|24시간 이내|최후|마지막 통보|압류|출두|법적\s*조치|형사\s*처벌|구속|과태료|행정처분|영업정지|벌금\s*부과)/;
const ACCOUNT = /\d{2,6}[- ]\d{2,6}[- ]\d{2,8}|계좌\s*(번호|로)\s*(이체|입금|송금)/;
const TRANSFER = /(이체|입금|송금)\s*(하|해|바랍|요청|요구)|안전\s*계좌/;
const PERSONAL_INFO = /(주민등록번호|주민번호|비밀번호|계좌\s*비밀|보안카드|OTP|인증번호)\s*(를|을)?\s*(입력|회신|전송|알려|기재|제출)/;
const REMOTE_APP = /(팀뷰어|TeamViewer|애니데스크|AnyDesk|퀵서포트|QuickSupport|원격\s*제어|원격\s*지원\s*앱)/i;
const APP_INSTALL = /(앱|어플|애플리케이션|프로그램)\s*(을|를)?\s*(설치|다운)/;
const GOV_IMPERSONATION = /(검찰|검사|경찰|금융감독원|금감원|국세청|법원|수사관|사이버수사대|식약처|식품의약품안전처|관세청|질병관리청|우체국)/;

// 인터넷 링크 존재
const LINK = /(https?:\/\/|www\.)/i;
// 링크 뒤 개인정보·주소 입력 유도 (스미싱 전형)
const INPUT_REQUEST = /(주소|주민등록번호|주민번호|계좌|비밀번호|보안카드|OTP|인증번호|개인정보)\s*(를|을)?\s*(정확히\s*)?(입력|기입|기재|회신|전송|알려|제출)/;
// 미끼(지원금·환급·당첨·대출 등)
const BAIT = /(국민지원금|재난지원금|지원금|환급금|환급|보조금|당첨|경품|무료\s*쿠폰|저금리|대출\s*(가능|한도|전환))/;
// 분석 결과 자체가 사기로 판명된 강한 명사 (모델이 서술로 인지했으나 위험도를 낮게 매긴 경우 상향)
const SCAM_VERDICT = /(보이스\s*피싱|피싱|스미싱|사칭|위조\s*공문|가짜\s*(?:문서|공문|독촉장|고지서))/g;
// 사기 단어 바로 뒤 부정 표현 (안전 문서가 "사칭 정황이 없어요"처럼 언급한 경우 오탐 방지)
const NEGATION_AFTER = /^.{0,20}?(없|아니|아님|아녜|않|보이지\s*않)/;

/** 사기 명사가 '부정문이 아닌' 형태로 최소 1회 등장하는지 (안전 문서의 부정 언급은 제외) */
function hasScamVerdict(text) {
  SCAM_VERDICT.lastIndex = 0;
  let m;
  while ((m = SCAM_VERDICT.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length);
    if (!NEGATION_AFTER.test(after)) return true;
  }
  return false;
}

/**
 * 서류에서 읽힌 텍스트(AI 결과 포함)를 규칙으로 검사한다.
 * @returns {{score: number, reasons: string[]}} score 0=안전 신호 없음, 1=주의, 2=위험
 */
export function runRules(input) {
  // 객체를 받으면 정밀 처리:
  //  - 규칙은 '문서 내용' 필드(문서종류/한줄요약/쉬운설명/할일/URL목록)만 스캔한다.
  //  - 모델의 위험도 설명인 '위험이유'는 제외한다. (안전 문서에도 "링크·개인정보
  //    입력 유도 정황 없음"처럼 사기 어휘로 가득 차 있어 오탐을 일으키기 때문)
  //  - 사기 명사(피싱·위조)는 문서종류·한줄요약에서만 판정(부정문 오탐 방지).
  //  - 규칙은 추출형 헤드라인(문서종류·한줄요약)만 스캔한다. 쉬운설명·할일·위험이유는
  //    모델의 조언/경고 prose("입력하라는 요구가 있는지 확인하세요", "누르지 마세요")를
  //    담아, 사기 어휘가 정상 문서에도 섞여 오탐을 일으키므로 스캔 대상에서 제외한다.
  //  - hasLink는 URL목록(추출된 실제 주소)으로 판정한다.
  const isObj = input && typeof input === 'object';
  let t; let urls = [];
  if (isObj) {
    urls = input.URL목록 || [];
    t = `${input.문서종류 || ''} ${input.한줄요약 || ''}`;
  } else {
    t = String(input || '');
  }
  const verdictText = t;
  const reasons = [];
  let score = 0;

  const hasUrgency = URGENCY.test(t);
  const hasAccount = ACCOUNT.test(t);
  const hasLink = urls.length > 0 || LINK.test(t);

  // 문서 자체가 피싱·사칭·위조로 판명 → 무조건 위험 (모델이 위험도를 낮게 매긴 경우 보정)
  if (hasScamVerdict(verdictText)) {
    score = 2;
    reasons.push('분석 결과 사기(피싱·사칭·위조) 정황이 확인됐어요. 절대 응하지 마세요.');
  }
  // 링크 + 개인정보/주소 입력 유도 → 전형적 스미싱
  if (hasLink && INPUT_REQUEST.test(t)) {
    score = Math.max(score, 2);
    reasons.push('링크를 누른 뒤 주소나 개인정보를 입력하게 유도하고 있어요. 전형적인 피싱이에요.');
  }
  // 링크 + 지원금·환급 미끼 → 사기 가능성 높음
  if (hasLink && BAIT.test(t)) {
    score = Math.max(score, 2);
    reasons.push('지원금·환급 같은 미끼로 링크 접속을 유도하고 있어요. 사기일 가능성이 높아요.');
  }

  if (hasAccount && (hasUrgency || TRANSFER.test(t))) {
    score = 2;
    reasons.push('계좌번호와 함께 돈을 빨리 보내라고 재촉하고 있어요. 진짜 기관은 이렇게 하지 않아요.');
  }
  if (SHORT_URL.test(t)) {
    score = Math.max(score, 2);
    reasons.push('주소를 줄인 인터넷 링크(단축 URL)가 있어요. 누르지 마세요.');
  }
  if (PERSONAL_INFO.test(t)) {
    score = Math.max(score, 2);
    reasons.push('주민등록번호나 비밀번호를 알려달라고 해요. 절대 알려주면 안 돼요.');
  }
  if (REMOTE_APP.test(t) || (APP_INSTALL.test(t) && GOV_IMPERSONATION.test(t))) {
    score = Math.max(score, 2);
    reasons.push('앱을 설치하라고 해요. 정부기관과 은행은 전화나 문자로 앱 설치를 요구하지 않아요. (출처: 한국인터넷진흥원)');
  }
  if (score === 0 && hasUrgency && GOV_IMPERSONATION.test(t)) {
    score = 1;
    reasons.push('수사기관 이름과 함께 겁을 주는 말이 있어요. 전화로 먼저 확인하세요.');
  }

  return { score, reasons };
}

/** AI 위험도와 규칙 점수를 합산해 최종 신호등을 정한다 (더 위험한 쪽 우선) */
export function mergeRisk(aiRisk, ruleScore) {
  const order = { 안전: 0, 주의: 1, 위험: 2 };
  const merged = Math.max(order[aiRisk] ?? 1, ruleScore);
  return ['안전', '주의', '위험'][merged];
}
