import { renderPaths, renderFolders } from './main.jsx';
import { galleryLayout, galleryRowLayout, galleryBatchSize } from './gallery/gallery-layout.mjs';
import { resizeGallery } from './gallery/gallery-zoom.mjs';
import { icon } from './icons.mjs';
import { createGalleryPlaybackQueue } from './playback.mjs';

const $ = id => document.getElementById(id);
for (const element of document.querySelectorAll('[data-icon]')) element.append(icon(element.dataset.icon));
const config = await request('/api/config');
$('root-name').textContent = config.name;
$('root-name').title = config.root;
document.title = `${config.name} · glade`;
const key = `glade:${config.root}`;
let settings;
try { settings = JSON.parse(localStorage.getItem(key)) ?? {}; } catch { settings = {}; }
if (!settings || typeof settings !== 'object') settings = {};
let current = '', media = [], shown = 0, cards = [], generation = 0, aborter, frame, viewerIndex = -1;
let scrollPositions = new Map(), restoring = false;
const expanded = new Set(['']), treeCache = new Map(), dimensions = new Map();
let treeRender = 0, fileSelection = 0;
const queue = createGalleryPlaybackQueue(8);
const gallery = $('gallery'), viewport = $('viewport');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const controls = ['size', 'sort', 'recursive', 'hidden', 'autoplay'];
for (const id of controls) {
  if (settings[id] === undefined) continue;
  if ($(id).type === 'checkbox') $(id).checked = Boolean(settings[id]);
  else $(id).value = settings[id];
}
settings.rows = settings.rows === true;
updateLayoutButtons();
setTreeHidden(true);

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
  for (const id of controls) settings[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Private browsing or full storage. */ }
}
function message(text) { $('notice').textContent = text; }
function list(path, recursive = false, signal) { return request(query('/api/list', path, { recursive: recursive ? '1' : '0', hidden: $('hidden').checked ? '1' : '0' }), signal); }

