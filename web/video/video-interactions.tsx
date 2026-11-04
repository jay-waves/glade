import {bindVideoFocusGate} from '../video-focus.mjs';
import { Hotkey, useContainer, useHotkey, useTapGesture } from '@videojs/react';
import { useEffect, useEffectEvent, useState, useRef } from 'react';
import { usePlayer } from '@videojs/react/video';
import { stepPlaybackRate, videoSeekStep } from './video-playback';

// Register all input with Video.js so focus, menus, editable fields, modifiers
// and held keys share one policy. File navigation is shared by the preview shell.
export function VideoInteractions({ active }: { active: boolean }) {
  const player = usePlayer();
  const [treeFocused, setTreeFocused] = useState(false);
  useEffect(() => {
    const update = () => setTreeFocused(Boolean(document.activeElement?.closest('#tree')));
    update();
    document.addEventListener('focusin', update);
    return () => document.removeEventListener('focusin', update);
  }, []);
  const scope = { target: 'document' as const, disabled: !active || treeFocused };
  const rate = usePlayer(state => state.playbackRate);
  const container = useContainer();
  const focusGate = useRef<ReturnType<typeof bindVideoFocusGate> | null>(null);
  useEffect(() => {
    if (!container) return;
    const gate = bindVideoFocusGate(container);
    focusGate.current = gate;
    return () => { gate.dispose(); focusGate.current = null; };
  }, [container]);
  useTapGesture(() => {
    if (!focusGate.current?.activate()) return;
    if (player.state.paused) void player.play();
    else player.pause();
  }, {disabled: !active});
  const seekFromControl = useEffectEvent((event: KeyboardEvent) => {
    if (!active || !(event.target instanceof Element) || !event.target.closest('.video-seek[role="slider"], .video-seek [role="slider"]')) return;
    const step = videoSeekStep(event);
    if (!step) return;
    // Sliders process arrows in capture before the player's hotkeys. Apply the
    // same seconds-based seek here before their percentage-based handler runs.
    event.preventDefault();
    event.stopPropagation();
    player.seek(player.state.currentTime + step);
  });
  useEffect(() => {
    if (!container) return;
    const keydown = (event: KeyboardEvent) => seekFromControl(event);
    const controls = document.getElementById('video-controls');
    container.addEventListener('keydown', keydown, true);
    controls?.addEventListener('keydown', keydown, true);
    return () => {
      container.removeEventListener('keydown', keydown, true);
      controls?.removeEventListener('keydown', keydown, true);
    };
  }, [container]);
  useHotkey({ ...scope, keys: '[', action: 'speedDown', onActivate: () => player.setPlaybackRate(stepPlaybackRate(rate, -1)) });
  useHotkey({ ...scope, keys: ']', action: 'speedUp', onActivate: () => player.setPlaybackRate(stepPlaybackRate(rate, 1)) });
  useHotkey({ ...scope, keys: 'Backspace', repeatable: false, onActivate: () => player.setPlaybackRate(1) });
  return <>
    {/* Opening a video from the tree leaves focus outside the player. Only
        the visible reader owns the page-wide playback shortcut. */}
    <Hotkey {...scope} keys="Space" action="togglePaused" />
    <Hotkey {...scope} keys="p" action="togglePaused" />
    <Hotkey {...scope} keys="k" action="togglePaused" />
    <Hotkey {...scope} keys="m" action="toggleMuted" />
    <Hotkey {...scope} keys="f" action="toggleFullscreen" />
    <Hotkey {...scope} keys="ArrowLeft" action="seekStep" value={-5} />
    <Hotkey {...scope} keys="ArrowRight" action="seekStep" value={5} />
    <Hotkey {...scope} keys="Shift+ArrowLeft" action="seekStep" value={-5} />
    <Hotkey {...scope} keys="Shift+ArrowRight" action="seekStep" value={5} />
    <Hotkey {...scope} keys="Shift+ArrowDown" action="seekStep" value={-5} />
    <Hotkey {...scope} keys="Shift+ArrowUp" action="seekStep" value={5} />
    <Hotkey {...scope} keys="9" action="volumeStep" value={-0.02} />
    <Hotkey {...scope} keys="0" action="volumeStep" value={0.02} />
  </>;
}
