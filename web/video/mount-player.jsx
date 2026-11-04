import React from 'react';
import { createRoot } from 'react-dom/client';
import LibraryVideoPlayer from './video-player';
import {PlayerErrorBoundary} from './player-error-boundary';

export function mountVideoPlayer(host, {onFatalError, ...props}) {
  const root = createRoot(host);
  let disposed = false;
  // Leave React's commit before replacing/unmounting the failed player.
  const reportFailure = error => queueMicrotask(() => {
    if (!disposed) onFatalError(error);
  });
  root.render(<PlayerErrorBoundary onError={reportFailure}><LibraryVideoPlayer active {...props}/></PlayerErrorBoundary>);
  return () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
  };
}
