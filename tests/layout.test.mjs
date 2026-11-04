import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryLayout, galleryRowLayout } from '../web/gallery/gallery-layout.mjs';
const layout = (ratios, width, size, rows) => (rows ? galleryRowLayout : galleryLayout)(ratios, width, size);

test('migrated layouts keep cards inside the viewport without overlap', () => {
  for (const rows of [false, true]) for (const width of [160, 720, 1440]) {
    const ratios = [1.5, 0.6, 2, 1, 0.3, 4, 1.1, 0.8];
    const { items, height } = layout(ratios, width, 220, rows);
    assert.equal(items.length, ratios.length);
    items.forEach((item, i) => {
      assert.ok(Number.isFinite(item.height) && item.height > 0);
      assert.ok(item.left >= 0 && item.left + item.width <= width + 0.001);
      assert.ok(item.top + item.height <= height + 0.001);
      for (const other of items.slice(i + 1)) {
        const overlap = item.left < other.left + other.width - 0.001 && item.left + item.width > other.left + 0.001 && item.top < other.top + other.height - 0.001 && item.top + item.height > other.top + 0.001;
        assert.equal(overlap, false);
      }
    });
  }
});
