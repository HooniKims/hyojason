/**
 * 효자손 아이콘 세트 — 인라인 SVG (외부 폰트·CDN 의존 없음)
 * 어르신용: 굵은 선(2.2), 둥근 끝, 큰 크기, currentColor로 고대비 상속.
 * 스타일 참고: Phosphor Icons(MIT) / Lucide(ISC). viewBox 24×24.
 */

const P = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  back: `<path ${P} d="M15 5l-7 7 7 7"/>`,
  help: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4"/><circle cx="12" cy="17.3" r="1.15" fill="currentColor"/>`,
  camera: `<path ${P} d="M4 8h3l1.6-2.2h6.8L17 8h3a1.8 1.8 0 0 1 1.8 1.8v8.4A1.8 1.8 0 0 1 20 20H4a1.8 1.8 0 0 1-1.8-1.8V9.8A1.8 1.8 0 0 1 4 8z"/><circle ${P} cx="12" cy="13" r="3.4"/>`,
  file: `<path ${P} d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path ${P} d="M13.5 3v5h5"/><path ${P} d="M9 13h6M9 16.5h4"/>`,
  volume: `<path ${P} d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z"/><path ${P} d="M16.5 8.5a5 5 0 0 1 0 7"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>`,
  trash: `<path ${P} d="M4 7h16"/><path ${P} d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path ${P} d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path ${P} d="M10 11v6M14 11v6"/>`,
  chevron: `<path ${P} d="M9 6l6 6-6 6"/>`,
  home: `<path ${P} d="M4 10.5L12 4l8 6.5"/><path ${P} d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5"/><path ${P} d="M10 20v-5h4v5"/>`,
  history: `<path ${P} d="M4 12a8 8 0 1 0 2.3-5.6"/><path ${P} d="M4 4v3.5h3.5"/><path ${P} d="M12 8v4l3 2"/>`,
  person: `<circle ${P} cx="12" cy="8" r="3.6"/><path ${P} d="M5 20a7 7 0 0 1 14 0"/>`,
  textsize: `<text x="2" y="18.5" font-size="15" font-weight="900" fill="currentColor" stroke="none">가</text><text x="14.5" y="18.5" font-size="9.5" font-weight="900" fill="currentColor" stroke="none">A</text>`,
  save: `<path ${P} d="M12 4v10"/><path ${P} d="M8 10.5l4 4 4-4"/><path ${P} d="M5 19h14"/>`,
  send: `<path ${P} d="M21 3L10.5 13.5"/><path ${P} d="M21 3l-6.8 18-3.7-8.2L2.3 9l18.7-6z"/>`,
  checklist: `<path ${P} d="M4 6.5h10M4 12h10M4 17.5h6"/><path ${P} d="M16.5 16l2 2 3.2-3.8"/>`,
  book: `<path ${P} d="M12 6.5C10.5 5 8 4.5 4.5 4.8v13C8 17.5 10.5 18 12 19.5"/><path ${P} d="M12 6.5C13.5 5 16 4.5 19.5 4.8v13C16 17.5 13.5 18 12 19.5"/><path ${P} d="M12 6.5v13"/>`,
  words: `<path ${P} d="M4 6h16v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 4v-4H5.5A1.5 1.5 0 0 1 4 15z"/><text x="7" y="14" font-size="8.5" font-weight="900" fill="currentColor" stroke="none">가</text><text x="13" y="14" font-size="8.5" font-weight="900" fill="currentColor" stroke="none">A</text>`,
  warning: `<path ${P} d="M12 3.5l9.2 16H2.8z"/><path ${P} d="M12 9.5v4.5"/><circle cx="12" cy="17.3" r="1.15" fill="currentColor"/>`,
  verify: `<circle ${P} cx="11" cy="11" r="7"/><path ${P} d="M16.2 16.2L21 21"/><path ${P} d="M8 11l2.2 2.2L14 8.6"/>`,
  siren: `<path ${P} d="M5 20v-6.5a7 7 0 0 1 14 0V20z"/><path ${P} d="M3 20h18"/><path ${P} d="M12 4V2"/><path ${P} d="M19.5 6.5l1-1M4.5 6.5l-1-1"/>`,
  phone: `<path ${P} d="M6.5 3.5h3l1.8 4.5-2.3 1.4a11 11 0 0 0 5.1 5.1l1.4-2.3 4.5 1.8v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z"/>`,
  lock: `<rect ${P} x="5" y="11" width="14" height="9" rx="2"/><path ${P} d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="currentColor"/>`,
  chat: `<path ${P} d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9l-4.5 4v-4H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5z"/><path ${P} d="M7.5 9.5h9M7.5 12.5h6"/>`,
  hand: `<path ${P} d="M12 20.5S4.5 16 4.5 10.3A3.6 3.6 0 0 1 12 7.5a3.6 3.6 0 0 1 7.5 2.8C19.5 16 12 20.5 12 20.5z"/>`,
  robot: `<rect ${P} x="4.5" y="8" width="15" height="10.5" rx="2.5"/><circle cx="9.5" cy="13.2" r="1.4" fill="currentColor"/><circle cx="14.5" cy="13.2" r="1.4" fill="currentColor"/><path ${P} d="M12 8V5"/><circle ${P} cx="12" cy="4" r="1.3"/><path ${P} d="M2.8 12v3M21.2 12v3"/>`,
  checkbig: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="M8 12.3l2.7 2.7L16.2 9"/>`,
  check: `<path ${P} d="M5 12.5l4.5 4.5L19 7"/>`,
  // 신호등 (배너용, 흰색 currentColor로 색 배경 위에)
  safe: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="M8 12.3l2.7 2.7L16.2 9"/>`,
  caution: `<path ${P} d="M12 3.5l9.2 16H2.8z"/><path ${P} d="M12 9.5v4.5"/><circle cx="12" cy="17.3" r="1.15" fill="currentColor"/>`,
  danger: `<path ${P} d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path ${P} d="M12 8v5"/><circle cx="12" cy="16.3" r="1.15" fill="currentColor"/>`,
};

/** 아이콘 SVG 문자열 반환. cls로 클래스 지정, size(px)로 크기 지정 가능 */
export function svgIcon(name, cls = '') {
  const inner = ICONS[name];
  if (!inner) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

/** data-icon 속성이 붙은 정적 요소들을 SVG로 채운다 */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (ICONS[name]) el.innerHTML = svgIcon(name);
  });
}
