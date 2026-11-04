import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGallerySettings} from '../web/gallery-settings.mjs';

test('settings normalize persisted preferences and exclude viewport state from persistence', () => {
  const store = createGallerySettings();
  store.update({size:'300', rows:true, width:1200, sort:'invalid', hidden:'false', unused:true});
  assert.deepEqual(store.preferences(), {size:300,sort:'name-asc',rows:true,recursive:false,hidden:false,autoplay:false});
  assert.equal(store.getSnapshot().width,1200);
  store.update({size:900});
  assert.equal(store.getSnapshot().size,420);
});
test('settings retain stable snapshots for no-op updates and unsubscribe cleanly', () => {
  const store = createGallerySettings();
  const initial = store.getSnapshot();
  let calls = 0;
  const unsubscribe = store.subscribe((next, previous) => {calls++; assert.equal(previous,initial); assert.equal(next.autoplay,true);});
  store.update({size:220});
  assert.equal(store.getSnapshot(),initial);
  store.update({autoplay:true});
  assert.equal(calls,1);
  unsubscribe();
  store.update({autoplay:false});
  assert.equal(calls,1);
});
