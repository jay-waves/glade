import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapMediaIndex, mediaNavigationDirection} from '../web/media-navigation.mjs';

test('preview navigation wraps at both ends, including empty and single-file galleries',()=>{
 assert.equal(wrapMediaIndex(-1,5),4);
 assert.equal(wrapMediaIndex(5,5),0);
 assert.equal(wrapMediaIndex(2,5),2);
 assert.equal(wrapMediaIndex(-11,5),4);
 assert.equal(wrapMediaIndex(11,5),1);
 assert.equal(wrapMediaIndex(-1,1),0);
 assert.equal(wrapMediaIndex(1,1),0);
 assert.equal(wrapMediaIndex(0,0),-1);
});

test('angle brackets navigate media while arrows and modified or held keys do not',()=>{
 assert.equal(mediaNavigationDirection({key:'<',shiftKey:true}),-1);
 assert.equal(mediaNavigationDirection({key:'>',shiftKey:true}),1);
 for (const key of ['ArrowLeft','ArrowRight',',','.']) assert.equal(mediaNavigationDirection({key}),0);
 for (const flag of ['repeat','ctrlKey','metaKey','altKey','defaultPrevented']) assert.equal(mediaNavigationDirection({key:'>',[flag]:true}),0);
});
