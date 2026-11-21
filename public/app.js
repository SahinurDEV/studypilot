const $ = (id) => document.getElementById(id);
const RISK_LABEL = { overdue: 'Overdue', 'at-risk': 'At risk', tight: 'Tight', ok: 'On track' };
const RISK_ORDER = { overdue: 0, 'at-risk': 1, tight: 2, ok: 3 };

const state = {
  data: null,
  filters: { search: '', course: '', risk: '' },
  sort: { key: 'score', asc: false },
  focus: null,
};

// ---------- motion ----------
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const prevNums = {};
const prevBars = {};
let firstRender = true;

// FLIP: capture positions before a re-render, then animate elements from old to new spots.
function capture(container, selector) {
  const rects = new Map();
  container.querySelectorAll(selector).forEach((el) => rects.set(el.dataset.id, el.getBoundingClientRect()));
  return rects;
}
function flip(container, selector, before) {
  let i = 0;
  container.querySelectorAll(selector).forEach((el) => {
    const old = before.get(el.dataset.id);
    if (!old) {
      el.style.setProperty('--i', i++);
      el.classList.add('in');
      return;
    }
    if (reduceMotion) return;
    const now = el.getBoundingClientRect();
    const dy = old.top - now.top;
    if (Math.abs(dy) > 1) {
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
        duration: 550,
        easing: 'cubic-bezier(.16,1,.3,1)',
      });
    }
  });
}
function countUp(el, key, to) {
  const from = prevNums[key] ?? 0;
  prevNums[key] = to;
  const decimals = String(to).includes('.') ? 1 : 0;
  if (from === to || reduceMotion) {
    el.textContent = Number(to).toFixed(decimals);
    return;
  }
  if (!firstRender) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Bars start from their previous width (or 0) and glide to the new one.
function growBars(container) {
  const spans = [...container.querySelectorAll('.bar span[data-w]')];
  spans.forEach((sp) => (sp.style.width = `${prevBars[sp.dataset.key] ?? 0}%`));
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      spans.forEach((sp) => {
        sp.style.width = `${sp.dataset.w}%`;
        prevBars[sp.dataset.key] = Number(sp.dataset.w);
      })
    )
  );
}
function skeletons() {
  $('blocks').innerHTML = '<li class="skeleton"></li>'.repeat(3);
  $('weeks').innerHTML = '<div class="skeleton sm"></div>'.repeat(4);
  $('courses').innerHTML = '<div class="skeleton sm"></div>'.repeat(5);
  $('stats').innerHTML = '<div class="card stat"><div class="skeleton sm"></div><div class="skeleton sm" style="width:50%"></div></div>'.repeat(5);
  $('ranked').innerHTML = '<tr><td colspan="7"><div class="skeleton sm"></div></td></tr>'.repeat(5);
}

