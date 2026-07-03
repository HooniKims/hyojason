/**
 * 사실확인 레이어 — 서류에서 뽑은 정보를 공공데이터로 대조해 사기 정황을 보강한다.
 *  1) 사업자등록번호 → 국세청 실존·정상영업 확인 (신뢰도 높음)
 *  2) 발신기관/업체명 → DART 상장·공시기업 실존 확인 (상장사 한정)
 *  3) 부동산 거래 금액 → 국토부 실거래가 중앙값과 비교 (전세사기·시세 참고)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkBusiness, REAL_ESTATE, DATA_GO_KR_UA } from './datasets.js';
import { findOfficialContact, categoryGate } from './directory.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── DART 상장사 이름 색인 (번들 JSON) ──
let dartNorm = null;
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/주식회사|㈜|\(주\)|\(주식회사\)/g, '')
    .replace(/\s+/g, '');
}
function loadDart() {
  if (dartNorm) return dartNorm;
  dartNorm = new Map();
  try {
    const raw = JSON.parse(readFileSync(join(HERE, 'data', 'dart_listed.json'), 'utf8'));
    for (const [name, code] of Object.entries(raw)) dartNorm.set(normName(name), { name, code });
  } catch { /* 번들 없으면 DART 확인 생략 */ }
  return dartNorm;
}

function checkDart(orgName) {
  const idx = loadDart();
  if (!idx || !orgName) return null;
  const key = normName(orgName);
  if (key.length < 2) return null;
  // 정확 일치 또는 기관명이 상장사명을 포함/피포함
  let hit = idx.get(key);
  if (!hit) {
    for (const [n, v] of idx) {
      if (n.length >= 3 && (key.includes(n) || n.includes(key))) { hit = v; break; }
    }
  }
  // 참고용: 실존 기업이라도 사칭당할 수 있으므로 '안전' 신호로 쓰지 않는다(정상:null).
  return hit
    ? {
      종류: '참고',
      결과: `'${hit.name}'는 실제 등록된 기업이에요. 다만 사기꾼이 진짜 회사 이름을 도용하기도 하니, 실존한다고 안심하지 말고 공식 번호로 확인하세요.`,
      정상: null,
    }
    : null; // 상장사가 아니면 판단 보류(비상장·소상공인은 정상일 수 있음)
}

// ── 부동산 실거래가: 전국 시군구 법정동코드 (번들 JSON) ──
let lawdList = null; // [{name, code}] — 긴 이름 우선(구체적 매치 우선)
function loadLawd() {
  if (lawdList) return lawdList;
  lawdList = [];
  try {
    const raw = JSON.parse(readFileSync(join(HERE, 'data', 'lawd_sigungu.json'), 'utf8'));
    for (const [name, code] of Object.entries(raw)) lawdList.push({ name, code });
    lawdList.sort((a, b) => b.name.length - a.name.length);
  } catch { /* 번들 없으면 시세 확인 생략 */ }
  return lawdList;
}
function resolveLawd(region) {
  const r = String(region || '').replace(/\s+/g, ' ').trim();
  const list = loadLawd();
  // '분당구'처럼 시 안의 구까지 잡도록: region에 포함되는 가장 긴 이름을 고른다
  for (const { name, code } of list) {
    if (r.includes(name) || r.replace(/\s/g, '').includes(name.replace(/\s/g, ''))) {
      return { code, gu: name.split(' ').pop() };
    }
  }
  return null;
}
function recentYmd() {
  // 서버 시간에 의존하지 않도록 직전 처리월을 넉넉히: 최근 6개월 중 데이터 있는 달을 순회
  return null;
}
async function fetchTradeMedian(lawdCd, ymd) {
  const key = process.env.DATA_GO_KR_API_KEY;
  const url = `${REAL_ESTATE.aptTrade}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${lawdCd}&DEAL_YMD=${ymd}&pageNo=1&numOfRows=100`;
  const res = await fetch(url, { headers: { 'User-Agent': DATA_GO_KR_UA } });
  if (!res.ok) return [];
  const xml = await res.text();
  const amounts = [...xml.matchAll(/<dealAmount>\s*([\d,]+)\s*<\/dealAmount>/g)]
    .map((m) => Number(m[1].replace(/[^\d]/g, ''))).filter(Boolean);
  return amounts;
}
async function checkPrice(region, amountManwon, ymds) {
  const key = process.env.DATA_GO_KR_API_KEY;
  const resolved = resolveLawd(region);
  if (!key || !resolved) {
    return region
      ? { 종류: '부동산 시세', 결과: '이 지역은 시세 자동조회 범위(서울 주요 구) 밖이라, 가까운 공인중개사나 가족과 꼭 확인하세요.', 정상: null }
      : null;
  }
  let all = [];
  for (const ymd of ymds) {
    all = all.concat(await fetchTradeMedian(resolved.code, ymd));
    if (all.length >= 20) break;
  }
  if (!all.length) return { 종류: '부동산 시세', 결과: `${resolved.gu} 최근 아파트 실거래 자료를 찾지 못했어요. 기관·가족과 확인하세요.`, 정상: null };
  all.sort((a, b) => a - b);
  const median = all[Math.floor(all.length / 2)];
  const medianEok = (median / 10000).toFixed(1);
  const amt = Number(String(amountManwon).replace(/[^\d]/g, ''));
  let 정상 = null; let note = `${resolved.gu} 최근 아파트 실거래 중앙값은 약 ${medianEok}억원이에요.`;
  if (amt) {
    const amtEok = (amt / 10000).toFixed(1);
    if (amt < median * 0.5) { 정상 = false; note += ` 이 서류의 금액(약 ${amtEok}억원)은 시세보다 크게 낮아요. 시세보다 지나치게 싼 조건은 사기를 의심해야 해요.`; }
    else note += ` 이 서류의 금액은 약 ${amtEok}억원이에요.`;
  }
  return { 종류: '부동산 시세', 결과: note, 정상 };
}

