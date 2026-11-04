const defaults = Object.freeze({size:220, sort:'name-asc', rows:false, recursive:false, hidden:false, autoplay:false});
const sorts = new Set(['name-asc','name-desc','time-desc','time-asc','taken-desc','taken-asc']);

// A stable snapshot shared by React menus and the imperative gallery adapter.
export function createGallerySettings() {
  let snapshot = Object.freeze({...defaults, width:0});
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      const next = {...snapshot};
      for (const key of Object.keys(defaults)) {
        if (!(key in patch)) continue;
        if (key === 'size') next.size = Number.isFinite(Number(patch.size)) ? Math.round(Math.max(140, Math.min(420, Number(patch.size)))) : defaults.size;
        else if (key === 'sort') next.sort = sorts.has(patch.sort) ? patch.sort : defaults.sort;
        else next[key] = patch[key] === true;
      }
      if ('width' in patch) next.width = Math.max(0, Number(patch.width) || 0);
      if (Object.keys(next).every(key => next[key] === snapshot[key])) return;
      const previous = snapshot;
      snapshot = Object.freeze(next);
      for (const listener of listeners) listener(snapshot, previous);
    },
    preferences() { return Object.fromEntries(Object.keys(defaults).map(key => [key, snapshot[key]])); },
  };
}
export const gallerySettings = createGallerySettings();