// ---------- helpers ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dueText(days) {
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(message, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${message}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => {
      el.remove();
      action.run();
    };
    el.append(b);
  }
  $('toasts').append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, action ? 6000 : 3500);
}
function burst(x, y) {
  const emojis = ['🎉', '✨', '⭐', '🎊', '✅'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    s.textContent = emojis[i % emojis.length];
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    s.style.setProperty('--dy', `${-60 - Math.random() * 160}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
    document.body.append(s);
    setTimeout(() => s.remove(), 1000);
  }
}
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    /* audio not available */
  }
}

// ---------- data ----------
async function load({ flashId } = {}) {
  const hours = $('hours').value;
  $('hoursOut').textContent = `${hours}h`;
  try {
    state.data = await api('GET', `/api/plan?hours=${hours}`);
  } catch (err) {
    $('blocks').innerHTML = `<li>❌ ${esc(err.message)}</li>`;
    return;
  }
  render();
  if (flashId) document.querySelector(`tr[data-id="${CSS.escape(flashId)}"]`)?.classList.add('flash');
}

function findTask(id) {
  return state.data.plan.ranked.find((t) => t.id === id);
}

async function patchTask(id, body, { undo, message, at } = {}) {
  const before = findTask(id);
  const prev = before ? { progress: before.progress || 0, status: before.status } : null;
  try {
    const updated = await api('PATCH', `/api/tasks/${encodeURIComponent(id)}`, body);
    if (updated.status === 'Done' && at) burst(at.x, at.y);
    await load({ flashId: id });
    if (message) {
      toast(message(updated), undo && prev ? { label: 'Undo', run: () => patchTask(id, prev) } : null);
    }
  } catch (err) {
    toast(`❌ ${esc(err.message)}`);
  }
}

// ---------- render ----------
function render() {
  const { plan, weeks, courses, mode, canSync, doneCount } = state.data;

  $('mode').textContent = mode === 'demo' ? 'Demo data' : 'Live from Notion';
  $('resetBtn').hidden = mode !== 'demo';
  $('sync').disabled = !canSync;
  $('sync').title = canSync ? 'Write this plan into Notion as a page' : 'Add your Notion keys to .env to enable';

  // stats (clickable filters)
  const count = (r) => plan.ranked.filter((t) => t.risk === r).length;
  const stats = [
    { label: 'Open tasks', value: plan.ranked.length, risk: '' },
    { label: 'Overdue', value: count('overdue'), risk: 'overdue', cls: count('overdue') ? 'red' : '' },
    { label: 'At risk', value: count('at-risk'), risk: 'at-risk', cls: count('at-risk') ? 'orange' : '' },
    { label: 'Hours left', value: plan.ranked.reduce((s, t) => s + t.remaining, 0).toFixed(1), risk: null },
    { label: 'Completed', value: doneCount, risk: null },
  ];
  $('stats').innerHTML = stats
    .map((s) => `
      <div class="card stat ${s.cls || ''} ${s.risk !== null && s.risk === state.filters.risk && s.risk ? 'active' : ''}"
           ${s.risk !== null ? `data-risk="${s.risk}" role="button" tabindex="0"` : ''}>
        <div class="muted">${s.label}</div><div class="num" data-key="${s.label}">0</div>
      </div>`)
    .join('');
  $('stats').querySelectorAll('.num').forEach((el, i) => countUp(el, el.dataset.key, Number(stats[i].value)));

  // plan blocks
  const pct = plan.hoursAvailable ? (plan.hoursPlanned / plan.hoursAvailable) * 100 : 0;
  $('planMeter').textContent = `${plan.hoursPlanned}h planned of ${plan.hoursAvailable}h`;
  $('planFill').style.width = `${pct}%`;
  const blockRects = capture($('blocks'), 'li[data-id]');
  $('blocks').innerHTML = plan.blocks.length
    ? plan.blocks
        .map((b) => `
        <li class="risk-${b.risk} ${state.focus?.taskId === b.taskId ? 'focusing' : ''}" data-id="${esc(b.taskId)}" data-hours="${b.hours}">
          <div class="block-main">
            <button class="check" data-act="block-done" title="Done for today: log ${b.hours}h">✔</button>
            <div><div>${esc(b.title)}</div><div class="muted">${esc(b.course)} · ${RISK_LABEL[b.risk]}</div></div>
          </div>
          <div class="block-side">
            <span class="hours">${b.hours}h</span>
            <button class="ghost icon-btn" data-act="focus" title="Start a focus timer">▶</button>
          </div>
        </li>`)
        .join('')
    : '<li class="in">🎉 Nothing left to plan. Enjoy your day!</li>';
  flip($('blocks'), 'li[data-id]', blockRects);

  // workload + courses
  const maxWeek = Math.max(...weeks.map((w) => Math.max(w.hours, w.capacity)), 1);
  $('weeks').innerHTML = weeks
    .map((w) => `
      <div class="bar-row" title="${w.count} deadline(s) from ${w.from}">
        <span>${w.overloaded ? '⚠️ ' : ''}${esc(w.label)}</span>
        <div class="bar"><span class="${w.overloaded ? 'over' : ''}" data-key="w-${esc(w.label)}" data-w="${Math.min(100, (w.hours / maxWeek) * 100)}"></span></div>
        <span>${w.hours}h / ${w.capacity}</span>
      </div>`)
    .join('');
  const maxCourse = Math.max(...courses.map((c) => c.hours), 1);
  $('courses').innerHTML = courses
    .map((c) => `
      <div class="bar-row clickable ${state.filters.course === c.course ? 'selected' : ''}" data-course="${esc(c.course)}" role="button" tabindex="0">
        <span>${esc(c.course)}</span>
        <div class="bar"><span data-key="c-${esc(c.course)}" data-w="${(c.hours / maxCourse) * 100}"></span></div>
        <span>${c.hours}h</span>
      </div>`)
    .join('');
  growBars($('weeks'));
  growBars($('courses'));
  $('courseList').innerHTML = courses.map((c) => `<option value="${esc(c.course)}">`).join('');

  renderTable();

  if (firstRender) {
    document.querySelectorAll('main > *').forEach((el, i) => {
      el.style.setProperty('--i', i);
      el.classList.add('enter');
    });
    firstRender = false;
  }
}

function renderTable() {
  const { plan, courses } = state.data;
  const f = state.filters;

  $('chips').innerHTML = courses
    .map((c) => `<button class="chip ${f.course === c.course ? 'active' : ''}" data-course="${esc(c.course)}">${esc(c.course)}</button>`)
    .join('');
  $('riskFilter').value = f.risk;
  $('clearFilters').hidden = !(f.search || f.course || f.risk);

  const q = f.search.toLowerCase();
  let rows = plan.ranked.filter(
    (t) =>
      (!f.course || t.course === f.course) &&
      (!f.risk || t.risk === f.risk) &&
      (!q || `${t.title} ${t.course}`.toLowerCase().includes(q))
  );
  const { key, asc } = state.sort;
  const val = (t) => (key === 'score' ? t.score : key === 'progress' ? t.progress || 0 : t[key]);
  rows = rows.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return asc ? cmp : -cmp;
  });

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === key);
    th.classList.toggle('asc', th.dataset.sort === key && asc);
  });

  $('emptyTable').hidden = rows.length > 0;
  const rowRects = capture($('ranked'), 'tr[data-id]');
  $('ranked').innerHTML = rows
    .map((t) => `
    <tr data-id="${esc(t.id)}">
      <td>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>` : esc(t.title)}</td>
      <td>${esc(t.course)}</td>
      <td>${dueText(t.daysLeft)}</td>
      <td>${t.remaining}h</td>
      <td><div class="prog"><input type="range" min="0" max="100" step="5" value="${Math.round(t.progress || 0)}" data-act="progress" aria-label="Progress of ${esc(t.title)}"><span>${Math.round(t.progress || 0)}%</span></div></td>
      <td><span class="tag ${t.risk}">${RISK_LABEL[t.risk]}</span></td>
      <td>
        <button class="ghost icon-btn" data-act="focus" title="Start a focus timer">▶</button>
        <button class="ghost icon-btn" data-act="done" title="Mark as done">✔</button>
      </td>
    </tr>`)
    .join('');
  flip($('ranked'), 'tr[data-id]', rowRects);
}

// ---------- focus timer ----------
const RING = 326.7;
function startFocus(id, title) {
  if (state.focus) stopFocus(false);
  const minutes = Number(store('sp-focus-min')) || 25;
  state.focus = { taskId: id, title, total: minutes * 60, left: minutes * 60, elapsed: 0, running: true };
  $('focusTitle').textContent = title;
  document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('active', Number(b.dataset.min) === minutes));
  $('focus').hidden = false;
  $('focus').className = 'focus running';
  $('focusToggle').textContent = 'Pause';
  state.focus.timer = setInterval(tick, 1000);
  drawFocus();
  render();
}
function tick() {
  const f = state.focus;
  if (!f || !f.running) return;
  f.left -= 1;
  f.elapsed += 1;
  drawFocus();
  if (f.left <= 0) {
    beep();
    stopFocus(true, true);
  }
}
function drawFocus() {
  const f = state.focus;
  const m = String(Math.floor(f.left / 60)).padStart(2, '0');
  const s = String(f.left % 60).padStart(2, '0');
  $('focusTime').textContent = `${m}:${s}`;
  $('ringFg').style.strokeDashoffset = RING * (1 - f.left / f.total);
  document.title = `${m}:${s} · ${f.title}`;
}
function stopFocus(log, finished = false) {
  const f = state.focus;
  if (!f) return;
  clearInterval(f.timer);
  state.focus = null;
  $('focus').hidden = true;
  document.title = 'StudyPilot';
  const hours = f.elapsed / 3600;
  if (log && f.elapsed >= 30) {
    const mins = Math.round(f.elapsed / 60);
    patchTask(f.taskId, { addHours: hours }, {
      undo: true,
      message: (t) => `${finished ? '⏰ Session complete! ' : ''}Logged ${mins} min on “${esc(t.title)}” (${t.progress}%)`,
    });
  } else {
    if (log) toast('Session too short to log (under 30 seconds).');
    render();
  }
}

