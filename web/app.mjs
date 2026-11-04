import './markdown.css';
import {gallerySettings} from './gallery-settings.mjs';
import {resizeVideoSurface, mountNativeVideoFallback} from './video-surface.mjs';
import {wrapMediaIndex, mediaNavigationDirection} from './media-navigation.mjs';
import {bindPreviewControls} from './preview-controls.mjs';
import { renderFolders } from './folder-tree-mount.jsx';
import { galleryLayout, galleryRowLayout, galleryBatchSize, galleryUsesRows } from './gallery/gallery-layout.mjs';
import { resizeGallery } from './gallery/gallery-zoom.mjs';
import { preserveZoomAnchor } from './viewer-zoom.mjs';
import { bindImagePan, previewFitScale } from './image-pan.mjs';
import { mediaInfo } from './media-info.mjs';
import { bindZoomInput } from './zoom-input.mjs';
import { icon } from './icons.mjs';
import { createGalleryPlaybackQueue } from './playback.mjs';

const $ = id => document.getElementById(id);
for (const element of document.querySelectorAll('[data-icon]')) element.append(icon(element.dataset.icon));
const config = await request('/api/config');
document.title = `${config.name} · glade`;
const key = `glade:${config.root}`;
let settings;
try { settings = JSON.parse(localStorage.getItem(key)) ?? {}; } catch { settings = {}; }
if (!settings || typeof settings !== 'object') settings = {};
gallerySettings.update(settings);
settings = gallerySettings.getSnapshot();
let current = '', media = [], documents = [], activeDocument, shown = 0, cards = [], generation = 0, aborter, frame, viewerIndex = -1;
let scrollPositions = new Map(), restoring = false;
const expanded = new Set(['']), treeCache = new Map(), dimensions = new Map();
let treeRender = 0, fileSelection = 0;
const queue = createGalleryPlaybackQueue(8);
const gallery = $('gallery'), viewport = $('viewport');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
updateLayoutButtons();
settings = gallerySettings.getSnapshot();