async function renderTree() {
  const token = ++treeRender;
  async function branch(node) {
    if (node.kind || !expanded.has(node.path)) return node;
    if (!treeCache.has(node.path)) {
      const listing = await list(node.path);
      if (token !== treeRender) return node;
      treeCache.set(node.path, listing);
    }
    return { ...node, children: await Promise.all([...treeCache.get(node.path).directories, ...treeCache.get(node.path).media].map(branch)) };
  }
  const root = await branch({name:config.name,path:''});
  if (token !== treeRender) return;
  renderFolders([root], $('viewer').open ? media[viewerIndex]?.path : current, expanded, (path,value) => { value ? expanded.add(path) : expanded.delete(path); renderTree().catch(e=>message(e.message)); }, navigate, openTreeFile);
}
async function openTreeFile(item) {
  const selection = ++fileSelection;
  const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
  setTreeHidden(true);
  if (current !== parent || !media.some(entry => entry.path === item.path)) {
    history.replaceState(null, '', `#${encodeURIComponent(parent)}`);
    if (!await load(parent)) return;
  }
  if (selection !== fileSelection || current !== parent) return;
  const index = media.findIndex(entry => entry.path === item.path);
  if (index >= 0) { openViewer(index); renderTree().catch(error => message(error.message)); }
}
function breadcrumbs() {
  const items = [{ name: config.name, path: '' }];
  let accumulated = '';
  for (const name of current.split('/').filter(Boolean)) { accumulated += `${accumulated ? '/' : ''}${name}`; items.push({ name, path: accumulated }); }
  renderPaths(items, navigate);
}
function navigate(path) {
  ++fileSelection;
  setTreeHidden(true);
  const hash = `#${encodeURIComponent(path)}`;
  if (location.hash === hash || (!path && !location.hash)) load(path);
  else location.hash = hash;
}
function sortMedia() {
  const sort = $('sort').value;
  media.sort((a, b) => {
    const names = collator.compare(a.name, b.name) || collator.compare(a.path, b.path);
    if (sort.startsWith('name-')) return sort === 'name-asc' ? names : -names;
    const timestamp = item => sort.startsWith('taken-') ? (Date.parse(dimensions.get(item.path)?.capturedAt) || item.modified) : item.modified;
    return (sort.endsWith('-asc') ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a)) || names;
  });
}
async function load(path) {
  scrollPositions.set(current, viewport.scrollTop);
  aborter?.abort(); aborter = new AbortController();
  const signal = aborter.signal, token = ++generation;
  current = path; viewerIndex = -1;
  if ($('viewer').open) $('viewer').close();
  for (const card of cards) card.cleanup();
  cards = []; shown = 0; media = []; gallery.replaceChildren(); gallery.style.height = '0px';
  $('empty').hidden = false; $('empty').textContent = 'Loading folder…'; $('more').hidden = true; $('count').textContent = '';
  let prefix = ''; expanded.add('');
  for (const part of current.split('/').filter(Boolean)) { prefix += `${prefix ? '/' : ''}${part}`; expanded.add(prefix); }
  breadcrumbs(); message('');
  try {
    const result = await list(current, $('recursive').checked, signal);
    if (token !== generation) return;
    if (!$('recursive').checked) treeCache.set(current, result);
    media = result.media;
    renderTree().catch(error => { if (token === generation) message(`File browser: ${error.message}`); });
    if (token !== generation) return;
    if ($('sort').value.startsWith('taken-')) {
      message('Reading capture dates…');
      let cursor = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (cursor < media.length && token === generation) {
          const item = media[cursor++];
          if (!dimensions.has(item.path)) dimensions.set(item.path, await request(query('/api/metadata', item.path), signal));
        }
      }));
    }
    if (token !== generation) return;
    sortMedia();
    const notices = [...result.warnings];
    if ($('sort').value.startsWith('taken-')) notices.push('Files without capture dates are sorted by modification time.');
    message(notices.join(' · '));
    $('count').textContent = `${media.length.toLocaleString()} items`;
    $('empty').hidden = media.length > 0;
    $('empty').textContent = 'No media in this folder.\nTry another folder or enable “Include subdirectories”.';
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
  const result = (settings.rows ? galleryRowLayout : galleryLayout)(cards.map(card => card.ratio), gallery.clientWidth, Number($('size').value));
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
      const wanted = !disposed && !document.hidden && !$('viewer').open && state.visible && (state.hovered || $('autoplay').checked);
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