// ---------- events ----------
const reload = debounce(() => load(), 150);
$('hours').addEventListener('input', () => {
  $('hoursOut').textContent = `${$('hours').value}h`;
  store('sp-hours', $('hours').value);
  reload();
});

$('stats').addEventListener('click', (e) => {
  const card = e.target.closest('[data-risk]');
  if (!card) return;
  state.filters.risk = state.filters.risk === card.dataset.risk ? '' : card.dataset.risk;
  if (!card.dataset.risk) Object.assign(state.filters, { risk: '', course: '', search: '' });
  $('search').value = state.filters.search;
  render();
  document.querySelector('table').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

function toggleCourse(course) {
  state.filters.course = state.filters.course === course ? '' : course;
  render();
}
$('courses').addEventListener('click', (e) => {
  const row = e.target.closest('[data-course]');
  if (row) toggleCourse(row.dataset.course);
});
$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-course]');
  if (chip) toggleCourse(chip.dataset.course);
});
$('search').addEventListener('input', debounce(() => {
  state.filters.search = $('search').value.trim();
  renderTable();
  $('clearFilters').hidden = !(state.filters.search || state.filters.course || state.filters.risk);
}, 120));
$('riskFilter').addEventListener('change', () => {
  state.filters.risk = $('riskFilter').value;
  render();
});
$('clearFilters').addEventListener('click', () => {
  state.filters = { search: '', course: '', risk: '' };
  $('search').value = '';
  render();
});
document.querySelector('thead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  const key = th.dataset.sort;
  state.sort = { key, asc: state.sort.key === key ? !state.sort.asc : ['title', 'course', 'daysLeft'].includes(key) };
  renderTable();
});

