import { computeRowsLayout } from 'react-photo-album';

const gap = 12;
export const galleryBatchSize = 64;
export const galleryUsesRows = (width, rows) => Boolean(rows && width > 700);
export const galleryColumns = (width, size) => {
  const count = Math.max(1, Math.floor((width + gap) / (size + gap)));
  return width <= 700 ? Math.min(2, count) : count;
};
/**
 * @template {import('react-photo-album').Photo} TPhoto
 * @param {readonly TPhoto[]} photos
 * @param {number} width
 * @param {number} size
 */
export const galleryRows = (photos, width, size) => computeRowsLayout(photos, gap, 0, width, size);

// Each completed batch keeps its row breaks when more photos are appended.
export function galleryRowTracks(photos, width, size) {
  const tracks = [];
  for (let start = 0; start < photos.length; start += galleryBatchSize) {
    tracks.push(...(galleryRows(photos.slice(start, start + galleryBatchSize), Math.max(1, width), size)?.tracks ?? []));
  }
  return tracks;
}

export function galleryRowLayout(ratios, width, size) {
  const photos = ratios.map(ratio => ({ src: '', width: Math.max(1, Math.round(ratio * 1000)), height: 1000 }));
  const items = [];
  let top = 0;
  for (const track of galleryRowTracks(photos, width, size)) {
    let left = 0;
    for (const photo of track.photos) {
      items.push({ left, top, width: photo.width, height: photo.height });
      left += photo.width + gap;
    }
    top += track.photos[0].height + gap;
  }
  return { items, height: Math.max(0, top - (items.length ? gap : 0)) };
}

// One flat card list keeps React identity stable across size and layout changes.
export function galleryLayout(ratios, availableWidth, size) {
  const width = Math.max(1, availableWidth);
  const count = galleryColumns(width, size);
  const cardWidth = (width - (count - 1) * gap) / count;
  const heights = Array(count).fill(0);
  const items = ratios.map(ratio => {
    // Dimensions are prepared before publication. Appending cards therefore
    // keeps all existing placements while balancing the remaining columns.
    const column = heights.indexOf(Math.min(...heights));
    const naturalHeight = Math.max(0, cardWidth - 2) / ratio;
    const height = naturalHeight + 2;
    const item = { left: column * (cardWidth + gap), top: heights[column], width: cardWidth, height };
    heights[column] += height + gap;
    return item;
  });
  return { items, height: Math.max(0, ...heights) - (items.length ? gap : 0) };
}

// The shortest column determines whether the viewport needs more cards.
export function galleryLoadMoreTop({ items, height }, columns = 0) {
  const bottoms = new Map();
  for (const item of items) {
    bottoms.set(item.left, Math.max(bottoms.get(item.left) ?? 0, item.top + item.height));
  }
  return bottoms.size && bottoms.size >= columns ? Math.min(height, ...bottoms.values()) : 0;
}

// Coordinates are relative to the gallery. Keep one viewport prepared ahead.
export function galleryNeedsMore(preparedBottom, viewportBottom, viewportHeight) {
  return preparedBottom <= viewportBottom + viewportHeight;
}
