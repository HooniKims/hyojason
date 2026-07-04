/**
 * /api/refresh-blacklist — KISA 피싱사이트 URL 블랙리스트 갱신 (Vercel Cron, 일 1회)
 *
 * 공공데이터포털(odcloud) "한국인터넷진흥원_피싱사이트 URL" 오픈API를 받아
 * 색인({urls, domains})으로 만들어 KV(Upstash Redis REST)에 캐시한다.
 * 키 미설정이거나 KV 미설정이면 아무것도 하지 않고 종료 (분석 API는 1층+3층만으로 동작).
 *
 * 출처 표기: 한국인터넷진흥원(KISA), 공공데이터포털(data.go.kr / odcloud.kr)
 */

import { buildIndex } from './lib/phishing.js';

export const config = { maxDuration: 60 };

// odcloud 데이터셋 (namespace 15109780). 갱신 시 uddi가 바뀌면 env로 덮어쓸 수 있음.
const DEFAULT_ENDPOINT =
  'https://api.odcloud.kr/api/15109780/v1/uddi:707478dd-938f-4155-badb-fae6202ee7ed';
const PER_PAGE = 1000;
const MAX_PAGES = 40; // 40 × 1000 = 40,000건 상한 (현재 데이터 ~27,600건)

export default async function handler(req, res) {
  // 인증: Vercel Cron 요청(x-vercel-cron 헤더) 또는 CRON_SECRET Bearer 만 허용.
  // 시크릿 미설정 상태에서 아무나 호출해 공공데이터 대량 fetch·KV 쓰기를 유발하는 것을 차단.
  const secret = process.env.CRON_SECRET;
  const isVercelCron = !!req.headers['x-vercel-cron'];
  const authorized = isVercelCron || (secret && req.headers.authorization === `Bearer ${secret}`);
  if (!authorized) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!apiKey || !kvUrl || !kvToken) {
    res.status(200).json({ ok: false, skipped: 'DATA_GO_KR_API_KEY 또는 KV 미설정' });
    return;
  }

  try {
    const endpoint = process.env.DATA_GO_KR_ENDPOINT || DEFAULT_ENDPOINT;
    const raw = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const qs = new URLSearchParams({
        page: String(page),
        perPage: String(PER_PAGE),
        returnType: 'JSON',
        serviceKey: apiKey,
      });
      const r = await fetch(`${endpoint}?${qs}`);
      if (!r.ok) break;
      const data = await r.json().catch(() => null);
      const rows = data?.data || [];
      if (!rows.length) break;
      for (const row of rows) {
        const u = row?.['홈페이지주소'] || row?.url || row?.URL;
        if (u) raw.push(u);
      }
      if (rows.length < PER_PAGE) break; // 마지막 페이지
    }

    if (!raw.length) {
      res.status(200).json({ ok: false, skipped: '수집된 URL 없음(키/엔드포인트 확인 필요)' });
      return;
    }

    const index = buildIndex(raw);
    const setRes = await fetch(`${kvUrl}/set/kisa_phishing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(index),
    });
    res.status(200).json({
      ok: setRes.ok,
      collected: raw.length,
      urls: index.urls.length,
      domains: index.domains.length,
    });
  } catch {
    res.status(200).json({ ok: false, error: 'refresh failed' });
  }
}
