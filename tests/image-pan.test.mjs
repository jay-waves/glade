import test from 'node:test';
import assert from 'node:assert/strict';
import { bindImagePan, previewFitScale, previewObjectFit } from '../web/image-pan.mjs';

test('image dragging pans overflow, releases capture, and excludes video controls', () => {
  const listeners = {};
  const classes = new Set(['can-pan']);
  const content = {
    scrollLeft: 200, scrollTop: 100,
    classList: { contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key) },
    addEventListener: (type, handler) => { listeners[type] = handler; },
  };
  let captured = false;
  const image = {
    tagName: 'IMG',
    setPointerCapture: () => { captured = true; },
    hasPointerCapture: () => captured,
    releasePointerCapture: () => { captured = false; },
  };
  const end = bindImagePan(content);
  const event = {button: 0, isPrimary: true, pointerId: 1, target: image, clientX: 100, clientY: 100, preventDefault() {}};
  listeners.pointerdown(event);
  listeners.pointermove({...event, clientX: 140, clientY: 120});
  assert.equal(content.scrollLeft, 160);
  assert.equal(content.scrollTop, 80);
  assert.equal(classes.has('is-panning'), true);
  end();
  assert.equal(captured, false);
  assert.equal(classes.has('is-panning'), false);
  listeners.pointerdown({...event, target: {tagName: 'VIDEO'}});
  assert.equal(classes.has('is-panning'), false);
  classes.delete('can-pan');
  listeners.pointerdown(event);
  assert.equal(captured, false);
});

test('preview fills only when the current workspace needs at most 10% extra scale', () => {
  assert.equal(previewFitScale(1000, 1000, 1090, 1000), 1.09);
  assert.equal(previewFitScale(1000, 1000, 1110, 1000), 1);
  // Pinning a sidebar changes the available workspace and therefore the fit.
  assert.equal(previewFitScale(1000, 1000, 1400, 1000), 1);
  assert.equal(previewFitScale(1000, 1000, 1080, 1000), 1.08);
});

test('video uses the same small-letterbox fill policy as images across viewport changes',()=>{
 assert.equal(previewObjectFit(1920,1080,1920,1200),'contain');
 assert.equal(previewObjectFit(1920,1080,1920,1170),'cover');
 assert.equal(previewObjectFit(1080,1920,1170,1920),'cover');
 assert.equal(previewObjectFit(1080,1920,1600,900),'contain');
 assert.equal(previewObjectFit(1920,1080,1920,1080),'cover');
 assert.equal(previewObjectFit(0,0,1000,800),'contain');
});
