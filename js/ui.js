// DOM UI: top bar, desk chips, activity feed, agent detail panel, theme menu, toast.
import { KINDS, STATUS_LABEL, fmtTime, fmtAgo, counts, isStale, sortedFeed, effectiveStatus, ts, resolveDesks } from './data.js';
import { THEMES } from './themes.js';

const $ = sel => document.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

function chip(status) {
  return h('span', { class: `chip st-${status}` }, h('i'), STATUS_LABEL[status] || status);
}

export class UI {
  constructor({ onAgent, onDesk, onTheme, onClose, onHome }) {
    this.cb = { onAgent, onDesk, onTheme, onClose, onHome };
    this.mobile = window.matchMedia('(max-width: 760px)');
    this.feedPanel = $('#feedPanel');
    this.detail = $('#detail');
    this.currentId = null;
    this.deskKey = '';

    $('#feedToggle').addEventListener('click', () => this.toggleFeed());
    $('#detailClose').addEventListener('click', () => this.cb.onClose());
    $('#homeBtn').addEventListener('click', () => this.cb.onHome());
    const themeBtn = $('#themeBtn');
    const menu = $('#themeMenu');
    themeBtn.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      themeBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
    for (const [id, t] of Object.entries(THEMES)) {
      menu.append(h('button', { type: 'button', role: 'menuitemradio', 'data-theme': id, onclick: () => { menu.hidden = true; this.cb.onTheme(id); } },
        h('span', { class: 'swatch', style: `background:${t.sky}` }), t.name));
    }
    if (!this.mobile.matches) this.toggleFeed(false);
    // Panels sit below the top bar, whose height changes as it wraps.
    const bar = $('.topbar');
    new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', `${bar.offsetHeight}px`)).observe(bar);
  }

  setTheme(id) {
    for (const b of document.querySelectorAll('#themeMenu button')) b.setAttribute('aria-checked', String(b.dataset.theme === id));
    $('#themeName').textContent = THEMES[id].name;
  }