async function request(url, signal) {
  const response = await fetch(url, { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}
function query(endpoint, path, extra = {}) { return `${endpoint}?${new URLSearchParams({ path, ...extra })}`; }
function mediaUrl(path) { return query('/media', path); }
function previewUrl(item) { return query('/thumbnail', item.path, { v: String(item.modified) }); }
function save() {
  try { localStorage.setItem(key, JSON.stringify(gallerySettings.preferences())); } catch { /* Private browsing or full storage. */ }
}
function message(text) { $('notice').textContent = text; }
function list(path, recursive = false, signal) { return request(query('/api/list', path, { recursive: recursive ? '1' : '0', hidden: settings.hidden ? '1' : '0' }), signal); }

async function renderTree() {
  const token = ++treeRender;
  async function branch(node) {
    if (node.kind || !expanded.has(node.path)) return node;
    if (!treeCache.has(node.path)) {
      const listing = await list(node.path);
      if (token !== treeRender) return node;
      treeCache.set(node.path, listing);
    }
    const listing = treeCache.get(node.path);
    const files = [...listing.media];
    if (settings.sort.startsWith('taken-')) {
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
        while (cursor < files.length && token === treeRender) {
          const item = files[cursor++];
          if (item.kind === 'markdown') continue;
          if (!dimensions.has(item.path)) {
            try { dimensions.set(item.path, await request(query('/api/metadata', item.path))); }
            catch { dimensions.set(item.path, {}); }
          }
        }
      }));
    }
    files.sort(compareMedia);
    return { ...node, children: await Promise.all([...listing.directories, ...files].map(branch)) };
  }
  const root = await branch({name:config.name,path:''});
  if (token !== treeRender) return;
  renderFolders([root], $('viewer').open ? (activeDocument ?? media[viewerIndex])?.path : current, expanded, (path,value) => { value ? expanded.add(path) : expanded.delete(path); renderTree().catch(e=>message(e.message)); }, navigate, openTreeFile);
}
async function openTreeFile(item) {
  const selection = ++fileSelection;
  const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';

  if (current !== parent || ![...media, ...documents].some(entry => entry.path === item.path)) {
    history.replaceState(null, '', `#${encodeURIComponent(parent)}`);
    if (!await load(parent)) return;
  }
  if (selection !== fileSelection || current !== parent) return;
  const document = documents.find(entry => entry.path === item.path);
  if (document) { openViewer(-1, item.fragment, document); return; }
  const index = media.findIndex(entry => entry.path === item.path);
  if (index >= 0) { openViewer(index, item.fragment); renderTree().catch(error => message(error.message)); }
}
function navigate(path) {
  ++fileSelection;

  const hash = `#${encodeURIComponent(path)}`;
  if (location.hash === hash || (!path && !location.hash)) load(path);
  else location.hash = hash;
}
function compareMedia(a, b) {
  const sort = settings.sort;
  const names = collator.compare(a.name, b.name) || collator.compare(a.path, b.path);
  if (sort.startsWith('name-')) return sort === 'name-asc' ? names : -names;
  const timestamp = item => sort.startsWith('taken-') ? (Date.parse(dimensions.get(item.path)?.capturedAt) || item.modified) : item.modified;
  return (sort.endsWith('-asc') ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a)) || names;
}
function sortMedia() { media.sort(compareMedia); }
async function load(path) {
  scrollPositions.set(current, viewport.scrollTop);
  aborter?.abort(); aborter = new AbortController();
  const signal = aborter.signal, token = ++generation;
  current = path; viewerIndex = -1;
  closeViewer(false);
  for (const card of cards) card.cleanup();
  cards = []; shown = 0; media = []; documents = []; gallery.replaceChildren(); gallery.style.height = '0px';
  $('empty').hidden = false; $('empty').textContent = 'Loading folder…'; $('more').hidden = true; $('sidebar-info').textContent = '';
  let prefix = ''; expanded.add('');
  for (const part of current.split('/').filter(Boolean)) { prefix += `${prefix ? '/' : ''}${part}`; expanded.add(prefix); }
  message('');
  try {
    const result = await list(current, settings.recursive, signal);
    if (token !== generation) return;
    if (!settings.recursive) treeCache.set(current, result);
    media = result.media.filter(item => item.kind !== 'markdown');
    documents = result.media.filter(item => item.kind === 'markdown');
    renderTree().catch(error => { if (token === generation) message(`File browser: ${error.message}`); });
    if (token !== generation) return;
    if (settings.sort.startsWith('taken-')) {
      message('Reading capture dates…');
      let cursor = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (cursor < media.length && token === generation) {
          const item = media[cursor++];
          if (item.kind === 'markdown') continue;
          if (!dimensions.has(item.path)) dimensions.set(item.path, await request(query('/api/metadata', item.path), signal));
        }
      }));
    }
    if (token !== generation) return;
    sortMedia();
    renderTree().catch(error => { if (token === generation) message(`File browser: ${error.message}`); });
    const notices = [...result.warnings];
    if (settings.sort.startsWith('taken-')) notices.push('Files without capture dates are sorted by modification time.');
    message(notices.join(' · '));
    $('sidebar-info').textContent = `${media.length.toLocaleString()} items`;
    $('empty').hidden = media.length > 0;
    $('empty').textContent = 'No images or videos in this folder.\nMarkdown documents are available in the file tree.';
    viewport.scrollTop = 0;
    addBatch();
    const savedScroll = scrollPositions.get(current) ?? 0;
    restoring = true;
    while (shown < media.length && gallery.offsetHeight < savedScroll + viewport.clientHeight) addBatch();
    viewport.scrollTop = savedScroll;
    restoring = false;
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || token !== generation) return;
    $('empty').hidden = false; $('empty').textContent = `Unable to open folder: ${error.message}`; message('');
  }
}
let layoutFrame;
function scheduleLayout() { if (!layoutFrame) layoutFrame = requestAnimationFrame(() => { layoutFrame = undefined; placeCards(); }); }
function placeCards() {
  updateLayoutButtons();
  const result = (galleryUsesRows(gallery.clientWidth, settings.rows) ? galleryRowLayout : galleryLayout)(cards.map(card => card.ratio), gallery.clientWidth, Number(settings.size));
  result.items.forEach((item, index) => Object.assign(cards[index].element.style, { left: `${item.left}px`, top: `${item.top}px`, width: `${item.width}px`, height: `${item.height}px` }));
  gallery.style.height = `${result.height}px`;
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const card = entry.target.cardState;
    if (card) { card.visible = entry.isIntersecting; card.updatePlayback(); }
  }
}, { root: viewport, rootMargin: '100px' });
function makeCard(item, index) {
  const element = document.createElement('button'); element.className = 'card gallery-card'; element.setAttribute('aria-label', `Open ${item.name}`);
  const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  const fallback = document.createElement('span'); fallback.className = 'fallback'; fallback.textContent = item.name; fallback.hidden = true;
  element.append(img, fallback);
  const caption = document.createElement('span'); caption.className = 'caption'; caption.textContent = item.name; element.append(caption);
  const data = dimensions.get(item.path);
  const state = { element, ratio: data?.width && data?.height ? data.width / data.height : 1.25, visible: false, hovered: false, cancel: undefined, updatePlayback: () => {} };
  let disposed = false;
  img.onload = () => { if (img.naturalWidth && !disposed) { state.ratio = img.naturalWidth / img.naturalHeight; scheduleLayout(); } };
  let triedOriginal = /\.(gif|apng|svg)$/i.test(item.name);
  img.src = triedOriginal ? mediaUrl(item.path) : previewUrl(item);
  img.onerror = () => {
    if (!triedOriginal && item.kind === 'image') { triedOriginal = true; img.src = mediaUrl(item.path); }
    else { img.hidden = true; fallback.hidden = false; }
  };
  let video;
  if (item.kind === 'video' || item.liveVideo) {
    const badge = document.createElement('span'); badge.className = 'badge'; badge.append(icon(item.liveVideo ? 'live' : 'play')); badge.title = item.liveVideo ? 'Live Photo' : 'Video'; badge.setAttribute('aria-label', badge.title); element.append(badge);
    video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'none'; element.insertBefore(video, caption);
    video.addEventListener('playing', () => { video.classList.add('playing'); state.cancel?.markPlaying(); });
    video.addEventListener('loadedmetadata', () => { if (!item.liveVideo && video.videoWidth) { state.ratio = video.videoWidth / video.videoHeight; scheduleLayout(); } });
    let failed = false;
    const suspend = () => { video.pause(); video.classList.remove('playing'); };
    const release = () => { state.cancel?.(); state.cancel = undefined; suspend(); };
    video.onerror = () => { failed = true; release(); };
    state.updatePlayback = () => {
      const wanted = !disposed && !document.hidden && !$('viewer').open && state.visible && (state.hovered || settings.autoplay);
      if (!wanted || failed) { release(); return; }
      if (state.cancel) { state.cancel.setPriority(state.hovered); return; }
      state.cancel = queue.request(() => {
        if (!video.getAttribute('src')) video.src = mediaUrl(item.liveVideo ?? item.path);
        video.play().catch(() => { failed = true; release(); });
      }, 4, { suspend, priority: state.hovered });
    };
    element.onmouseenter = element.onfocus = () => { state.hovered = true; failed = false; state.updatePlayback(); };
    element.onmouseleave = element.onblur = () => { state.hovered = false; state.updatePlayback(); };
  }
  element.onclick = () => openViewer(index);
  state.cleanup = () => { disposed = true; observer.unobserve(element); state.cancel?.(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } };
  element.cardState = state; observer.observe(element);
  return state;
}
function addBatch() {
  const end = Math.min(media.length, shown + galleryBatchSize);
  for (; shown < end; shown++) { const card = makeCard(media[shown], shown); cards.push(card); gallery.append(card.element); }
  placeCards(); $('more').hidden = shown >= media.length;
}
function maybeMore() {
  if (!restoring && shown < media.length && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 700) addBatch();
}
viewport.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = undefined; maybeMore(); }); });
new ResizeObserver(() => { placeCards(); maybeMore(); }).observe(gallery);
const moreObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) maybeMore(); }, { root: viewport, rootMargin: '700px' });
moreObserver.observe($('sentinel'));
$('more').onclick = addBatch;

