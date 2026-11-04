import {GalleryMenus} from './gallery-menus';
import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {MantineProvider, ActionIcon} from '@mantine/core';
import {LayoutGrid, Minimize2 as MinimizeIcon, Maximize2 as MaximizeIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Plus as PlusIcon, Minus as DashIcon, Pin as PinIcon} from 'lucide-react';
import '@mantine/core/styles.css';
import {theme} from './mantine-theme';
import './theme.css';
import './tailwind.css';
import './ui.css';
import './sidebar.css';
import './gallery/directory-gallery.css';
import './style.css';
// Keep menus above both the sidebar and the media workspace.
const overlayRoot = document.createElement('div');
overlayRoot.id = 'glade-overlays';
document.body.append(overlayRoot);


const button = (id,Icon,label) => <ActionIcon id={id} aria-label={label}><Icon size={18} strokeWidth={1.75}/></ActionIcon>;
// Keep the controls mounted: the media adapter owns persisted state and playback.
function App(){useEffect(()=>{import('./app.mjs').catch(error=>{document.getElementById('notice').textContent=error.message;});},[]);return <MantineProvider theme={theme} defaultColorScheme="auto"><div className="app-shell">
<button id="sidebar-reveal" aria-label="Open file browser" aria-controls="sidebar" aria-expanded="false"/>
<aside id="sidebar" className="sidebar" aria-label="File browser">
  <div className="sidebar-controls">
    <div className="sidebar-control-row" role="group" aria-label="Library controls">
      {button('sidebar-pin',PinIcon,'Pin file browser')}<span id="gallery-controls" className="sidebar-inline-controls" role="group" aria-label="Gallery controls">{button('smaller',MinimizeIcon,'Decrease thumbnail size')}{button('larger',MaximizeIcon,'Increase thumbnail size')}</span><GalleryMenus overlayRoot={overlayRoot}/>
    </div>
    <button id="more" className="load-more" hidden>More</button>
  </div>
  <nav id="tree" aria-label="Files and folders"/><div className="sidebar-footer"><div id="sidebar-info" role="status" aria-live="polite"/></div>
</aside>
<div className="workspace">
<main tabIndex={-1} id="viewport" className="main-panel"><section className="content-panel" aria-label="Media gallery"><div id="notice" role="status"/><div className="gallery-body"><div id="gallery" aria-label="Media gallery"/><div id="empty" hidden/><div id="sentinel"/></div></section></main>

<dialog id="viewer" aria-label="Media preview"><div className="viewer-stage"><div id="viewer-content" tabIndex={0} aria-label="Media preview content"/><div id="preview-controls" className="preview-controls-zone" hidden><div className="preview-floating-controls"><div id="preview-actions" role="group" aria-label="Preview controls">{button('back-to-gallery',LayoutGrid,'Back to gallery')}<span className="preview-control-divider" aria-hidden="true"/>{button('previous',ChevronLeftIcon,'Previous file')}{button('next',ChevronRightIcon,'Next file')}<span id="zoom-divider" className="preview-control-divider"/>{button('zoom-out',DashIcon,'Zoom out (Ctrl −)')}<button id="actual-view" className="zoom-value" aria-label="View image at original size">100%</button>{button('zoom-in',PlusIcon,'Zoom in (Ctrl +)')}</div></div></div></div></dialog>
</div>
</div></MantineProvider>;}
createRoot(document.getElementById('root')).render(<App/>);
