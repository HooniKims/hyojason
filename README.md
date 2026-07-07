# 🤲 효자손 — 서류 읽어주는 AI 손주

> 어려운 서류·문자를 **사진 한 장**으로 찍으면, **이게 무슨 서류이고(이해) → 무엇을 해야 하며(행동) → 믿어도 되는지(안전)** 까지 쉬운 말로 알려주는 어르신 전용 AI 웹앱.
>
> **K-AI 콘텐츠 공모전(주최: KT그룹 희망나눔재단) 솔루션 부문 출품작.**

---

## 한눈에 보기

**"쉬운 겉, 탄탄한 속."** 어르신은 버튼 하나·사진 한 장으로 끝나지만 뒤에서는 규칙·공공데이터·AI·사실확인이 겹겹이 문서를 검증합니다.

- **범용 서류 해석**: 고지서·약관·계약서·문자·병원 안내·신청서 등 글자가 어려운 것이면 무엇이든. 사진을 올리면 AI가 유형을 자동 분류.
- **5층 사기 지킴이**: 한 층이 놓쳐도 다음 층이 잡는 격상형 다층 검증(아래 참조).
- **어르신 UX**: 초대형 버튼, 글자 3단 조절, 자연스러운 음성 안내(ElevenLabs→Gemini→Web Speech 3단 폴백), 신호등(안전·주의·위험), 결과 카드 저장·가족 공유. 종이 서류는 촬영, 문자·카톡은 화면 캡처로 올림. 회원가입 없음, 홈→결과 두 번 터치.
- **개인정보 비수집**: 서버 무저장, 사진 즉시 폐기, 기록은 내 휴대폰(IndexedDB)에만.

## 심사용 빠른 확인 (API 키 없이 전체 체험)

홈의 **"샘플 서류로 체험하기"** 버튼으로 실물 서류 없이 6종(건강보험 고지서·기초연금 안내·가짜 독촉장·휴대폰 약관·택배 문자·복약 안내)을 그대로 체험할 수 있습니다. 사기 판별·쉬운 설명·할 일·음성 안내가 모두 동작합니다.

- 배포 URL: https://hyojason.vercel.app
- 로컬 체험: `node scripts/dev-server.mjs` → http://localhost:8787 (실제 서버리스 핸들러를 그대로 구동)

## 사기 지킴이 5층 (격상형: 더 위험한 판정을 채택)

| 층 | 하는 일 | 근거 |
|---|---|---|
| 1층 규칙 | 링크+개인정보 유도, 지원금 미끼, 기관 사칭·겁박 패턴을 정규식으로 즉시 차단 | KISA 보호나라 수칙 |
| 2층 블랙리스트 | 서류·QR에서 뽑은 URL을 실제 피싱 명단과 대조 | KISA 피싱 URL(공공데이터, 약 27,000건) |
| 3층 비전 AI | 명단에 없는 신종 수법을 문맥으로 판단 | gpt-5.4-nano(주)·Gemini(예비) |
| 사실확인 | 사업자번호·발신 기업·부동산 금액을 공공데이터로 대조 | 국세청·DART·국토교통부 |
| 역확인 | 돈·행동 요구 공적 문서는 기관 공식 대표번호로 직접 확인 유도 | 기관 공식번호 |

AI 단독 판단의 한계를 규칙·공공데이터가 교차 검증합니다. QR코드는 디코딩만 하고 절대 접속하지 않습니다.

## 구조