$('blocks').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  const btn = e.target.closest('[data-act]');
  if (!li || !btn) return;
  const task = findTask(li.dataset.id);
  if (btn.dataset.act === 'focus') return startFocus(li.dataset.id, task?.title || '');
  if (btn.dataset.act === 'block-done') {
    const hours = Number(li.dataset.hours);
    btn.classList.add('checked');
    setTimeout(() => li.classList.add('leaving'), 180);
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top);
    patchTask(li.dataset.id, { addHours: hours }, {
      undo: true,
      at: { x: r.left, y: r.top },
      message: (t) => `✅ Logged ${hours}h on “${esc(t.title)}” (${t.progress}%)`,
    });
  }
});

$('ranked').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  const btn = e.target.closest('button[data-act]');
  if (!tr || !btn) return;
  const task = findTask(tr.dataset.id);
  if (btn.dataset.act === 'focus') return startFocus(tr.dataset.id, task?.title || '');
  if (btn.dataset.act === 'done') {
    const r = btn.getBoundingClientRect();
    patchTask(tr.dataset.id, { status: 'Done' }, {
      undo: true,
      at: { x: r.left, y: r.top },
      message: (t) => `🎉 “${esc(t.title)}” is done!`,
    });
  }
});
$('ranked').addEventListener('input', (e) => {
  if (e.target.dataset.act === 'progress') e.target.nextElementSibling.textContent = `${e.target.value}%`;
});
$('ranked').addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'progress') return;
  const id = e.target.closest('tr').dataset.id;
  const r = e.target.getBoundingClientRect();
  patchTask(id, { progress: Number(e.target.value) }, {
    undo: true,
    at: { x: r.left + r.width, y: r.top },
    message: (t) => `Progress on “${esc(t.title)}” set to ${t.progress}%`,
  });
});

