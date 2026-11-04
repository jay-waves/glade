/** Preserve the image point under the cursor as layout changes during zoom.
 * Native scroll limits apply when the image fits or an edge is reached.
 */
export function preserveZoomAnchor(content, image, point, resize) {
  const viewport = content.getBoundingClientRect();
  const before = image.getBoundingClientRect();
  if (!before.width || !before.height) { resize(); return; }
  const x = point?.x ?? viewport.left + content.clientWidth / 2;
  const y = point?.y ?? viewport.top + content.clientHeight / 2;
  const u = Math.max(0, Math.min(1, (x - before.left) / before.width));
  const v = Math.max(0, Math.min(1, (y - before.top) / before.height));
  resize();
  const after = image.getBoundingClientRect();
  content.scrollLeft += after.left + u * after.width - x;
  content.scrollTop += after.top + v * after.height - y;
}
