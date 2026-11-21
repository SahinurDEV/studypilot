const $ = (id) => document.getElementById(id);
const RISK_LABEL = { overdue: 'Overdue', 'at-risk': 'At risk', tight: 'Tight', ok: 'On track' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dueText(days) {
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

function bars(rows, max, labelKey, overKey) {
  return rows.map((r) => `
    <div class="bar-row">
      <span>${esc(r[labelKey])}</span>
      <div class="bar"><span class="${overKey && r[overKey] ? 'over' : ''}" style="width:${Math.min(100, (r.hours / max) * 100)}%"></span></div>
      <span>${r.hours}h${r.capacity ? ` / ${r.capacity}` : ''}</span>
    </div>`).join('');
}

async function load() {
  const hours = $('hours').value;
  $('hoursOut').textContent = `${hours}h`;
  const res = await fetch(`/api/plan?hours=${hours}`);
  const data = await res.json();
  if (!res.ok) {
    $('blocks').innerHTML = `<li>❌ ${esc(data.error)}</li>`;
    return;
  }
  const { plan, weeks, courses, mode, canSync } = data;

  $('mode').textContent = mode === 'demo' ? 'Demo data' : 'Live from Notion';
  $('sync').disabled = !canSync;
  if (!canSync) $('sync').title = 'Add your Notion keys to .env to enable';

  const count = (r) => plan.ranked.filter((t) => t.risk === r).length;
  const stats = [
    ['Open tasks', plan.ranked.length],
    ['Overdue', count('overdue')],
    ['At risk', count('at-risk')],
    ['Hours left', plan.ranked.reduce((s, t) => s + t.remaining, 0).toFixed(1)],
  ];
  $('stats').innerHTML = stats.map(([l, n]) => `<div class="card stat"><div class="muted">${l}</div><div class="num">${n}</div></div>`).join('');

  $('blocks').innerHTML = plan.blocks.length
    ? plan.blocks.map((b) => `
        <li class="risk-${b.risk}">
          <div><div>${esc(b.title)}</div><div class="muted">${esc(b.course)} · ${RISK_LABEL[b.risk]}</div></div>
          <span class="hours">${b.hours}h</span>
        </li>`).join('')
    : '<li>🎉 Nothing to do. Enjoy your day!</li>';

  const maxWeek = Math.max(...weeks.map((w) => Math.max(w.hours, w.capacity)), 1);
  $('weeks').innerHTML = bars(weeks, maxWeek, 'label', 'overloaded');
  const maxCourse = Math.max(...courses.map((c) => c.hours), 1);
  $('courses').innerHTML = bars(courses, maxCourse, 'course');

  $('ranked').innerHTML = plan.ranked.map((t) => `
    <tr>
      <td>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>` : esc(t.title)}</td>
      <td>${esc(t.course)}</td>
      <td>${dueText(t.daysLeft)}</td>
      <td>${t.remaining}h</td>
      <td><span class="tag ${t.risk}">${RISK_LABEL[t.risk]}</span></td>
    </tr>`).join('');
}

$('hours').addEventListener('input', load);
$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('syncMsg').textContent = 'Writing to Notion…';
  const res = await fetch(`/api/sync?hours=${$('hours').value}`, { method: 'POST' });
  const data = await res.json();
  $('syncMsg').innerHTML = res.ok ? `✅ <a href="${esc(data.url)}" target="_blank" rel="noopener">Open in Notion</a>` : `❌ ${esc(data.error)}`;
  $('sync').disabled = false;
});

load();
