import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {resizeVideoSurface,mountNativeVideoFallback} from '../web/video-surface.mjs';

test('video resize tolerates a removed surface and fallback leaves playable native media',()=>{
 const dom=new JSDOM('<main><div class="video-player-host"><div class="video-zoom-surface"></div></div></main>');
 const host=dom.window.document.querySelector('.video-player-host');
 const content={clientWidth:1000,clientHeight:800};
 assert.equal(resizeVideoSurface(host,content),true);
 assert.equal(host.style.width,'1000px');
 assert.equal(host.style.height,'800px');
 assert.equal(host.firstChild.style.transform,'none');
 resizeVideoSurface(host,content);
 assert.equal(host.style.width,'1000px');
 assert.equal(host.firstChild.style.height,'800px');
 host.textContent='Loading failed';
 assert.equal(resizeVideoSurface(host,content),false);
 const onError=()=>{};
 const video=mountNativeVideoFallback(host,{src:'/media?path=movie.mp4',poster:'/thumbnail',name:'Movie',onError});
 assert.ok(video.isConnected);
 assert.equal(video.controls,true);
 assert.equal(video.getAttribute('src'),'/media?path=movie.mp4');
 assert.equal(video.onerror,onError);
 assert.equal(dom.window.document.querySelector('.video-player-host'),null);
 dom.window.close();
});
