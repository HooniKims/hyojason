/**
 * QR 코드 디코딩 (서버 전용) — 이미지 안의 QR에서 URL만 추출한다.
 *
 * 안전 원칙:
 *  - 디코딩만 한다. QR이 가리키는 주소에 절대 접속(fetch)하지 않는다.
 *  - 실패(저화질·QR 없음)해도 조용히 빈 배열을 돌려준다. 사용자에게 오류를 보이지 않음.
 *  - 추출한 URL은 2층 KISA 블랙리스트 대조에만 쓰인다.
 */

import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

// 과도한 해상도는 다운스케일 (성능·안정성). jsQR은 저해상도에서도 동작.
const MAX_DIM = 1600;

function toRGBA(buf, mime) {
  if (mime === 'image/png') {
    const png = PNG.sync.read(buf);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  // 기본: JPEG (클라이언트가 업로드 전 JPEG로 압축)
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

/** 최근접 이웃 다운스케일 (선명도 유지, 의존성 없음) */
function downscale(rgba, scale) {
  const w = Math.round(rgba.width * scale);
  const h = Math.round(rgba.height * scale);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x += 1) {
      const sx = Math.floor(x / scale);
      const si = (sy * rgba.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = rgba.data[si]; out[di + 1] = rgba.data[si + 1];
      out[di + 2] = rgba.data[si + 2]; out[di + 3] = rgba.data[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * base64 이미지에서 QR로 인코딩된 URL 목록을 추출한다.
 * @returns {string[]} URL(또는 문자열) 목록. 실패 시 빈 배열.
 */
export function extractQrUrls(imageBase64, mimeType) {
  try {
    const buf = Buffer.from(imageBase64, 'base64');
    let rgba = toRGBA(buf, mimeType === 'image/png' ? 'image/png' : 'image/jpeg');
    const maxSide = Math.max(rgba.width, rgba.height);
    if (maxSide > MAX_DIM) rgba = downscale(rgba, MAX_DIM / maxSide);

    const found = new Set();
    // 원본 + 반전(어두운 배경 QR) 두 번 시도
    for (const invert of ['dontInvert', 'attemptBoth']) {
      const code = jsQR(rgba.data, rgba.width, rgba.height, { inversionAttempts: invert });
      if (code && code.data) found.add(code.data.trim());
    }
    // URL/문자열 중 http(s) 또는 도메인 형태만 (2층 대조 대상)
    return [...found].filter((s) => /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(s));
  } catch {
    return []; // 저화질·비지원 포맷 등은 조용히 무시
  }
}