  toggleFeed(force) {
    const collapsed = force ?? !this.feedPanel.classList.contains('collapsed');
    this.feedPanel.classList.toggle('collapsed', collapsed);
    $('#feedToggle').setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed && this.mobile.matches) this.cb.onClose();
  }

  toast(msg, kind = 'error') {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  render(data, now = Date.now()) {
    this.data = data;
    this.renderTop(data, now);
    this.renderDesks(data);
    this.renderFeed(data, now);
    if (this.currentId) {
      const a = data.agents.find(x => x.id === this.currentId);
      if (a) this.openDetail(a.id, now, true); else this.cb.onClose();
    }
  }

  renderTop(data, now) {
    const c = counts(data, now);
    const box = $('#counts');
    box.replaceChildren(
      h('span', { class: 'count st-working', title: 'Working' }, h('i'), h('b', {}, c.working), ' working'),
      h('span', { class: 'count st-idle', title: 'Idle (incl. scheduled & never run)' }, h('i'), h('b', {}, c.idle + c.scheduled + c.never), ' idle'),
      h('span', { class: 'count st-error', title: 'Error' }, h('i'), h('b', {}, c.error), ' error'),
    );
    $('#updated').textContent = `Last updated ${fmtTime(data.generated_at, now)}`;
    const stale = $('#stale');
    const isOld = isStale(data, now);
    stale.hidden = !isOld;
    if (isOld) {
      const age = now - ts(data.generated_at);
      stale.textContent = Number.isNaN(age) ? 'Stale' : `Stale · ${fmtAgo(age)} old`;
    }
  }

  renderDesks(data) {
    const desks = resolveDesks(data);
    const key = desks.map(d => d.id + d.name + d.color).join('|');
    if (key === this.deskKey) return;
    this.deskKey = key;
    $('#desks').replaceChildren(...desks.map(d => {
      const n = data.agents.filter(a => (a.desk || 'misc') === d.id).length;
      return h('button', { type: 'button', class: 'desk-chip', style: `--c:${d.color}`, onclick: () => this.cb.onDesk(d.id) },
        h('i'), d.name, h('small', {}, n));
    }));
  }

  feedItem(f, now, showAgent = true) {
    const k = KINDS[f.kind] ? f.kind : 'info';
    const agent = this.data.agents.find(a => a.id === f.agent);
    return h('li', { class: `feed-item k-${k}` },
      h('button', { type: 'button', onclick: () => agent && this.cb.onAgent(agent.id), disabled: !agent },
        h('span', { class: 'kicon', title: KINDS[k].label, 'aria-label': KINDS[k].label }, KINDS[k].icon),
        h('span', { class: 'fbody' },
          h('span', { class: 'ftext' }, f.text),
          h('span', { class: 'fmeta' }, fmtTime(f.time, now), showAgent && agent ? ` · ${agent.name}` : '', h('em', {}, KINDS[k].label)))));
  }

  renderFeed(data, now) {
    const feed = sortedFeed(data);
    $('#feedCount').textContent = feed.length ? `${feed.length}` : '';
    const list = $('#feed');
    if (!feed.length) {
      list.replaceChildren(h('li', { class: 'empty' }, 'No activity yet.'));
      return;
    }
    list.replaceChildren(...feed.slice(0, 120).map(f => this.feedItem(f, now)));
  }

  openDetail(id, now = Date.now(), refresh = false) {
    const data = this.data;
    const a = data?.agents.find(x => x.id === id);
    if (!a) return;
    const desk = resolveDesks(data).find(d => d.id === (a.desk || 'misc'));
    const status = effectiveStatus(a, now);
    this.currentId = id;
    const body = $('#detailBody');
    const scroll = refresh ? body.scrollTop : 0;

    const routines = (a.routines || []).map(r => {
      const res = (r.last_result || '').toLowerCase();
      const cls = res.startsWith('ok') ? 'ok' : res.includes('error') || res.includes('fail') ? 'bad' : res.includes('pending') ? 'pend' : 'none';
      return h('li', { class: 'routine' },
        h('div', { class: 'rhead' }, h('strong', {}, r.name), h('span', { class: `res res-${cls}` }, r.last_result || '—')),
        h('div', { class: 'rmeta' }, h('span', {}, '⟳ ', r.schedule || '—')),
        h('div', { class: 'rmeta' }, h('span', {}, 'Last ', fmtTime(r.last_run, now)), h('span', {}, 'Next ', fmtTime(r.next_run, now))));
    });
    const log = sortedFeed(data).filter(f => f.agent === id).slice(0, 40).map(f => this.feedItem(f, now, false));

    body.replaceChildren(
      h('div', { class: 'd-head' },
        h('span', { class: 'd-desk', style: `--c:${desk?.color || '#888'}` }, desk?.name || a.desk || ''),
        h('h2', { id: 'detailTitle' }, a.name),
        chip(status)),
      h('p', { class: 'd-role' }, a.role || 'No role description.'),
      h('dl', { class: 'd-grid' },
        h('div', { class: 'wide' }, h('dt', {}, 'Last action'), h('dd', {}, a.last_action || '—')),
        h('div', {}, h('dt', {}, 'Last run'), h('dd', {}, fmtTime(a.last_run, now))),
        h('div', {}, h('dt', {}, 'Next run'), h('dd', {}, fmtTime(a.next_run, now)))),
      h('h3', {}, 'Routines ', h('small', {}, routines.length || '')),
      routines.length ? h('ul', { class: 'routines' }, routines) : h('p', { class: 'empty' }, 'No routines of its own.'),
      h('h3', {}, 'Recent actions ', h('small', {}, log.length || '')),
      log.length ? h('ol', { class: 'feed-list' }, log) : h('p', { class: 'empty' }, 'No recorded actions yet.'),
    );
    body.scrollTop = scroll;
    if (!refresh) {
      this.detail.hidden = false;
      requestAnimationFrame(() => this.detail.classList.add('open'));
      if (this.mobile.matches) this.toggleFeed(true);
      $('#detailClose').focus({ preventScroll: true });
    }
  }

  closeDetail() {
    if (!this.currentId) return;
    this.currentId = null;
    this.detail.classList.remove('open');
    setTimeout(() => { if (!this.currentId) this.detail.hidden = true; }, 260);
  }
}