function updateLayoutButtons() { $('masonry').setAttribute('aria-pressed', String(!settings.rows)); $('rows').setAttribute('aria-pressed', String(settings.rows)); }
for (const name of ['masonry', 'rows']) $(name).onclick = () => { settings.rows = name === 'rows'; updateLayoutButtons(); save(); placeCards(); };
$('size').oninput = () => { save(); placeCards(); };
for (const [id, direction] of [['smaller', -1], ['larger', 1]]) $(id).onclick = () => {
  $('size').value = resizeGallery(Number($('size').value), direction, false, gallery.clientWidth, settings.rows, cards.map(card => card.ratio));
  $('size').oninput();
};
for (const menu of document.querySelectorAll('details.options')) {
  menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of document.querySelectorAll('details.options')) if (other !== menu) other.open = false;
  });
}
document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll('details.options[open]')) if (!menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('viewer').open) return;
  const menu = document.querySelector('details.options[open]');
  if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
  else setTreeHidden(true);
});
for (const id of ['recursive', 'hidden', 'sort']) $(id).onchange = () => { ++fileSelection; ++treeRender; save(); if (id === 'hidden') treeCache.clear(); load(current); };
$('autoplay').onchange = () => { save(); for (const card of cards) card.updatePlayback(); };
$('refresh').onclick = () => { ++fileSelection; ++treeRender; treeCache.clear(); dimensions.clear(); load(current); };
function setTreeHidden(hidden) {
  const restoreFocus = hidden && $('sidebar').contains(document.activeElement);
  document.body.classList.toggle('tree-hidden', hidden);
  $('sidebar').hidden = hidden;
  $('drawer-backdrop').hidden = hidden;
  $('toggle-tree').setAttribute('aria-expanded', String(!hidden));
  $('viewport').inert = !hidden;
  if (restoreFocus) $('toggle-tree').focus();
}
$('toggle-tree').onclick = () => {
  const hidden = !$('sidebar').hidden;
  setTreeHidden(hidden);
  if (!hidden) { $('close-tree').focus(); renderTree().catch(error => message(`File browser: ${error.message}`)); }
};
$('close-tree').onclick = $('drawer-backdrop').onclick = () => setTreeHidden(true);
document.addEventListener('visibilitychange', () => { for (const card of cards) card.updatePlayback(); });
function clearViewer() { for (const video of $('viewer-content').querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); } $('viewer-content').replaceChildren(); }
function openViewer(index) {
  if (index < 0 || index >= media.length) return;
  viewerIndex = index; clearViewer();
  const item = media[index];
  $('viewer-content').classList.remove('actual-size');
  $('viewer-name').textContent = item.name;
  $('viewer-name').title = item.path;
  $('viewer-details').textContent = `${item.kind === 'video' ? 'Video' : 'Image'} · ${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(item.size / 1024 / 1024)} MB · ${item.path}`;
  $('actual-view').disabled = $('fit-view').disabled = item.kind === 'video' || Boolean(item.liveVideo);
  $('original').href = mediaUrl(item.path);
  $('viewer-position').textContent = `${index + 1} / ${media.length}`;
  $('previous').disabled = index === 0; $('next').disabled = index === media.length - 1;
  let element;
  if (item.kind === 'video' || item.liveVideo) {
    element = document.createElement('video'); element.controls = true; element.playsInline = true; element.preload = 'metadata';
    element.src = mediaUrl(item.liveVideo ?? item.path);
    if (item.liveVideo) element.poster = mediaUrl(item.path);
    else element.poster = previewUrl(item);
  } else { element = document.createElement('img'); element.alt = item.name; element.src = mediaUrl(item.path); }
  element.onerror = () => {
    if (!element.isConnected) return;
    if (item.kind === 'image' && !item.liveVideo && element.dataset.fallback !== '1') {
      element.dataset.fallback = '1'; element.src = previewUrl(item);
      const note = document.createElement('p'); note.textContent = 'This image format is not supported by your browser. Showing a converted preview.'; $('viewer-content').append(note); return;
    }
    const note = document.createElement('p'); note.textContent = 'Your browser cannot display this format. Use Open original to open the file.'; $('viewer-content').append(note);
  };
  $('viewer-content').append(element);
  if (!$('viewer').open) $('viewer').showModal();
  for (const card of cards) card.updatePlayback();
}
$('actual-view').onclick = () => { $('viewer-content').classList.add('actual-size'); $('viewer-content').focus(); };
$('fit-view').onclick = () => $('viewer-content').classList.remove('actual-size');
$('viewer-content').ondblclick = event => { if (event.target.tagName === 'IMG') { $('viewer-content').classList.toggle('actual-size'); $('viewer-content').focus(); } };
$('close').onclick = () => $('viewer').close();
$('viewer').onclose = () => {
  if ($('viewer').open) return;
  clearViewer();
  for (const card of cards) card.updatePlayback();
  renderTree().catch(error => message(error.message));
};
$('previous').onclick = () => openViewer(viewerIndex - 1);
$('next').onclick = () => openViewer(viewerIndex + 1);
$('viewer').addEventListener('keydown', event => {
  if (event.target.tagName === 'VIDEO' || $('viewer-content').classList.contains('actual-size')) return;
  if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openViewer(viewerIndex - 1); }
  if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); openViewer(viewerIndex + 1); }
});
function loadHash() { ++fileSelection; try { load(decodeURIComponent(location.hash.slice(1))); } catch { navigate(''); } }
window.addEventListener('hashchange', loadHash);
loadHash();