// focus controls
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-min]');
  if (!b || !state.focus) return;
  const min = Number(b.dataset.min);
  store('sp-focus-min', String(min));
  state.focus.total = min * 60;
  state.focus.left = Math.max(min * 60 - state.focus.elapsed, 1);
  document.querySelectorAll('#presets button').forEach((x) => x.classList.toggle('active', x === b));
  drawFocus();
});
$('focusToggle').addEventListener('click', () => {
  const f = state.focus;
  if (!f) return;
  f.running = !f.running;
  $('focus').className = `focus ${f.running ? 'running' : 'paused'}`;
  $('focusToggle').textContent = f.running ? 'Pause' : 'Resume';
});
$('focusFinish').addEventListener('click', () => stopFocus(true));
$('focusCancel').addEventListener('click', () => stopFocus(false));

// new task dialog
function openNew() {
  const form = $('newForm');
  form.reset();
  const d = new Date();
  d.setDate(d.getDate() + 3);
  form.due.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (state.filters.course) form.course.value = state.filters.course;
  $('newDialog').showModal();
  form.title.focus();
}
$('newBtn').addEventListener('click', openNew);
$('newCancel').addEventListener('click', () => $('newDialog').close());
$('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    const created = await api('POST', '/api/tasks', body);
    $('newDialog').close();
    await load({ flashId: created.id });
    const t = findTask(created.id);
    toast(`➕ Added “${esc(created.title)}”${t ? ` · ${RISK_LABEL[t.risk]}` : ''}`);
  } catch (err) {
    toast(`❌ ${esc(err.message)}`);
  }
});

$('resetBtn').addEventListener('click', async () => {
  await api('POST', '/api/reset');
  state.filters = { search: '', course: '', risk: '' };
  $('search').value = '';
  await load();
  toast('Demo data restored.');
});

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('syncMsg').textContent = 'Writing to Notion…';
  try {
    const data = await api('POST', `/api/sync?hours=${$('hours').value}`);
    $('syncMsg').innerHTML = `✅ <a href="${esc(data.url)}" target="_blank" rel="noopener">Open in Notion</a>`;
  } catch (err) {
    $('syncMsg').textContent = `❌ ${err.message}`;
  }
  $('sync').disabled = false;
});

// keyboard: N = new task, / = search, Esc = clear filters
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || $('newDialog').open) return;
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openNew();
  } else if (e.key === '/') {
    e.preventDefault();
    $('search').focus();
  } else if (e.key === 'Escape') {
    $('clearFilters').click();
  }
});

// ripple on every button
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || reduceMotion) return;
  const r = b.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  b.append(dot);
  setTimeout(() => dot.remove(), 600);
});
// header shadow once the page scrolls
addEventListener('scroll', () => document.querySelector('header').classList.toggle('scrolled', scrollY > 4), { passive: true });

skeletons();
const savedHours = store('sp-hours');
if (savedHours) $('hours').value = savedHours;
load();
