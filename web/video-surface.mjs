/** The player owns the viewport, so its controls do not move with media aspect ratio. */
export function resizeVideoSurface(host, content) {
  const surface = host.querySelector('.video-zoom-surface');
  if (!surface) return false;
  const size = {width:content.clientWidth + 'px',height:content.clientHeight + 'px'};
  Object.assign(host.style, size);
  Object.assign(surface.style, size, {transform:'none'});
  return true;
}

export function mountNativeVideoFallback(host, {src, poster, name, onError}) {
  const video = host.ownerDocument.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'metadata';
  video.src = src;
  video.poster = poster;
  video.setAttribute('aria-label', name);
  video.onerror = onError;
  // A plain video must no longer be treated as a zoomable React host.
  host.classList.remove('video-player-host');
  host.removeAttribute('style');
  host.replaceWith(video);
  return video;
}
