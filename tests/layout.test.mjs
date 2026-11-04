import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryLayout, galleryRowLayout, galleryColumns, galleryUsesRows } from '../web/gallery/gallery-layout.mjs';
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

test('narrow galleries use at most two masonry columns regardless of row preference', () => {
  for (const width of [280, 400, 540, 700]) {
    assert.equal(galleryUsesRows(width, true), false);
    for (const size of [140, 220, 420]) {
      const columns = galleryColumns(width, size);
      assert.ok(columns >= 1 && columns <= 2);
      const { items } = galleryLayout([1.5, 0.6, 2, 1, 0.3, 4], width, size);
      assert.equal(new Set(items.map(item => item.left)).size, columns);
      assert.ok(items.every(item => item.left + item.width <= width + 0.001));
    }
  }
  assert.equal(galleryColumns(280, 220), 1);
  assert.equal(galleryColumns(540, 220), 2);
  assert.equal(galleryUsesRows(701, true), true);
  assert.equal(galleryUsesRows(1440, false), false);
});
