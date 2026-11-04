import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaInfo } from '../web/media-info.mjs';

test('photo metadata preserves exposure details without cluttering summary', () => {
  const info = mediaInfo({size: 2048}, {width: 6000, height: 4000, exif: ['Camera', '50 mm', 'f/2.8', '1/125 s', 'ISO 400']});
  assert.equal(info.summary, '6000 × 4000 · 2.0 KB');
  assert.match(info.details, /Camera · 50 mm · f\/2.8 · 1\/125 s · ISO 400/);
});
test('video metadata formats bitrate, duration, codec and frame rate', () => {
  const info = mediaInfo({size: 1048576}, {durationSeconds: 3661, bitrate: 2400000, codec: 'h264', frameRate: 29.97});
  assert.equal(info.details, '1:01:01 · 2.4 Mb/s · H.264 · 29.97 fps · 1.0 MB');
  assert.equal(mediaInfo({size: 512}).details, '512 B');
});
