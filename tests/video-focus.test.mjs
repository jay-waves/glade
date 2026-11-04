import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {bindVideoFocusGate} from '../web/video-focus.mjs';
test('entering video only focuses; subsequent tap toggles until focus leaves',()=>{
 const dom=new JSDOM('<button id="outside">Outside</button><div id="player" tabindex="0"><video></video></div>');
 const doc=dom.window.document, player=doc.getElementById('player'), outside=doc.getElementById('outside');
 const gate=bindVideoFocusGate(player);
 const down=()=>player.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));
 outside.focus();down();player.focus();
 assert.equal(gate.activate(),false);
 down();assert.equal(gate.activate(),true);
 outside.focus();down();assert.equal(gate.activate(),false);
 dom.window.dispatchEvent(new dom.window.Event('blur'));
 down();assert.equal(gate.activate(),false);
 down();assert.equal(gate.activate(),true);
 gate.dispose();dom.window.close();
});
