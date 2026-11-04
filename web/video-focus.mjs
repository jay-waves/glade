/** Snapshot focus before the browser moves it on pointerdown. */
export function bindVideoFocusGate(container) {
  const doc = container.ownerDocument, win = doc.defaultView;
  let wasFocused = false, windowBlurred = false;
  const capture = () => { wasFocused = !windowBlurred && container.contains(doc.activeElement); windowBlurred = false; };
  const blur = () => { windowBlurred = true; };
  container.addEventListener('pointerdown', capture, true);
  win.addEventListener('blur', blur);
  return {
    activate() {
      container.focus({preventScroll:true});
      return wasFocused;
    },
    dispose() {
      container.removeEventListener('pointerdown', capture, true);
      win.removeEventListener('blur', blur);
    },
  };
}