```
public/                정적 프론트엔드 (프레임워크 없음, ES Modules, 반응형 모바일/PC)
  index.html           SPA — 홈(랜딩)·결과·기록·도움말·이용약관·개인정보 처리방침
  css/app.css          어르신친화 디자인 시스템 (Google Stitch 초안 기반 자체 구현)
  js/app.js            화면 전환·카메라·글자 3단·저장/공유·1층 규칙 적용
  js/rules.js          1층 사기 지킴이 — 클라이언트 규칙 엔진 (KISA 수칙 기반)
  js/samples.js        샘플 서류 6종 (심사용 체험, API 불필요)
  js/db.js             IndexedDB — 분석 텍스트만 기기 내 저장 (사진 미저장)
  js/card.js           Canvas 결과 카드 생성 (내용 맞춤 세로형 자동 높이)
  js/tts.js            음성 안내 — /api/tts 호출(문장 병렬 생성), 실패 시 Web Speech 폴백
  js/icons.js          인라인 SVG 아이콘 세트 (외부 폰트·CDN 의존 0)
  js/vendor/           자체 호스팅 라이브러리 (lottie-web 경량 빌드 — 로딩 애니메이션)
  anim/reading.json    로딩 Lottie (서류 읽는 손주)
api/
  analyze.js           비전 AI 호출 + QR 디코딩 + 2층 블랙리스트 대조 + 사실확인 + 게이트,
                       JSON 스키마 검증·재시도, PII 마스킹, 공유 rate limit
  tts.js               ElevenLabs(mp3) 1순위 → Gemini(PCM→WAV) 폴백 (rate limit·키 보호)
  refresh-blacklist.js Vercel Cron(일 1회) — 공공데이터 KISA 피싱 URL → KV 캐시
  lib/phishing.js      URL 정규화·색인·매칭 (2층 공용)
  lib/factcheck.js     사실확인 — 사업자등록·부동산 시세·DART
  lib/directory.js     기관 공식번호 디렉터리 + 카테고리 게이트
  lib/datasets.js      공공데이터 엔드포인트 정리 + 사업자등록 조회
  lib/qr.js            이미지 속 QR 디코딩(접속 없이 URL만 추출)
  lib/data/            번들 데이터 (DART 상장사, 전국 시군구 법정동코드)
scripts/dev-server.mjs 로컬 개발 서버 (Vercel 없이 실제 핸들러 구동)
```

## 실행

```bash
cp .env.example .env      # 키 입력 (아래 참조)
node scripts/dev-server.mjs   # http://localhost:8787
# 또는 Vercel: npx vercel dev  /  배포: npx vercel --prod
```

API 키가 없어도 **샘플 체험**은 완전히 동작합니다.

## 환경변수 (`.env.example` 참고)

- `OPENAI_API_KEY` — 주 모델 gpt-5.4-nano (필수)
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` — 주 음성 안내(설정 시 1순위, 미설정 시 Gemini TTS로 폴백). 선택 `ELEVENLABS_MODEL`(기본 `eleven_flash_v2_5`)
- `GEMINI_API_KEY` — 음성 안내 폴백(Gemini 3.1 Flash TTS) + 비전 분석 폴백(Gemini 2.5 Flash) 자동 이중화
- `DATA_GO_KR_API_KEY` — 공공데이터포털 공용 키 (KISA 피싱·사업자등록·실거래가)
- `DART_API_KEY` — 금융감독원 DART
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Upstash(2층 블랙리스트 캐시), 없으면 2층 생략
- `CRON_SECRET` — Cron 엔드포인트 보호

## 보안·개인정보 원칙

- 회원가입 없음 · 서버 무저장(stateless) · 사진 분석 후 즉시 폐기 · 로그에 이미지·개인정보 미기록
- 분석 결과 텍스트만 IndexedDB(내 기기)에 저장, 개별·전체 삭제권 보장
- 주민번호·카드번호 이중 마스킹 (프롬프트 + 서버 후처리 정규식)
- API 키는 서버리스 환경변수로 은닉, IP당 공유 rate limit
- 출시 전 13개 관점 보안 점검(XSS 재현·차단, CSP, 비용 폭탄 방어) — 상세 `효자손_보안점검.md`

## 출처 표기 (라이선스 준수)

- 사기 판별 수칙: 한국인터넷진흥원(KISA) 보호나라
- 공공데이터: 공공데이터포털(data.go.kr) 오픈API 활용신청 — KISA 피싱 URL, 국세청 사업자등록, 국토교통부 실거래가 / 금융감독원 DART
- AI 모델: OpenAI gpt-5.4-nano(비전 분석), ElevenLabs(주 음성 안내), Google Gemini(비전 폴백·3.1 Flash TTS 음성 폴백)
- 오픈소스: QR 디코딩 jsQR·jpeg-js·pngjs, 로딩 애니메이션 lottie-web(MIT), 아이콘 Phosphor(MIT)·Lucide(ISC) 참고
- UI 디자인 초안: Google Stitch / 마스코트 캐릭터: 생성형 AI로 자체 제작
- 인용 통계: 과기정통부·NIA 「2024 디지털정보격차 실태조사」(국가승인통계), KISA 스미싱 피해 현황
- 샘플 서류 6종은 가상의 인물·기관·금액으로 만든 창작물입니다
- 크롤링·스크래핑 없음: 외부 웹사이트를 긁지 않으며, QR·URL도 디코딩만 하고 접속하지 않습니다
