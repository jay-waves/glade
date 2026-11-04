// Compact SVG controls following lib.ts's 16px icon sizing.
const paths = {
  files: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 3v10M3.5 5h1M3.5 7h1"/>',
  folder: '<path d="M1.5 4a1 1 0 0 1 1-1H6l1.5 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z"/>',
  image: '<rect x="1.5" y="2" width="13" height="12" rx="1.5"/><circle cx="5" cy="5.5" r="1"/><path d="m2 12 4-4 3 3 2-2 3 3"/>',
  refresh: '<path d="M13.5 6A5.5 5.5 0 1 0 13 11M13.5 2v4h-4"/>',
  right: '<path d="m6 3 5 5-5 5"/>', left: '<path d="m10 3-5 5 5 5"/>', down: '<path d="m3 6 5 5 5-5"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  minimize: '<path d="M1.5 6h4.5V1.5M14.5 10H10v4.5M6 6 1.5 1.5M10 10l4.5 4.5"/>',
  maximize: '<path d="M1.5 6V1.5H6M14.5 10v4.5H10M1.5 1.5 6 6M14.5 14.5 10 10"/>',
  sort: '<path d="M2 4h8M2 8h6M2 12h4M12 3v10m-2-2 2 2 2-2"/>',
  more: '<circle cx="3" cy="8" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="13" cy="8" r=".8"/>',
  play: '<path d="m5 3 8 5-8 5Z"/>',
  live: '<circle cx="8" cy="8" r="1.5"/><path d="M4.8 4.8a4.5 4.5 0 0 0 0 6.4m6.4-6.4a4.5 4.5 0 0 1 0 6.4M2.7 2.7a7.5 7.5 0 0 0 0 10.6m10.6-10.6a7.5 7.5 0 0 1 0 10.6"/>',
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.image}</g>`;
  return svg;
}
