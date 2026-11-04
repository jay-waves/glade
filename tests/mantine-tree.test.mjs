import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';

test('Mantine tree preserves paging, selection, disclosure and keyboard activation',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 for(const key of ['window','document','HTMLElement','Element','Node','getComputedStyle']) globalThis[key]=key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key];
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
 const dir=await mkdtemp(resolve('node_modules/.glade-tree-'));
 try {
 const result=await build({entryPoints:['web/folder-tree.jsx'],bundle:true,packages:'external',platform:'node',format:'esm',write:false,jsx:'automatic'});
 await writeFile(dir+'/tree.mjs',result.outputFiles[0].text);
 const {FolderTree}=await import(dir+'/tree.mjs');
 const React=await import('react');
 const {createRoot}=await import('react-dom/client');
 const {MantineProvider}=await import('@mantine/core');
 const root=createRoot(document.getElementById('root'));
 const files=Array.from({length:205},(_,i)=>({path:'folder/'+i,name:'File '+i,kind:'image'}));
 const nodes=[{path:'folder',name:'Folder',children:files}];
 let opened, navigated, toggled;
 await React.act(async()=>root.render(React.createElement(MantineProvider,{env:'test'},React.createElement(FolderTree,{nodes,current:'folder/0',expanded:new Set(['folder']),toggle:(...args)=>toggled=args,navigate:p=>navigated=p,openFile:n=>opened=n.path}))));
 assert.equal(document.querySelectorAll('[role="treeitem"]').length,102);
 const click=el=>React.act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
 await click(document.querySelector('.tree-disclosure'));
 assert.deepEqual(toggled,['folder',false]);
 await click(document.querySelector('.file-tree-row'));
 assert.equal(navigated,'folder');
 const file=document.querySelector('[role="treeitem"][data-value="folder/0"]');
 await React.act(async()=>file.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true})));
 assert.equal(opened,'folder/0');
 assert.equal(file.getAttribute('aria-selected'),'true');
 await click(document.querySelector('[data-value="more:folder"] .file-tree-row'));
 assert.equal(document.querySelectorAll('[role="treeitem"]').length,202);
 await React.act(async()=>root.unmount());
 } finally {await rm(dir,{recursive:true,force:true});dom.window.close();}
});
