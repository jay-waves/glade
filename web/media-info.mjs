export function mediaInfo(item, metadata = {}) {
  const size = item.size < 1024 ? `${item.size} B` : item.size < 1048576 ? `${(item.size / 1024).toFixed(1)} KB` : `${(item.size / 1048576).toFixed(1)} MB`;
  const dimensions = metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : '';
  const details = [dimensions, ...(metadata.exif ?? [])];
  if (Number.isFinite(metadata.durationSeconds)) {
    const total = Math.round(metadata.durationSeconds), hours = Math.floor(total / 3600);
    details.push(`${hours ? hours + ':' : ''}${String(Math.floor(total / 60) % 60).padStart(hours ? 2 : 1, '0')}:${String(total % 60).padStart(2, '0')}`);
  }
  if (metadata.bitrate > 0) details.push(metadata.bitrate >= 1e6 ? `${(metadata.bitrate / 1e6).toFixed(1)} Mb/s` : `${Math.round(metadata.bitrate / 1000)} kb/s`);
  if (metadata.codec) details.push(({ h264: 'H.264', hevc: 'HEVC', av1: 'AV1', vp9: 'VP9', prores: 'ProRes' })[metadata.codec] ?? metadata.codec.toUpperCase());
  if (metadata.frameRate > 0) details.push(`${Number(metadata.frameRate.toFixed(2))} fps`);
  const captured = Date.parse(metadata.capturedAt);
  if (Number.isFinite(captured)) details.push(`Taken ${new Date(captured).toLocaleString()}`);
  return { summary: [dimensions, size].filter(Boolean).join(' · '), details: [...details.filter(Boolean), size].join(' · ') };
}
