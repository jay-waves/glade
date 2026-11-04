import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BaseStyles, IconButton, ActionMenu, ActionList, Checkbox, TreeView} from '@primer/react';
import {ThemeProvider} from '@primer/react/next';
import {SidebarExpandIcon, SyncIcon, MinimizeIcon, MaximizeIcon, SortDescIcon, KebabHorizontalIcon, XIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon} from '@primer/octicons-react';
import {PathBar} from './path-bar';
import {FileToolbar} from './file-toolbar';
import './primer.css';
import './theme.css';
import './tailwind.css';
import './ui.css';
import './sidebar.css';
import './gallery/directory-gallery.css';
import './style.css';
const button = (id,icon,label) => <IconButton unsafeDisableTooltip id={id} icon={icon} aria-label={label} title={label} variant="invisible" size="small"/>;
function GalleryMenus() {
  const [, refresh] = useState(0);
  const update = (id, value) => {
    const input = document.getElementById(id);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    refresh(value => value + 1);
  };
  const checked = id => Boolean(document.getElementById(id)?.checked);
  return <>
    <ActionMenu onOpenChange={()=>refresh(value=>value+1)}>
      <ActionMenu.Anchor><IconButton unsafeDisableTooltip icon={SortDescIcon} aria-label="Sort" variant="invisible" size="small"/></ActionMenu.Anchor>
      <ActionMenu.Overlay><ActionList selectionVariant="single">{[['name-asc','Name A–Z'],['name-desc','Name Z–A'],['time-desc','Modified: newest'],['time-asc','Modified: oldest'],['taken-desc','Taken: newest'],['taken-asc','Taken: oldest']].map(([value,label])=><ActionList.Item key={value} selected={(document.getElementById('sort')?.value||'name-asc')===value} onSelect={()=>update('sort',value)}>{label}</ActionList.Item>)}</ActionList></ActionMenu.Overlay>
    </ActionMenu>
    <ActionMenu onOpenChange={()=>refresh(value=>value+1)}>
      <ActionMenu.Anchor><IconButton unsafeDisableTooltip icon={KebabHorizontalIcon} aria-label="Gallery options" variant="invisible" size="small"/></ActionMenu.Anchor>
      <ActionMenu.Overlay><ActionList>
        <ActionList.Item onSelect={()=>document.getElementById(document.getElementById('rows')?.getAttribute('aria-pressed')==='true'?'masonry':'rows').click()}>Adjusted height<ActionList.TrailingVisual>{document.getElementById('rows')?.getAttribute('aria-pressed')==='true'?<CheckIcon/>:null}</ActionList.TrailingVisual></ActionList.Item>
        { [['recursive','Include subdirectories'],['autoplay','Autoplay videos'],['hidden','Show hidden files']].map(([id,label])=><ActionList.Item key={id} onSelect={()=>update(id,!checked(id))}>{label}<ActionList.TrailingVisual>{checked(id)?<CheckIcon/>:null}</ActionList.TrailingVisual></ActionList.Item>) }
      </ActionList></ActionMenu.Overlay>
    </ActionMenu>
  </>;
}
// Keep the controls mounted: the media adapter owns persisted state and playback.
function App(){useEffect(()=>{import('./app.mjs').catch(error=>{document.getElementById('notice').textContent=error.message;});},[]);return <ThemeProvider colorMode="auto" dayScheme="light" nightScheme="dark"><BaseStyles className="app-shell">
<button id="drawer-backdrop" aria-label="Close folders" tabIndex={-1}/>
<aside id="sidebar" className="sidebar"><div className="tree-heading"><strong>Folders</strong>{button('refresh',SyncIcon,'Refresh folders')}</div><nav id="tree" aria-label="Folders"/><footer><span id="root-name">glade</span></footer></aside>
<div id="sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Resize folders" aria-valuemin={180} aria-valuemax={480} aria-valuenow={245} tabIndex={0}/>
<main id="viewport" className="main-panel"><header className="page-header">{button('toggle-tree',SidebarExpandIcon,'Toggle folders')}<div id="breadcrumbs"/></header><section className="content-panel" aria-label="Media gallery"><FileToolbar className="items-center gap-3 text-muted"><span id="count" role="status" className="me-auto"/><div className="toolbar-actions">{button('smaller',MinimizeIcon,'Decrease thumbnail size')}{button('larger',MaximizeIcon,'Increase thumbnail size')}
<GalleryMenus/>
</div></FileToolbar><div id="notice" role="status"/><div className="gallery-body"><div id="gallery" aria-label="Media gallery"/><div id="empty" hidden/><button id="more" hidden>Show more…</button><div id="sentinel"/></div></section></main>
<div id="control-storage" hidden><select id="sort" aria-label="Sort"><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="time-desc">Modified: newest</option><option value="time-asc">Modified: oldest</option><option value="taken-desc">Taken: newest</option><option value="taken-asc">Taken: oldest</option></select><div id="gallery-options"><div className="segmented"><button id="masonry">Masonry</button><button id="rows">Adjusted height</button></div><label>Thumbnail size<input id="size" type="range" min="140" max="420" step="20" defaultValue="220"/></label>{[['recursive','Include subdirectories'],['autoplay','Autoplay videos'],['hidden','Show hidden files']].map(([id,label])=><label key={id}><Checkbox id={id}/>{label}</label>)}</div></div>
<dialog id="viewer" aria-label="Media preview"><div className="viewer-toolbar"><span id="viewer-name"/><a id="original" target="_blank" rel="noopener">Open original ↗</a>{button('close',XIcon,'Close preview')}</div>{button('previous',ChevronLeftIcon,'Previous')}<div id="viewer-content"/>{button('next',ChevronRightIcon,'Next')}<div id="viewer-position"/></dialog>
</BaseStyles></ThemeProvider>;}
let treeRoot, pathRoot;
export function renderPaths(items,navigate){pathRoot??=createRoot(document.getElementById('breadcrumbs'));pathRoot.render(<ThemeProvider colorMode="auto"><PathBar items={items.map(i=>({label:i.name,path:i.path}))} onNavigate={navigate}/></ThemeProvider>);}
export function renderFolders(nodes,current,expanded,toggle,navigate){treeRoot??=createRoot(document.getElementById('tree'));const branch=n=><TreeView.Item key={n.path} id={n.path||'root'} current={n.path===current} expanded={expanded.has(n.path)} onExpandedChange={()=>toggle(n.path)} onSelect={e=>{e.preventDefault();navigate(n.path);}}><TreeView.LeadingVisual><TreeView.DirectoryIcon/></TreeView.LeadingVisual><span>{n.name}</span><TreeView.SubTree>{n.children?.map(branch)}</TreeView.SubTree></TreeView.Item>;treeRoot.render(<ThemeProvider colorMode="auto"><div className="file-tree-view"><TreeView aria-label="Folders">{nodes.map(branch)}</TreeView></div></ThemeProvider>);}
createRoot(document.getElementById('root')).render(<App/>);
