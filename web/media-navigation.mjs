/** Resolve relative navigation across both ends; an empty gallery has no item. */
export function wrapMediaIndex(index, count) {
  return count > 0 ? ((index % count) + count) % count : -1;
}

export function mediaNavigationDirection(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return 0;
  return event.key === '<' ? -1 : event.key === '>' ? 1 : 0;
}
