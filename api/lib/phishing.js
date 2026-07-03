/**
 * 피싱 URL 매칭 공용 로직 (2층 사기 지킴이)
 * refresh-blacklist(수집·색인)와 analyze(대조)가 동일 규칙을 쓰도록 분리.
 */

/** URL 정규화: 소문자, 공백 제거(OCR 노이즈 대응), 스킴·www·끝 슬래시 제거 (경로는 유지) */
export function normalizeUrl(raw) {
  return String(raw || '').toLowerCase()
    .replace(/\s+/g, '')                       // OCR가 끼워넣는 공백 제거
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/** 정규화된 문자열에서 호스트만 추출 */
export function hostOf(normalized) {
  return normalizeUrl(normalized).split(/[/?#]/)[0];
}

/**
 * KISA 원본 URL 목록 → 색인 {urls, domains}
 * - urls: 경로까지 포함한 정확 매칭용 전체 URL
 * - domains: 원본이 순수 도메인(경로 없음)인 경우 → 해당 도메인 전체를 위험 처리
 *   (단축 URL host는 경로가 있으므로 domains에 안 들어가 오탐 방지)
 */
export function buildIndex(rawUrls) {
  const urls = new Set();
  const domains = new Set();
  for (const raw of rawUrls) {
    const n = normalizeUrl(raw);
    if (!n) continue;
    urls.add(n);
    if (n === hostOf(n)) domains.add(n);
  }
  return { urls: [...urls], domains: [...domains] };
}

/** 문서에서 뽑은 URL 1건이 블랙리스트에 걸리는지 */
export function isPhishing(docUrl, index) {
  const n = normalizeUrl(docUrl);
  if (!n) return false;
  const urlSet = index.urls instanceof Set ? index.urls : new Set(index.urls);
  const domSet = index.domains instanceof Set ? index.domains : new Set(index.domains);
  return urlSet.has(n) || domSet.has(hostOf(n));
}
