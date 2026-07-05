/**
 * 공식 발신처 역확인 디렉터리 + 카테고리 게이트
 *
 * 위조 여부를 이미지로 판정하는 대신, "문서에 적힌 번호 말고 공식 대표번호로
 * 직접 확인하세요"로 유도한다. 위조 탐지의 사각지대(URL·사업자번호 없는
 * 정교한 사칭 공문)를 사람의 '확인 행동'으로 우회하는 안전망.
 */

// 어르신 서류에 자주 등장하는 기관의 공식 대표번호 (사칭 시 역확인용)
// 출처: 각 기관 공식 홈페이지 대표번호
const ORG_DIRECTORY = [
  { match: /(국민건강보험|건강보험공단|건보)/, name: '국민건강보험공단', tel: '1577-1000' },
  { match: /(국민연금)/, name: '국민연금공단', tel: '1355' },
  { match: /(국세청|세무서|홈택스)/, name: '국세청', tel: '126' },
  { match: /(관세청)/, name: '관세청', tel: '125' },
  { match: /(정부24|행정안전부|행안부)/, name: '정부24', tel: '1588-2188' },
  { match: /(경찰청|경찰서|사이버수사|교통민원|이파인)/, name: '경찰청', tel: '182' },
  { match: /(검찰청|검찰|지방검찰)/, name: '대검찰청', tel: '1301' },
  { match: /(법원|등기소)/, name: '대법원 전자민원', tel: '1544-0773' },
  { match: /(금융감독원|금감원)/, name: '금융감독원', tel: '1332' },
  { match: /(식품의약품안전처|식약처)/, name: '식품의약품안전처', tel: '1577-1255' },
  { match: /(질병관리청|질병청|보건소)/, name: '질병관리청', tel: '1339' },
  { match: /(우체국|우정사업본부)/, name: '우체국', tel: '1588-1300' },
  { match: /(전기요금|한국전력|한전)/, name: '한국전력', tel: '123' },
  { match: /(도시가스|가스요금)/, name: '도시가스(지역번호+가스공사)', tel: '1544-4500' },
  { match: /(수도요금|상수도)/, name: '상수도(지자체)', tel: '120' },
  { match: /(국민비서|복지로|보건복지)/, name: '보건복지상담센터', tel: '129' },
  { match: /(도로교통공단)/, name: '도로교통공단', tel: '1577-1120' },
];

/** 발신기관/문서종류에서 공식 기관을 찾아 역확인 번호를 돌려준다 */
export function findOfficialContact(...texts) {
  const hay = texts.filter(Boolean).join(' ');
  for (const org of ORG_DIRECTORY) {
    if (org.match.test(hay)) return { name: org.name, tel: org.tel };
  }
  return null;
}

// 돈·행동을 요구하는 공적 문서 카테고리 (게이트 대상)
const OFFICIAL_DOC = /(공문|고지서|통지서|독촉장|납부|과태료|범칙금|벌금|과징금|체납|압류|출석|소환|안내문)/;
const ACTION_DEMAND = /(납부|입금|이체|송금|결제|신청|제출|방문|접속|설치|확인하|클릭|다운로드|회신)/;

/**
 * 카테고리 게이트: 돈·행동을 요구하는 공적 문서인데 모델이 '안전'이라 했으면
 * 최소 '주의'로 올리고 "공식 번호로 직접 확인" 넛지를 강제한다.
 * @returns {{gated: boolean, category: string|null}}
 */
export function categoryGate(result) {
  const text = `${result.문서종류 || ''} ${result.한줄요약 || ''} ${result.쉬운설명 || ''}`;
  const isOfficial = OFFICIAL_DOC.test(text);
  const demandsAction = ACTION_DEMAND.test(text)
    || (result.할일 || []).some((t) => ACTION_DEMAND.test(`${t.내용} ${t.기한} ${t.장소}`));
  return { gated: isOfficial && demandsAction, category: isOfficial ? '공적 문서' : null };
}
