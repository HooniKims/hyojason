# 🤲 효자손 — 서류 읽어주는 AI 손주

> 서류 사진 한 장으로 **이해(쉬운말) → 행동(할 일) → 안전(사기 판별)** 까지 안내하는 어르신 전용 AI 웹앱.
> K-AI Contents Award Track B(솔루션 부문) 출품작. 기획 문서: [`효자손_기획문서_v1.md`](./효자손_기획문서_v1.md)

## 구조

```
public/            정적 프론트엔드 (프레임워크 없음, ES Modules)
  index.html       3화면 SPA (홈 / 결과 / 도움말)
  css/app.css      노인친화 디자인 시스템 (Google Stitch 디자인 기반 자체 구현)
  js/app.js        화면 전환·카메라·글자 3단·저장/공유
  js/rules.js      1층 사기 지킴이 — 클라이언트 규칙 엔진 (KISA 수칙 기반)
  js/samples.js    샘플 서류 3종 (심사용 체험 플로우, API 불필요)
  js/db.js         IndexedDB — 분석 텍스트만 기기 내 저장 (사진 미저장)
  js/card.js       Canvas 결과 카드(9:16) 생성
  js/tts.js        Web Speech API TTS (ko-KR)
api/
  analyze.js       3층 사기 지킴이 — OpenAI gpt-5.4-nano(주 모델), Gemini 2.5 Flash(키 있으면 폴백으로 자동 이중화),
                   JSON 검증·재시도, PII 마스킹, rate limit, KISA 블랙리스트 대조
  refresh-blacklist.js  Vercel Cron(일 1회) — 공공데이터포털 KISA 피싱 URL → KV 캐시
```

## 실행

```bash
# 로컬 (API 포함)
cp .env.example .env.local   # GEMINI_API_KEY 등 입력
npx vercel dev

# 배포
npx vercel --prod            # 환경변수는 Vercel 대시보드에 설정
```

API 키 없이도 **"샘플 서류로 체험하기"** 플로우는 완전히 동작합니다 (심사용 통로).

## 환경변수

`.env.example` 참고. `OPENAI_API_KEY`(필수, 주 모델 gpt-5.4-nano), `GEMINI_API_KEY`(선택 — 넣으면 폴백으로 자동 이중화),
`DATA_GO_KR_API_KEY` + `KV_REST_API_URL/TOKEN`(2층 블랙리스트), `CRON_SECRET`.

## 보안·개인정보 원칙

- 회원가입 없음 · 서버 무저장(stateless) · 로그에 이미지/개인정보 미기록
- 분석 결과 텍스트만 IndexedDB(내 기기)에 저장, 삭제권 보장
- 주민번호·카드번호 이중 마스킹 (프롬프트 + 서버 후처리 정규식)
- API 키는 서버리스 환경변수로 은닉, IP당 rate limit

## 출처 표기

- 사기 판별 수칙: 한국인터넷진흥원(KISA) 보호나라
- 피싱 URL 데이터: 공공데이터포털(data.go.kr) — 활용신청 후 사용
- UI 디자인 초안: Google Stitch (MCP)
- 샘플 서류 3종은 가상의 인물·기관·금액으로 만든 창작물입니다
