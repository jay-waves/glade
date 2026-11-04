// Each preview owns its requests and timeout; a stuck decoder cannot retain
// its source indefinitely or interfere with another card's lifecycle.
export const galleryPlaybackBudget = 32;

// Automatic previews share a budget and rotate only when someone is waiting.
// One hovered/focused preview may borrow an extra slot without pausing others.
export const galleryPlaybackTurn = 20000;
export function createGalleryPlaybackQueue(limit = galleryPlaybackBudget, timers = globalThis) {
  const pending = [], running = new Set();
  let used = 0, rotation, extra;
  const release = job => {
    if (!running.delete(job)) return false;
    if (extra === job) extra = undefined;
    else used -= job.weight;
    return true;
  };
  const defer = job => {
    release(job);
    job.suspend?.();
    pending.push(job);
  };
  const grant = (job, borrowed = false) => {
    pending.splice(pending.indexOf(job), 1);
    running.add(job);
    if (borrowed) extra = job;
    else used += job.weight;
    job.ready = false;
    job.start();
  };
  const yieldFor = job => {
    const victims = [...running].filter(other => other !== extra && !other.priority && other.suspend && other.ready);
    if (limit - used + victims.reduce((sum, other) => sum + other.weight, 0) < job.weight) return;
    for (const other of victims) {
      if (used + job.weight <= limit) break;
      defer(other);
    }
    grant(job);
  };
  const pump = () => {
    const urgent = pending.find(job => job.priority);
    if (urgent && (used + urgent.weight <= limit || !extra)) {
      grant(urgent, used + urgent.weight > limit);
    }
    while (pending.length) {
      const index = pending.findIndex(job => used + job.weight <= limit);
      if (index < 0) break;
      grant(pending[index]);
    }
    if (!pending.some(job => !job.priority)) { timers.clearTimeout(rotation); rotation = undefined; }
    else if (rotation === undefined && [...running].some(job => job.suspend)) {
      rotation = timers.setTimeout(() => {
        rotation = undefined;
        const next = pending.find(job => !job.priority);
        if (next) yieldFor(next);
        pump();
      }, galleryPlaybackTurn);
    }
  };
  return {
    request(start, weight = 1, { suspend, priority = false } = {}) {
      const cost = Number.isFinite(weight) && weight > 0 ? Math.min(limit, Math.ceil(weight)) : limit;
      const job = { start, suspend, priority, weight: cost, ready: false, cancelled: false };
      pending.push(job);
      pump();
      const cancel = () => {
        if (job.cancelled) return;
        job.cancelled = true;
        if (!release(job)) pending.splice(pending.indexOf(job), 1);
        pump();
      };
      cancel.setPriority = value => {
        if (job.cancelled || job.priority === value) return;
        job.priority = value;
        if (!value && extra === job) {
          if (used + job.weight <= limit) { extra = undefined; used += job.weight; }
          else defer(job);
        }
        pump();
      };
      cancel.markPlaying = () => { job.ready = true; };
      return cancel;
    },
  };
}
