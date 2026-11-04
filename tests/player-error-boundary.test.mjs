import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';

test('player render failures reach fallback once and allow clean unmount', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  for (const key of ['window','document','HTMLElement','Element','Node']) globalThis[key] = dom.window[key];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const dir = await mkdtemp(resolve('node_modules/.glade-boundary-'));
  let root;
  try {
    const result = await build({entryPoints:['web/video/player-error-boundary.jsx'],bundle:true,packages:'external',platform:'node',format:'esm',write:false});
    await writeFile(dir+'/boundary.mjs',result.outputFiles[0].text);
    const {PlayerErrorBoundary} = await import(dir+'/boundary.mjs');
    const React = await import('react');
    const {createRoot} = await import('react-dom/client');
    root = createRoot(document.getElementById('root'), {onCaughtError(){}});
    const failure = new Error('player render failed');
    const errors = [];
    function BrokenPlayer() { throw failure; }
    await React.act(async () => root.render(React.createElement(PlayerErrorBoundary,{onError:error=>errors.push(error)},React.createElement(BrokenPlayer))));
    assert.deepEqual(errors,[failure]);
    assert.equal(document.getElementById('root').textContent,'');
    await React.act(async () => root.unmount());
    root = undefined;
  } finally {
    if (root) root.unmount();
    await rm(dir,{recursive:true,force:true});
    dom.window.close();
  }
});
