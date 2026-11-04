import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BaseStyles, IconButton, ActionMenu, ActionList, Checkbox, TreeView} from '@primer/react';
import {ThemeProvider} from '@primer/react/next';
import {SidebarExpandIcon, SyncIcon, MinimizeIcon, MaximizeIcon, SortDescIcon, KebabHorizontalIcon, XIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, FileMediaIcon} from '@primer/octicons-react';
import {PathBar} from './path-bar';
import './primer.css';
import './theme.css';
import './tailwind.css';
import './ui.css';
import './sidebar.css';
import './gallery/directory-gallery.css';
import './style.css';
const button = (id,icon,label) => <IconButton unsafeDisableTooltip id={id} icon={icon} aria-label={label} title={label} variant="invisible" size="medium"/>;
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
      <ActionMenu.Anchor><IconButton unsafeDisableTooltip icon={SortDescIcon} aria-label="Sort" variant="invisible" size="medium"/></ActionMenu.Anchor>
      <ActionMenu.Overlay><ActionList selectionVariant="single">{[['name-asc','Name A–Z'],['name-desc','Name Z–A'],['time-desc','Modified: newest'],['time-asc','Modified: oldest'],['taken-desc','Taken: newest'],['taken-asc','Taken: oldest']].map(([value,label])=><ActionList.Item key={value} selected={(document.getElementById('sort')?.value||'name-asc')===value} onSelect={()=>update('sort',value)}>{label}</ActionList.Item>)}</ActionList></ActionMenu.Overlay>
    </ActionMenu>
    <ActionMenu onOpenChange={()=>refresh(value=>value+1)}>
      <ActionMenu.Anchor><IconButton unsafeDisableTooltip icon={KebabHorizontalIcon} aria-label="Gallery options" variant="invisible" size="medium"/></ActionMenu.Anchor>
      <ActionMenu.Overlay><ActionList>
        <ActionList.Item onSelect={()=>document.getElementById(document.getElementById('rows')?.getAttribute('aria-pressed')==='true'?'masonry':'rows').click()}>Adjusted height<ActionList.TrailingVisual>{document.getElementById('rows')?.getAttribute('aria-pressed')==='true'?<CheckIcon/>:null}</ActionList.TrailingVisual></ActionList.Item>
        { [['recursive','Include subdirectories'],['autoplay','Autoplay videos'],['hidden','Show hidden files']].map(([id,label])=><ActionList.Item key={id} onSelect={()=>update(id,!checked(id))}>{label}<ActionList.TrailingVisual>{checked(id)?<CheckIcon/>:null}</ActionList.TrailingVisual></ActionList.Item>) }
      </ActionList></ActionMenu.Overlay>
    </ActionMenu>
  </>;
}
// Keep the controls mounted: the media adapter owns persisted state and playback.
function App(){useEffect(()=>{import('./app.mjs').catch(error=>{document.getElementById('notice').textContent=error.message;});},[]);return <ThemeProvider colorMode="auto" dayScheme="light" nightScheme="dark"><BaseStyles className="app-shell">
<header className="topbar">
  <IconButton unsafeDisableTooltip id="toggle-tree" icon={SidebarExpandIcon} aria-label="Browse files" aria-controls="sidebar" aria-expanded={false} variant="invisible"/>
  <div id="breadcrumbs"/>
  <div className="toolbar-actions" role="group" aria-label="Gallery controls">
    <span id="count" role="status"/>
    {button('refresh',SyncIcon,'Refresh')}
    {button('smaller',MinimizeIcon,'Decrease thumbnail size')}{button('larger',MaximizeIcon,'Increase thumbnail size')}
    <GalleryMenus/>
  </div>
</header>
<button id="drawer-backdrop" aria-label="Close file browser" tabIndex={-1} hidden/>
<aside id="sidebar" className="sidebar" aria-label="File browser" hidden><div className="tree-heading"><strong>Files</strong>{button('close-tree',XIcon,'Close file browser')}</div><nav id="tree" aria-label="Files and folders"/><footer><span id="root-name">glade</span></footer></aside>
<main id="viewport" className="main-panel"><section className="content-panel" aria-label="Media gallery"><div id="notice" role="status"/><div className="gallery-body"><div id="gallery" aria-label="Media gallery"/><div id="empty" hidden/><button id="more" hidden>Show more…</button><div id="sentinel"/></div></section></main>
<div id="control-storage" hidden><select id="sort" aria-label="Sort"><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="time-desc">Modified: newest</option><option value="time-asc">Modified: oldest</option><option value="taken-desc">Taken: newest</option><option value="taken-asc">Taken: oldest</option></select><div id="gallery-options"><div className="segmented"><button id="masonry">Masonry</button><button id="rows">Adjusted height</button></div><label>Thumbnail size<input id="size" type="range" min="140" max="420" step="20" defaultValue="220"/></label>{[['recursive','Include subdirectories'],['autoplay','Autoplay videos'],['hidden','Show hidden files']].map(([id,label])=><label key={id}><Checkbox id={id}/>{label}</label>)}</div></div>
<dialog id="viewer" aria-labelledby="viewer-name"><header className="viewer-toolbar">
{button('close',ChevronLeftIcon,'Back to gallery')}
<div className="viewer-heading"><strong id="viewer-name"/><span id="viewer-details"/></div>
<div className="viewer-actions">{button('actual-view',MaximizeIcon,'View image at original size')}{button('fit-view',MinimizeIcon,'Fit image to window')}<a id="original" target="_blank" rel="noopener">Open original ↗</a></div>
</header><div id="viewer-content" tabIndex={0} aria-label="Media preview content"/><footer className="viewer-footer">{button('previous',ChevronLeftIcon,'Previous file')}<span id="viewer-position" role="status"/>{button('next',ChevronRightIcon,'Next file')}</footer></dialog>
</BaseStyles></ThemeProvider>;}
let treeRoot, pathRoot;
export function renderPaths(items,navigate){pathRoot??=createRoot(document.getElementById('breadcrumbs'));pathRoot.render(<ThemeProvider colorMode="auto"><PathBar items={items.map(i=>({label:i.name,path:i.path}))} onNavigate={navigate}/></ThemeProvider>);}
// Bound mounted tree rows per directory; closed subtrees remain unmounted.
function TreeChildren({nodes, renderNode, selected, parent}) {
  const [shown, setShown] = useState(100);
  const selectedIndex = nodes.findIndex(node => node.path === selected || (node.kind === undefined && selected?.startsWith(`${node.path}/`)));
  const visible = Math.max(shown, selectedIndex + 1);
  return <>{nodes.slice(0, visible).map(renderNode)}
    {visible < nodes.length && <TreeView.Item id={`more:${parent}`} onSelect={event => {
      event.preventDefault(); setShown(visible + 100);
    }}>Show more… ({nodes.length - visible} remaining)</TreeView.Item>}
  </>;
}
export function renderFolders(nodes,current,expanded,toggle,navigate,openFile){
  treeRoot??=createRoot(document.getElementById('tree'));
  const branch=n=>{
    const directory = n.kind === undefined;
    return <TreeView.Item key={n.path} className="file-tree-item" id={`entry:${n.path}`} current={n.path===current}
      expanded={directory ? expanded.has(n.path) : undefined}
      onExpandedChange={directory ? value=>toggle(n.path,value) : undefined}
      onSelect={e=>{e.preventDefault();directory ? navigate(n.path) : openFile(n);}}>
      <TreeView.LeadingVisual>{directory ? <TreeView.DirectoryIcon/> : <FileMediaIcon/>}</TreeView.LeadingVisual>
      <span className="file-tree-link" title={n.name}>{n.name}</span>
      {directory && <TreeView.SubTree>{n.children && <TreeChildren key={n.path} parent={n.path} nodes={n.children} renderNode={branch} selected={current}/>}</TreeView.SubTree>}
    </TreeView.Item>;
  };
  treeRoot.render(<ThemeProvider colorMode="auto"><div className="file-tree-view"><TreeView aria-label="Files and folders">{nodes.map(branch)}</TreeView></div></ThemeProvider>);
}

createRoot(document.getElementById('root')).render(<App/>);
