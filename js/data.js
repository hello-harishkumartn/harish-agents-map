// Data loading, time formatting (IST) and status helpers.

export const STATUS_URL = './status.json';
export const POLL_MS = 60_000;
export const STALE_MS = 90 * 60_000;
export const SOON_MS = 30 * 60_000;
export const RECENT_FEED_MS = 2 * 60 * 60_000;

export const KINDS = {
  trade:    { icon: '⇅', label: 'Trade' },
  notice:   { icon: '✉', label: 'Notice' },
  report:   { icon: '▤', label: 'Report' },
  journal:  { icon: '✎', label: 'Journal' },
  reminder: { icon: '⏰', label: 'Reminder' },
  events:   { icon: '★', label: 'Events' },
  info:     { icon: 'ℹ', label: 'Info' },
  error:    { icon: '⚠', label: 'Error' },
};

export const STATUS_LABEL = {
  working: 'Working', idle: 'Idle', error: 'Error', scheduled: 'Scheduled', never: 'Never run',
};

export async function loadStatus() {
  const res = await fetch(`${STATUS_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.agents)) throw new Error('status.json has no agents');
  data.desks = Array.isArray(data.desks) ? data.desks : [];
  data.feed = Array.isArray(data.feed) ? data.feed : [];
  return data;
}

export function ts(iso) {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

const IST = 'Asia/Kolkata';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true });
const wd = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' });

/** "2:42 PM IST" for today (IST), otherwise "Thu 9 Oct, 2:30 PM IST". */
export function fmtTime(iso, now = Date.now()) {
  const t = ts(iso);
  if (Number.isNaN(t)) return '—';
  const time = hm.format(t);
  if (dayKey.format(t) === dayKey.format(now)) return `${time} IST`;
  return `${wd.format(t).replace(',', '')}, ${time} IST`;
}

export function fmtAgo(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/** Status shown in the UI: idle agents with a run due within 30 min become "scheduled". */
export function effectiveStatus(agent, now = Date.now()) {
  const s = agent.status || 'idle';
  if (s === 'idle' || s === 'scheduled') {
    const next = ts(agent.next_run);
    if (!Number.isNaN(next) && next - now <= SOON_MS && next - now >= -5 * 60_000) return 'scheduled';
    return 'idle';
  }
  return STATUS_LABEL[s] ? s : 'idle';
}

export function counts(data, now) {
  const c = { working: 0, idle: 0, error: 0, scheduled: 0, never: 0 };
  for (const a of data.agents) c[effectiveStatus(a, now)]++;
  return c;
}

export function isStale(data, now = Date.now()) {
  const g = ts(data.generated_at);
  return Number.isNaN(g) || now - g > STALE_MS;
}

export function sortedFeed(data) {
  return [...data.feed].sort((a, b) => (ts(b.time) || 0) - (ts(a.time) || 0));
}

/** Agent ids with a feed item within RECENT_FEED_MS of the snapshot time. */
export function recentAgents(data) {
  const ref = ts(data.generated_at) || Date.now();
  const set = new Set();
  for (const f of data.feed) {
    const t = ts(f.time);
    if (!Number.isNaN(t) && ref - t <= RECENT_FEED_MS) set.add(f.agent);
  }
  return set;
}

/** Desks in file order, plus any desk referenced by an agent but not declared. */
export function resolveDesks(data) {
  const desks = data.desks.map(d => ({ ...d }));
  const known = new Set(desks.map(d => d.id));
  const extra = ['#a3a3ff', '#ffd166', '#06d6a0', '#ef476f'];
  for (const a of data.agents) {
    const id = a.desk || 'misc';
    if (!known.has(id)) {
      known.add(id);
      desks.push({ id, name: id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: extra[desks.length % extra.length] });
    }
  }
  return desks;
}

export function layoutKey(data) {
  return data.agents.map(a => `${a.id}@${a.desk || 'misc'}`).join('|');
}
