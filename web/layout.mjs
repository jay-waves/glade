// The shortest-column masonry strategy is adapted from lib.ts gallery-layout.mjs.
// Preserve full media aspect ratios; images are never cropped.
export function layout(ratios, width, size, rows = false, gap = 12) {
  if (width <= 0) return { items: [], height: 0 };
  const items = [];
  if (!rows) {
    const columns = Math.max(1, Math.floor((width + gap) / (size + gap)));
    const cardWidth = (width - gap * (columns - 1)) / columns;
    const heights = Array(columns).fill(0);
    for (const ratio of ratios) {
      const column = heights.indexOf(Math.min(...heights));
      const height = cardWidth / Math.max(0.05, ratio || 1);
      items.push({ left: column * (cardWidth + gap), top: heights[column], width: cardWidth, height });
      heights[column] += height + gap;
    }
    return { items, height: Math.max(0, ...heights) - (items.length ? gap : 0) };
  }
  let top = 0, start = 0;
  while (start < ratios.length) {
    let end = start, sum = 0;
    while (end < ratios.length) {
      sum += Math.max(0.05, ratios[end] || 1);
      end++;
      if (sum * size + (end - start - 1) * gap >= width) break;
    }
    const height = Math.min(size * 1.5, (width - (end - start - 1) * gap) / sum, end === ratios.length ? size : Infinity);
    let left = 0;
    for (let i = start; i < end; i++) {
      const itemWidth = Math.max(0.05, ratios[i] || 1) * height;
      items.push({ left, top, width: itemWidth, height });
      left += itemWidth + gap;
    }
    top += height + gap;
    start = end;
  }
  return { items, height: Math.max(0, top - gap) };
}
