/**
 * /api/tts — 음성 안내 합성 (1순위 ElevenLabs, 2순위 Google Gemini TTS)
 *
 * 브라우저 기본 음성(Web Speech)보다 훨씬 자연스러운 한국어 음성을 제공한다.
 * - 1순위: ElevenLabs (ELEVENLABS_API_KEY 설정 시). 지정 Voice ID로 mp3 반환.
 * - 2순위: Google Gemini TTS. raw PCM(L16/24kHz)에 WAV 헤더를 붙여 audio/wav로 내려준다.
 * - 둘 다 미설정/실패면 502 → 클라이언트가 Web Speech(ko-KR)로 폴백하므로 서비스는 안 멈춘다.
 * - 모든 키는 서버 환경변수에만 둔다.
 */

export const config = { maxDuration: 30 };

// ── ElevenLabs (1순위) ────────────────────────────────────
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID; // 미설정 시 아래 기본 목소리
const EL_DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel (범용 폴백)
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5'; // 빠르고 한국어 지원

// ── Gemini (2순위) ────────────────────────────────────────
const MODEL = 'gemini-3.1-flash-tts-preview'; // 최신 Gemini 3.1 Flash TTS (자연스러운 한국어 음성)
const VOICE = 'Achernar'; // 부드럽고 차분한 목소리 (어르신 청취용)
const MAX_TEXT = 1500;    // 음성안내는 3~5문장이라 충분
const RATE_LIMIT = Number(process.env.TTS_RATE_LIMIT) || 300; // IP·시간당
const RATE_WINDOW_MS = 60 * 60 * 1000;

const hits = new Map();
function rateLimitedMem(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count += 1;
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear();
  return rec.count > RATE_LIMIT;
}

async function isRateLimited(ip) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return rateLimitedMem(ip);
  try {
    const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
    const key = `rl:tts:${ip}:${bucket}`;
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const incr = await fetch(`${base}/incr/${encodeURIComponent(key)}`, auth);
    if (!incr.ok) return rateLimitedMem(ip);
    const { result: count } = await incr.json();
    if (count === 1) {
      await fetch(`${base}/expire/${encodeURIComponent(key)}/${Math.ceil(RATE_WINDOW_MS / 1000)}`, auth);
    }
    return Number(count) > RATE_LIMIT;
  } catch {
    return rateLimitedMem(ip);
  }
}

/** raw PCM(부호 있는 16bit LE)에 WAV 헤더를 붙여 재생 가능한 WAV 버퍼로 만든다 */
function pcmToWav(pcm, sampleRate) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);          // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** 1순위: ElevenLabs. 지정 Voice ID로 mp3를 합성해 {buffer, contentType} 반환. */
async function synthElevenLabs(text) {
  const voice = EL_VOICE || EL_DEFAULT_VOICE;
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': EL_KEY },
      body: JSON.stringify({ text, model_id: EL_MODEL }),
    },
  );
  if (!r.ok) throw new Error(`elevenlabs tts http ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (!buffer.length) throw new Error('elevenlabs tts empty');
  return { buffer, contentType: 'audio/mpeg' };
}

/** 2순위: Google Gemini TTS. raw PCM에 WAV 헤더를 붙여 {buffer, contentType} 반환. */
async function synthGemini(text) {
  const key = process.env.GEMINI_API_KEY;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      // 텍스트만 그대로 넣는다. 지시문을 접두어로 붙이면 TTS가 그 지시문까지
      // 소리 내어 읽어 매우 어색해진다(형식상 별도 스타일 프롬프트 불가한 케이스).
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    },
  );
  if (!r.ok) throw new Error(`gemini tts http ${r.status}`);
  const data = await r.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) throw new Error('gemini tts empty');
  // mimeType 예: "audio/L16;codec=pcm;rate=24000" → sampleRate 파싱
  const rateMatch = /rate=(\d+)/.exec(part.mimeType || '');
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const pcm = Buffer.from(part.data, 'base64');
  return { buffer: pcmToWav(pcm, sampleRate), contentType: 'audio/wav' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '허용되지 않는 요청입니다' });
    return;
  }
  if (!EL_KEY && !process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'tts 미설정' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (await isRateLimited(ip)) { res.status(429).json({ error: '잠시 후 다시 시도해주세요' }); return; }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: '읽을 내용이 없습니다' });
      return;
    }
    const clean = text.slice(0, MAX_TEXT);

    // 1순위 ElevenLabs → 실패 시 2순위 Gemini → 둘 다 실패면 502(클라이언트가 Web Speech 폴백)
    let audio = null;
    if (EL_KEY) {
      try { audio = await synthElevenLabs(clean); } catch { audio = null; }
    }
    if (!audio && process.env.GEMINI_API_KEY) {
      audio = await synthGemini(clean);
    }
    if (!audio) throw new Error('no tts provider succeeded');

    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(audio.buffer);
  } catch {
    res.status(502).json({ error: '음성을 만들지 못했어요' });
  }
}