function updateLayoutButtons() {
  const rows = galleryUsesRows(gallery.clientWidth, settings.rows);
  gallerySettings.update({width:gallery.clientWidth});
  const size = Number(settings.size), ratios = cards.map(card => card.ratio);
  for (const [id, direction] of [['smaller', -1], ['larger', 1]]) {
    $(id).disabled = resizeGallery(size, direction, false, gallery.clientWidth, rows, ratios) === size;
  }
}
gallerySettings.subscribe((next, previous) => {
  settings = next;
  const changed = key => next[key] !== previous[key];
  if (!['size','sort','rows','recursive','hidden','autoplay'].some(changed)) return;
  save();
  if (['recursive','hidden','sort'].some(changed)) {
    ++fileSelection; ++treeRender;
    if (changed('hidden')) treeCache.clear();
    load(current);
  } else if (changed('size') || changed('rows')) placeCards();
  if (changed('autoplay')) for (const card of cards) card.updatePlayback();
});
for (const [id, direction] of [['smaller', -1], ['larger', 1]]) $(id).onclick = () => {
  gallerySettings.update({size:resizeGallery(settings.size, direction, false, gallery.clientWidth, galleryUsesRows(gallery.clientWidth, settings.rows), cards.map(card => card.ratio))});
};
const sidebar = $('sidebar'), sidebarReveal = $('sidebar-reveal');
let sidebarPinned = false, transferringPreviewFocus = false;
function setSidebarOpen(open) {
  if (!open && sidebarPinned) return;
  document.querySelector('.app-shell').toggleAttribute('data-sidebar-open', open);
  sidebarReveal.setAttribute('aria-expanded', String(open));
  sidebar.inert = !open;
}
setSidebarOpen(false);
$('sidebar-pin').onclick = () => {
  sidebarPinned = !sidebarPinned;
  document.querySelector('.app-shell').toggleAttribute('data-sidebar-pinned', sidebarPinned);
  $('sidebar-pin').setAttribute('aria-pressed', String(sidebarPinned));
  $('sidebar-pin').setAttribute('aria-label', sidebarPinned ? 'Unpin file browser' : 'Pin file browser');
  if (!sidebarPinned) { setSidebarOpen(false); sidebarReveal.focus(); }
};
sidebarReveal.onclick = () => {
  const open = !document.querySelector('.app-shell').hasAttribute('data-sidebar-open');
  setSidebarOpen(open);
  if (open) sidebar.querySelector('button')?.focus();
};
document.addEventListener('pointerdown', event => {
  if (!sidebar.contains(event.target) && event.target !== sidebarReveal && !event.target.closest('#glade-overlays')) setSidebarOpen(false);
});
document.addEventListener('focusin', event => {
  if (transferringPreviewFocus) return;
  if (!sidebar.contains(event.target) && event.target !== sidebarReveal && !event.target.closest('#glade-overlays')) setSidebarOpen(false);
});
const previewControls = bindPreviewControls($('viewer'), $('preview-controls'));
document.addEventListener('visibilitychange', () => { for (const card of cards) card.updatePlayback(); });
const cancelImagePan = bindImagePan($('viewer-content'));
let unmountVideoPlayer, markdownAborter;
function clearViewer() { activeDocument = undefined; markdownAborter?.abort(); markdownAborter = undefined; $('viewer').classList.remove('markdown-viewer'); $('viewer-content').classList.remove('markdown-content'); cancelImagePan(); $('viewer-content').classList.remove('can-pan'); for (const video of $('viewer-content').querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); } unmountVideoPlayer?.(); unmountVideoPlayer = undefined; $('viewer-content').replaceChildren(); }
let viewerScale = 1, fitMode = true, viewerPointer;
let viewerMetadata = {};
function setPreviewMode(active) {
  document.querySelector('.app-shell').toggleAttribute('data-preview', active);
  $('gallery-controls').hidden = active;
  const video = active && Boolean($('viewer-content').querySelector('.video-player-host'));
  $('preview-controls').hidden = !active || video;
  $('preview-controls').classList.toggle('native-video-navigation', active && !video && Boolean($('viewer-content').querySelector('video')));
  previewControls.setActive(active && !video);
  viewport.inert = active;
  viewport.setAttribute('aria-hidden', String(active));
}
function closeViewer(restoreFocus = true) {
  if (!$('viewer').open) return;
  $('viewer').close();
  clearViewer();
  setPreviewMode(false);
  $('sidebar-info').textContent = `${media.length.toLocaleString()} items`;
  for (const card of cards) card.updatePlayback();
  if (restoreFocus) {
    (cards[viewerIndex]?.element ?? viewport).focus({ preventScroll: true });
    renderTree().catch(error => message(error.message));
  }
}
function refreshViewerInfo() {
  const item = activeDocument ?? media[viewerIndex];
  if (!item) return;
  const info = mediaInfo(item, viewerMetadata);
  $('sidebar-info').textContent = info.details;
}
$('viewer-content').addEventListener('pointermove', event => {
  viewerPointer = { x: event.clientX, y: event.clientY };
});
$('viewer-content').addEventListener('pointerleave', () => { viewerPointer = undefined; });
function updateViewerZoom() {
  const content = $('viewer-content'), img = content.querySelector(':scope > img');
  const host = content.querySelector('.video-player-host');
  if (host) {
    if (!resizeVideoSurface(host, content)) return;
    content.scrollLeft = 0; content.scrollTop = 0;
    return;
  }
  if (!img?.naturalWidth) return;
  const style = getComputedStyle(content);
  const width = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (fitMode) viewerScale = previewFitScale(img.naturalWidth, img.naturalHeight, width, height);
  img.style.width = `${img.naturalWidth * viewerScale}px`;
  img.style.height = `${img.naturalHeight * viewerScale}px`;
  if (fitMode) { content.scrollLeft = (content.scrollWidth - content.clientWidth) / 2; content.scrollTop = (content.scrollHeight - content.clientHeight) / 2; }
  $('actual-view').textContent = `${Math.round(viewerScale * 100)}%`;
  content.classList.toggle('can-pan', img.offsetWidth > content.clientWidth || img.offsetHeight > content.clientHeight);
}
function zoomViewer(direction, reset = false, point, scale) {
  const content = $('viewer-content'), img = content.querySelector(':scope > img');
  if (!img?.naturalWidth) return;
  const resize = () => {
    fitMode = reset;
    if (!reset) viewerScale = scale ?? Math.min(8, Math.max(.05, viewerScale * 1.25 ** direction));
    updateViewerZoom();
  };
  if (reset) {
    resize();
  } else preserveZoomAnchor(content, img, point, resize);
}
new ResizeObserver(() => { if ($('viewer').open) updateViewerZoom(); }).observe($('viewer-content'));
bindZoomInput(document.querySelector('.app-shell'), {
  isEnabled: () => $('viewer').open && Boolean($('viewer-content').querySelector(':scope > img')),
  key: (direction, reset) => zoomViewer(direction, reset, viewerPointer),
  wheel: event => {
    if (!event.deltaY) return;
    const point = $('viewer-content').contains(event.target) ? { x: event.clientX, y: event.clientY } : undefined;
    zoomViewer(event.deltaY < 0 ? 1 : -1, false, point);
  },
});
function updateViewerAtmosphere(image) {
  // Sample a tiny canvas once per image; transparent pixels do not tint the backdrop.
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 24, 24);
    const { data } = context.getImageData(0, 0, 24, 24);
    let red = 0, green = 0, blue = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const weight = data[i + 3] / 255;
      red += data[i] * weight; green += data[i + 1] * weight; blue += data[i + 2] * weight; total += weight;
    }
    if (total) {
      const channels = [red / total, green / total, blue / total];
      const gray = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      // Retain a muted hint of the image's hue, not its saturated highlights.
      const muted = channels.map(channel => Math.round(gray + (channel - gray) * .25));
      document.querySelector('.app-shell').style.setProperty('--ambient', `rgb(${muted.join(' ')})`);
    }
  } catch { /* Keep the neutral backdrop when a format cannot be sampled. */ }
}
function openViewer(index, fragment, documentItem) {
  index = documentItem ? -1 : wrapMediaIndex(index, media.length);
  if (!documentItem && (index === -1 || (index === viewerIndex && !activeDocument && $('viewer').open))) return;
  const sidebarFocus = sidebar.contains(document.activeElement) ? document.activeElement : null;
  viewerIndex = index; viewerPointer = undefined; clearViewer();
  document.querySelector('.app-shell').style.removeProperty('--ambient');
  activeDocument = documentItem;
  const item = documentItem ?? media[index];
  fitMode = true; viewerScale = 1;
  $('viewer-content').scrollTo(0, 0);
  $('viewer').setAttribute('aria-label', `Preview ${item.name}`);
  viewerMetadata = {}; refreshViewerInfo();
  const isVideo = item.kind === 'video' || Boolean(item.liveVideo);
  const isMarkdown = item.kind === 'markdown';
  for (const id of ['previous', 'next']) $(id).hidden = isMarkdown;
  $('actual-view').setAttribute('aria-label', isVideo ? 'Reset video to fit' : 'View image at original size');
  for (const [id, action, key] of [['zoom-in', 'Zoom in', '+'], ['zoom-out', 'Zoom out', '−']]) {
    const label = isVideo ? action : `${action} (Ctrl ${key})`;
    $(id).setAttribute('aria-label', label);
  }
  for (const id of ['zoom-in', 'zoom-out', 'actual-view']) { $(id).disabled = isVideo || isMarkdown; $(id).hidden = isVideo || isMarkdown; }
  $('zoom-divider').hidden = isVideo || isMarkdown;
  $('actual-view').textContent = '—';
  let element;
  if (isMarkdown) {
    element = document.createElement('article'); element.className = 'markdown-body';
    element.setAttribute('aria-label', item.name); element.textContent = 'Loading document…';
    $('viewer').classList.add('markdown-viewer'); $('viewer-content').classList.add('markdown-content');
    markdownAborter = new AbortController();
    const signal = markdownAborter.signal;
    Promise.all([import('./markdown.mjs'), fetch(mediaUrl(item.path), { signal }).then(async response => {
      if (!response.ok) throw new Error(`Unable to open document (${response.status})`);
      return response.text();
    })]).then(([{ renderMarkdown, scrollToFragment }, source]) => {
      if (signal.aborted || !element.isConnected) return;
      element.replaceChildren(renderMarkdown(source, item.path));
      scrollToFragment(element, fragment);
      element.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (link.dataset.documentPath) {
          event.preventDefault();
          if (link.dataset.documentPath === item.path) {
            if (link.dataset.documentFragment) scrollToFragment(element, link.dataset.documentFragment);
            else $('viewer-content').scrollTo(0, 0);
          } else openTreeFile({ path: link.dataset.documentPath, fragment: link.dataset.documentFragment }).catch(error => message(error.message));
        }
      });
    }).catch(error => { if (!signal.aborted && element.isConnected) element.textContent = error.message; });
  } else if (item.kind === 'video' || item.liveVideo) {
    element = document.createElement('div'); element.className = 'video-player-host';
    const surface = document.createElement('div'); surface.className = 'video-zoom-surface'; element.append(surface);
    const fallback = error => {
      if (!element.isConnected || element.className !== 'video-player-host') return;
      console.error('Unable to load the custom video player; using native controls.', error);
      unmountVideoPlayer?.(); unmountVideoPlayer = undefined;
      const onError = element.onerror;
      element = mountNativeVideoFallback(element, {
        src: mediaUrl(item.liveVideo ?? item.path),
        poster: item.liveVideo ? mediaUrl(item.path) : previewUrl(item),
        name: item.name, onError,
      });
      setPreviewMode(true);
    };
    import('./video/mount-player.jsx').then(({ mountVideoPlayer }) => {
      if (!element.isConnected) return;
      unmountVideoPlayer = mountVideoPlayer(surface, {
        onFatalError: fallback,
        src: mediaUrl(item.liveVideo ?? item.path),
        poster: item.liveVideo ? mediaUrl(item.path) : previewUrl(item),
        name: item.name,
        onBack: () => closeViewer(),
        onPrevious: () => openViewer(viewerIndex - 1),
        onNext: () => openViewer(viewerIndex + 1),
        onDimensions: (width, height) => {
          if (element.isConnected && width && height) {
            Object.assign(viewerMetadata, { width, height }); refreshViewerInfo(); updateViewerZoom();
          }
        },
        onError: () => element.onerror(),
      });
    }).catch(fallback);
  } else { element = document.createElement('img'); element.alt = item.name; element.draggable = false;
    element.onload = () => {
      if (!element.isConnected) return;
      updateViewerZoom();
      updateViewerAtmosphere(element);
      Object.assign(viewerMetadata, { width: element.naturalWidth, height: element.naturalHeight }); refreshViewerInfo();
    };
    element.src = mediaUrl(item.path); }
  element.onerror = () => {
    if (!element.isConnected) return;
    if (item.kind === 'image' && !item.liveVideo && element.dataset.fallback !== '1') {
      element.dataset.fallback = '1'; element.src = previewUrl(item);
      const note = document.createElement('p'); note.textContent = 'This image format is not supported by your browser. Showing a converted preview.'; $('viewer-content').append(note); return;
    }
    const note = document.createElement('p'); note.textContent = 'Your browser cannot display this format.'; $('viewer-content').append(note);
  };
  $('viewer-content').append(element);
  updateViewerZoom();
  if (!isMarkdown) Promise.all([request(query('/api/metadata', item.path)), item.liveVideo ? request(query('/api/metadata', item.liveVideo)) : Promise.resolve({})])
    .then(([primary, live]) => {
      if (!element.isConnected) return;
      // Decoded dimensions remain authoritative (including browser EXIF rotation).
      viewerMetadata = { ...primary, ...live, ...viewerMetadata };
      refreshViewerInfo(); updateViewerZoom();
    }).catch(() => { /* Size and decoded dimensions remain available. */ });
  // Opening a dialog can move focus even before our explicit focus call.
  // Keep a tree selection focused so previewing does not dismiss the sidebar.
  transferringPreviewFocus = Boolean(sidebarFocus);
  try {
    if (!$('viewer').open) $('viewer').show();
    setPreviewMode(true);
    updateViewerZoom();
    (sidebarFocus?.isConnected ? sidebarFocus : $('viewer-content')).focus({ preventScroll: true });
  } finally { transferringPreviewFocus = false; }
  renderTree().catch(error => message(error.message));
  for (const card of cards) card.updatePlayback();
}
$('back-to-gallery').onclick = () => closeViewer();
$('actual-view').onclick = () => zoomViewer(0, false, undefined, 1);
$('zoom-in').onclick = () => zoomViewer(1);
$('zoom-out').onclick = () => zoomViewer(-1);
$('viewer-content').ondblclick = event => {
  if (event.target.tagName !== 'IMG' || event.target.parentElement !== $('viewer-content')) return;
  zoomViewer(0, !fitMode, { x: event.clientX, y: event.clientY }, 1);
};
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-expanded="true"][aria-haspopup]')) return;
  if (!sidebarPinned && document.querySelector('.app-shell').hasAttribute('data-sidebar-open')) {
    event.preventDefault(); setSidebarOpen(false); sidebarReveal.focus(); return;
  }
  if ($('viewer').open) {
    event.preventDefault(); closeViewer();
  }
});
$('previous').onclick = () => openViewer(viewerIndex - 1);
$('next').onclick = () => openViewer(viewerIndex + 1);
$('viewer').addEventListener('keydown', event => {
  if (activeDocument) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
  const direction = mediaNavigationDirection(event);
  if (!direction) return;
  event.preventDefault();
  event.stopPropagation();
  openViewer(viewerIndex + direction);
});

function loadHash() { ++fileSelection; try { load(decodeURIComponent(location.hash.slice(1))); } catch { navigate(''); } }
window.addEventListener('hashchange', loadHash);
loadHash();
