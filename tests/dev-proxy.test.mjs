import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.mjs';

test('development proxy forwards API endpoints but leaves source modules to Vite', () => {
  const matches = path => Object.keys(config.server.proxy).some(pattern => new RegExp(pattern).test(path));
  for (const path of ['/api/config', '/api/list?path=', '/media', '/media?path=photo.jpg', '/thumbnail?path=photo.jpg']) assert.equal(matches(path), true, path);
  for (const path of ['/media-info.mjs', '/media-info.mjs?t=123', '/thumbnail-utils.mjs', '/app.mjs']) assert.equal(matches(path), false, path);
});
