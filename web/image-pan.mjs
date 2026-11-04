/** Pan only overflowing images; video controls keep their own pointer gestures. */
export function bindImagePan(content) {
  let drag, suppressClickUntil = 0;
  const end = () => {
    if (!drag) return;
    if (drag.moved) suppressClickUntil = Date.now() + 350;
    const previous = drag; drag = undefined;
    if (previous.image.hasPointerCapture(previous.id)) previous.image.releasePointerCapture(previous.id);
    content.classList.remove('is-panning');
  };
  content.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || event.target.tagName !== 'IMG' || !content.classList.contains('can-pan')) return;
    drag = { id: event.pointerId, image: event.target, x: event.clientX, y: event.clientY, left: content.scrollLeft, top: content.scrollTop, moved: false };
    event.target.setPointerCapture(event.pointerId);
    content.classList.add('is-panning');
    event.preventDefault();
  });
  content.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    content.scrollLeft = drag.left - dx;
    content.scrollTop = drag.top - dy;
    event.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) content.addEventListener(type, end);
  for (const type of ['click', 'dblclick']) content.addEventListener(type, event => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  content.addEventListener('dragstart', event => { if (event.target.tagName === 'IMG') event.preventDefault(); });
  return end;
}

export function previewFitScale(width, height, viewportWidth, viewportHeight) {
  const fit = Math.min(viewportWidth / width, viewportHeight / height);
  const fill = Math.max(viewportWidth / width, viewportHeight / height);
  return fill <= fit * 1.10 ? fill : fit;
}

// Match image fitting while keeping the video element and its controls viewport-sized.
export function previewObjectFit(width, height, viewportWidth, viewportHeight) {
  if (![width, height, viewportWidth, viewportHeight].every(value => value > 0 && Number.isFinite(value))) return 'contain';
  const scale = previewFitScale(width, height, viewportWidth, viewportHeight);
  const fill = Math.max(viewportWidth / width, viewportHeight / height);
  return scale === fill ? 'cover' : 'contain';
}
