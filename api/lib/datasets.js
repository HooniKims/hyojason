/**
 * 공공데이터·DART 엔드포인트 정리 (URL은 비밀이 아니므로 코드에 둠, 키만 .env)
 * 노년층 사기 예방용 사실확인 소스:
 *  - 국세청 사업자등록 진위/상태 → 서류의 사업자가 실존·정상영업 중인지
 *  - DART → 계약 상대 기업/법인이 실제 공시기업인지(유령회사 여부)
 *  - 국토부 실거래가 → 전세·매매 서류의 가격이 시세와 동떨어졌는지
 */

// data.go.kr WAF가 기본 UA를 차단하므로 브라우저 UA를 붙인다.
export const DATA_GO_KR_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// 국세청 사업자등록 (odcloud)
export const NTS_BUSINESS = {
  status: 'https://api.odcloud.kr/api/nts-businessman/v1/status',   // 상태조회 (POST {b_no:[]})
  validate: 'https://api.odcloud.kr/api/nts-businessman/v1/validate', // 진위확인 (POST {businesses:[]})
};

// 금융감독원 DART
export const DART = {
  list: 'https://opendart.fss.or.kr/api/list.json',           // 공시목록
  company: 'https://opendart.fss.or.kr/api/company.json',     // 기업개황
  corpCode: 'https://opendart.fss.or.kr/api/corpCode.xml',    // 고유번호 매핑(zip)
};

// 국토교통부 부동산 실거래가 (1613000). 오퍼레이션명 = get + 키
const RTMS = 'https://apis.data.go.kr/1613000';
export const REAL_ESTATE = {
  aptTrade: `${RTMS}/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`,
  aptTradeDev: `${RTMS}/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev`,
  aptRent: `${RTMS}/RTMSDataSvcAptRent/getRTMSDataSvcAptRent`,
  rhTrade: `${RTMS}/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade`,
  rhRent: `${RTMS}/RTMSDataSvcRHRent/getRTMSDataSvcRHRent`,
  offiTrade: `${RTMS}/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade`,
  offiRent: `${RTMS}/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent`,
  shTrade: `${RTMS}/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade`,
  shRent: `${RTMS}/RTMSDataSvcSHRent/getRTMSDataSvcSHRent`,
  landTrade: `${RTMS}/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade`,
  nrgTrade: `${RTMS}/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade`,
  silvTrade: `${RTMS}/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade`,
  induTrade: `${RTMS}/RTMSDataSvcInduTrade/getRTMSDataSvcInduTrade`,
};

/** 사업자등록번호 상태조회: 실존·정상영업 여부 (국세청) */
export async function checkBusiness(bno) {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return null;
  const digits = String(bno).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  try {
    const res = await fetch(`${NTS_BUSINESS.status}?serviceKey=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: [digits] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.data?.[0];
    if (!row) return null;
    return {
      사업자번호: digits,
      상태: row.b_stt || (row.b_stt_cd === '01' ? '계속사업자' : '확인필요'),
      과세유형: row.tax_type || '',
      정상: row.b_stt_cd === '01',
    };
  } catch {
    return null;
  }
}
