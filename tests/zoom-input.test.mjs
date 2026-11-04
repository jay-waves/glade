import test from 'node:test';
import assert from 'node:assert/strict';
import { bindZoomInput } from '../web/zoom-input.mjs';

test('viewer consumes zoom shortcuts only when active and focused inside', () => {
  const document = new EventTarget();
  const viewer = new EventTarget();
  const inside = {};
  viewer.ownerDocument = document;
  viewer.contains = element => element === inside;
  document.activeElement = inside;
  let enabled = true;
  const calls = [];
  bindZoomInput(viewer, {
    isEnabled: () => enabled,
    key: (...args) => calls.push(args),
    wheel: () => calls.push('wheel'),
  });
  const send = (target, type, properties) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const key of ['+', '=', '-', '0']) {
    assert.equal(send(document, 'keydown', { key, ctrlKey: true }), true);
  }
  assert.deepEqual(calls, [[1, false], [1, false], [-1, false], [0, true]]);
  assert.equal(send(document, 'keydown', { key: '-', metaKey: true }), true);
  assert.equal(send(document, 'keydown', { key: '-' }), false);
  document.activeElement = {};
  assert.equal(send(document, 'keydown', { key: '-', ctrlKey: true }), false);
  document.activeElement = inside;
  enabled = false;
  assert.equal(send(document, 'keydown', { key: '-', ctrlKey: true }), false);
  assert.equal(send(viewer, 'wheel', { ctrlKey: true }), false);
  enabled = true;
  assert.equal(send(viewer, 'wheel', { ctrlKey: true }), true);
  assert.equal(calls.at(-1), 'wheel');
});