/**
 * 사실확인 실행. 최근 6개월 실거래 조회월(ymds)은 서버에서 계산해 넘긴다.
 * @returns {{checks: Array, riskBump: '위험'|'주의'|null}}
 */
export async function runFactChecks(result, ymds) {
  const checks = [];
  let riskBump = null;

  // 1) 사업자등록 진위
  const bno = String(result.사업자번호 || '').replace(/\D/g, '');
  if (bno.length === 10) {
    const b = await checkBusiness(bno);
    if (b) {
      checks.push({
        종류: '사업자등록',
        결과: b.정상
          ? `사업자번호 ${bno}는 국세청에 정상 등록된 사업자예요 (${b.상태}).`
          : `사업자번호 ${bno}는 ${b.상태}. 국세청에 정상 등록되지 않았어요. 사기를 의심하세요.`,
        정상: b.정상,
      });
      if (!b.정상) riskBump = '위험';
    }
  }

  // 2) DART 상장기업 실존 (발신기관이 대기업/금융사를 자처하는 경우)
  const dart = checkDart(result.발신기관);
  if (dart) checks.push(dart);

  // 3) 부동산 시세 (매매/전세 서류)
  if (result.부동산거래) {
    const price = await checkPrice(result.부동산지역, result.부동산금액, ymds);
    if (price) {
      checks.push(price);
      if (price.정상 === false) riskBump = riskBump || '주의';
    }
  }

  // 4) 카테고리 게이트: 돈·행동 요구하는 공적 문서면 최소 '주의'로 올리고
  //    공식 대표번호로 역확인하도록 넛지 (위조 탐지 사각지대 우회)
  const gate = categoryGate(result);
  const contact = findOfficialContact(result.발신기관, result.문서종류, result.한줄요약);
  if (gate.gated) {
    if (result.위험도 === '안전') riskBump = riskBump === '위험' ? '위험' : '주의';
    if (contact) {
      checks.push({
        종류: '발신처 확인',
        결과: `이 서류가 진짜인지, ${contact.name} 공식 번호 ${contact.tel}(으)로 직접 전화해 확인하세요. 서류에 적힌 번호나 링크로 연락하면 안 돼요.`,
        정상: null,
        전화: contact.tel,
      });
    } else {
      checks.push({
        종류: '발신처 확인',
        결과: '돈을 내라고 하는 서류예요. 진짜인지 보낸 기관의 공식 번호로 직접 확인하고, 가족에게도 보여주세요. 서류에 적힌 번호·링크로는 연락하지 마세요.',
        정상: null,
      });
    }
  } else if (contact && result.위험도 !== '안전') {
    // 게이트엔 안 걸려도 위험/주의면 역확인 번호를 제공
    checks.push({
      종류: '발신처 확인',
      결과: `${contact.name} 공식 번호는 ${contact.tel}이에요. 서류에 적힌 번호 말고 이 번호로 직접 확인하세요.`,
      정상: null,
      전화: contact.tel,
    });
  }

  return { checks, riskBump };
}
