export function bindPreviewControls(viewer, zone, {delay = 1600} = {}) {
  const doc = viewer.ownerDocument, listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  let timer, active = false, dragging = false, keyboardNavigation = false, pointer;
  const keyboardFocused = () => keyboardNavigation && zone.contains(doc.activeElement);
  const schedule = () => {
    clearTimeout(timer);
    if (!active || dragging || keyboardFocused()) return;
    timer = setTimeout(() => {
      if (zone.querySelector('[aria-expanded="true"]')) { schedule(); return; }
      zone.dataset.visible = 'false';
      zone.inert = true;
    }, delay);
  };
  const reveal = () => {
    if (!active) return;
    zone.dataset.visible = 'true';
    zone.inert = false;
    schedule();
  };
  listen(viewer, 'pointermove', event => {
    // Layout/focus changes can produce pointer events without actual movement.
    if (pointer && pointer.x === event.clientX && pointer.y === event.clientY) return;
    pointer = {x:event.clientX,y:event.clientY};
    keyboardNavigation = false;
    reveal();
  });
  listen(viewer, 'pointerdown', event => {
    keyboardNavigation = false;
    dragging = zone.contains(event.target) && Boolean(event.target.closest('[role="slider"], .video-slider'));
    reveal();
  });
  const release = () => { if (dragging) { dragging = false; schedule(); } };
  listen(doc, 'pointerup', release);
  listen(doc, 'pointercancel', release);
  listen(doc, 'keydown', event => {
    if (event.key === 'Tab') keyboardNavigation = true;
  }, true);
  listen(viewer, 'keydown', reveal);
  listen(zone, 'focusin', () => { if (keyboardNavigation) reveal(); });
  listen(zone, 'focusout', event => {
    if (!zone.contains(event.relatedTarget)) { keyboardNavigation = false; schedule(); }
  });
  listen(viewer, 'pointerleave', schedule);
  return {
    dispose() { active = false; clearTimeout(timer); listeners.forEach(remove => remove()); },
    setActive(value) {
      active = value; pointer = undefined; dragging = false; keyboardNavigation = false; clearTimeout(timer);
      if (active) reveal();
      else { zone.dataset.visible = 'false'; zone.inert = true; }
    },
  };
}
