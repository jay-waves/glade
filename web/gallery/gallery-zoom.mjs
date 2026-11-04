import { galleryColumns, galleryRowTracks } from './gallery-layout.mjs';

export const gallerySize = { min: 140, max: 420, step: 1, initial: 220 };
export const gallerySizeLevels = [140, 175, 220, 275, 340, 420];

export function resizeGallery(size, direction, reset, width = 0, rows = true, ratios = []) {
  if (reset) return gallerySize.initial;
  const sign = Math.sign(direction);
  if (!sign) return size;
  if (!rows && width > 0) {
    // Pick the middle of the adjacent column band, not its unstable boundary.
    const target = galleryColumns(width, size) - sign;
    let first, last;
    for (let candidate = gallerySize.min; candidate <= gallerySize.max; candidate++) {
      if (galleryColumns(width, candidate) === target) {
        first ??= candidate;
        last = candidate;
      }
    }
    return first === undefined ? size : Math.round((first + last) / 2);
  }
  const photos = ratios.map(ratio => ({ src: '', width: Math.max(1, Math.round(ratio * 1000)), height: 1000 }));
  const rowKey = size => galleryRowTracks(photos, width, size).map(track => track.photos.length).join(',');
  const currentRows = photos.length && width > 0 ? rowKey(size) : undefined;
  const levels = sign > 0 ? gallerySizeLevels : [...gallerySizeLevels].reverse();
  return levels.find(next => (next - size) * sign > 0 &&
    (currentRows === undefined || rowKey(next) !== currentRows)) ?? size;
}
