import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveZoomAnchor } from '../web/viewer-zoom.mjs';

test('zoom keeps a cursor anchor fixed across image resizing and recentering', () => {
  const content = {
    clientWidth: 800, clientHeight: 600, scrollLeft: 100, scrollTop: 80,
    getBoundingClientRect: () => ({ left: 20, top: 50 }),
  };
  let rect = { left: -80, top: -30, width: 1000, height: 800 };
  const image = { getBoundingClientRect: () => rect };
  const point = { x: 270, y: 210 };
  const u = (point.x - rect.left) / rect.width;
  const v = (point.y - rect.top) / rect.height;
  preserveZoomAnchor(content, image, point, () => {
    rect = { left: -60, top: -20, width: 1500, height: 1200 };
  });
  assert.equal(rect.left + u * rect.width - (content.scrollLeft - 100), point.x);
  assert.equal(rect.top + v * rect.height - (content.scrollTop - 80), point.y);
});

test('button zoom defaults to viewport center', () => {
  const content = {
    clientWidth: 800, clientHeight: 600, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 40 }),
  };
  let rect = { left: 0, top: 40, width: 800, height: 600 };
  preserveZoomAnchor(content, { getBoundingClientRect: () => rect }, undefined, () => {
    rect = { left: 0, top: 40, width: 1600, height: 1200 };
  });
  assert.equal(content.scrollLeft, 400);
  assert.equal(content.scrollTop, 300);
});
