// Core planning logic for StudyPilot. Pure functions, no I/O, so it is easy to test.

const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_WEIGHT = { High: 1.5, Medium: 1.0, Low: 0.7 };
const DONE_STATUSES = new Set(['Done', 'Submitted', 'Complete', 'Completed']);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Local YYYY-MM-DD (toISOString would shift the day in non-UTC timezones).
function ymd(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Notion dates like "2026-11-25" are parsed as local midnight, not UTC.
function parseDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function daysUntil(due, today) {
  due = parseDate(due);
  return Math.round((startOfDay(due) - startOfDay(today)) / DAY_MS);
}

function isOpen(task) {
  return !DONE_STATUSES.has(task.status);
}

// Hours of work still left on a task.
function remainingHours(task) {
  const effort = Number(task.effortHours) || 1;
  const progress = Math.min(Math.max(Number(task.progress) || 0, 0), 100);
  return Math.max(effort * (1 - progress / 100), 0);
}

// Higher score = do it sooner. Combines urgency, remaining work and priority.
function scoreTask(task, today) {
  const days = daysUntil(task.due, today);
  const hours = remainingHours(task);
  const weight = PRIORITY_WEIGHT[task.priority] ?? 1.0;
  if (days < 0) return 1000 * weight + hours; // overdue always floats to the top
  // Hours needed per remaining day: a big task due soon is the most pressing.
  const pressure = hours / Math.max(days, 0.5);
  const urgency = 10 / (days + 1);
  return Number(((pressure * 4 + urgency) * weight).toFixed(2));
}

function riskLevel(task, today, hoursPerDay) {
  const days = daysUntil(task.due, today);
  const hours = remainingHours(task);
  if (days < 0) return 'overdue';
  const capacity = Math.max(days, 0.5) * hoursPerDay;
  if (hours > capacity) return 'at-risk';
  if (hours > capacity * 0.6) return 'tight';
  return 'ok';
}

// Build today's plan: fill the available hours with the highest-scoring work.
function buildDailyPlan(tasks, { today = new Date(), hoursAvailable = 4, hoursPerDay = 4 } = {}) {
  const ranked = tasks
    .filter(isOpen)
    .map((t) => ({
      ...t,
      daysLeft: daysUntil(t.due, today),
      remaining: Number(remainingHours(t).toFixed(1)),
      score: scoreTask(t, today),
      risk: riskLevel(t, today, hoursPerDay),
    }))
    .sort((a, b) => b.score - a.score);

  const blocks = [];
  let left = hoursAvailable;
  for (const task of ranked) {
    if (left <= 0) break;
    if (task.remaining <= 0) continue;
    // Spread the work evenly over the days left, but never less than 30 minutes.
    const fairShare = task.daysLeft <= 0 ? task.remaining : task.remaining / task.daysLeft;
    const hours = Math.min(left, task.remaining, Math.max(roundHalf(fairShare), 0.5));
    blocks.push({ taskId: task.id, title: task.title, course: task.course, hours, risk: task.risk });
    left = Number((left - hours).toFixed(2));
  }

  return {
    date: ymd(today),
    hoursAvailable,
    hoursPlanned: Number((hoursAvailable - left).toFixed(2)),
    blocks,
    ranked,
  };
}

function roundHalf(n) {
  return Math.ceil(n * 2) / 2;
}

// Hours due per ISO week, to spot overloaded weeks ahead of time.
function weeklyLoad(tasks, { today = new Date(), weeks = 4, hoursPerDay = 4 } = {}) {
  const start = startOfDay(today);
  const capacity = hoursPerDay * 7;
  const result = [];
  for (let i = 0; i < weeks; i++) {
    const from = new Date(start.getTime() + i * 7 * DAY_MS);
    const to = new Date(from.getTime() + 7 * DAY_MS);
    const due = tasks.filter((t) => isOpen(t) && parseDate(t.due) >= from && parseDate(t.due) < to);
    const hours = Number(due.reduce((sum, t) => sum + remainingHours(t), 0).toFixed(1));
    result.push({
      label: i === 0 ? 'This week' : i === 1 ? 'Next week' : `In ${i} weeks`,
      from: ymd(from),
      hours,
      capacity,
      count: due.length,
      overloaded: hours > capacity,
    });
  }
  return result;
}

function courseBreakdown(tasks) {
  const byCourse = {};
  for (const t of tasks.filter(isOpen)) {
    const key = t.course || 'Other';
    byCourse[key] = (byCourse[key] || 0) + remainingHours(t);
  }
  return Object.entries(byCourse)
    .map(([course, hours]) => ({ course, hours: Number(hours.toFixed(1)) }))
    .sort((a, b) => b.hours - a.hours);
}

// Simulate the next N days: each day takes the top work that fits, then that work
// counts as done for later days. Shows where every hour goes and what won't make it.
function buildWeekSchedule(tasks, { today = new Date(), days = 7, hoursPerDay = 4, hoursToday = hoursPerDay } = {}) {
  let sim = tasks.filter(isOpen).map((t) => ({ ...t }));
  const schedule = [];
  const finishedOn = {};
  for (let i = 0; i < days; i++) {
    const day = new Date(startOfDay(today).getTime() + i * DAY_MS);
    const plan = buildDailyPlan(sim, { today: day, hoursAvailable: i === 0 ? hoursToday : hoursPerDay, hoursPerDay });
    const dateStr = ymd(day);
    for (const b of plan.blocks) {
      const t = sim.find((x) => x.id === b.taskId);
      const effort = Number(t.effortHours) || 1;
      t.progress = Math.min(100, (Number(t.progress) || 0) + (b.hours / effort) * 100);
      if (remainingHours(t) <= 0.01) finishedOn[t.id] = dateStr;
    }
    sim = sim.filter((t) => remainingHours(t) > 0.01);
    schedule.push({
      date: dateStr,
      weekday: day.toLocaleDateString('en-US', { weekday: 'short' }),
      hours: plan.hoursPlanned,
      capacity: plan.hoursAvailable,
      blocks: plan.blocks,
      deadlines: tasks.filter((t) => isOpen(t) && ymd(parseDate(t.due)) === dateStr).map((t) => ({ id: t.id, title: t.title, course: t.course })),
    });
  }
  // Tasks due inside the window that the schedule could not finish before their deadline.
  const lastDay = schedule[schedule.length - 1].date;
  const late = tasks
    .filter(isOpen)
    .filter((t) => ymd(parseDate(t.due)) <= lastDay && daysUntil(t.due, today) >= 0) // overdue is reported separately
    .filter((t) => !finishedOn[t.id] || finishedOn[t.id] > ymd(parseDate(t.due)))
    .map((t) => ({ id: t.id, title: t.title, due: ymd(parseDate(t.due)) }));
  return { days: schedule, late };
}

// Plain-language coaching tips built from the plan, schedule and workload.
function buildInsights({ plan, weeks, week, hoursPerDay }) {
  const tips = [];
  const overdue = plan.ranked.filter((t) => t.risk === 'overdue');
  if (overdue.length) {
    const hours = overdue.reduce((s, t) => s + t.remaining, 0);
    tips.push({ level: 'danger', icon: '🔴', text: `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue (${hours.toFixed(1)}h). Clear ${overdue.length > 1 ? 'them' : `“${overdue[0].title}”`} first.` });
  }
  for (const t of week.late.slice(0, 2)) {
    tips.push({ level: 'danger', icon: '⏰', text: `At ${hoursPerDay}h/day you won't finish “${t.title}” before ${t.due}. Add study hours or lower its scope.` });
  }
  const heavy = plan.ranked
    .filter((t) => t.daysLeft > 0 && t.risk !== 'overdue')
    .map((t) => ({ ...t, perDay: t.remaining / t.daysLeft }))
    .sort((a, b) => b.perDay - a.perDay)[0];
  if (heavy && heavy.perDay >= 1) {
    tips.push({ level: 'warn', icon: '🎯', text: `Start “${heavy.title}” today: it needs ~${heavy.perDay.toFixed(1)}h/day until it's due ${heavy.daysLeft === 1 ? 'tomorrow' : `in ${heavy.daysLeft} days`}.` });
  }
  const over = weeks.find((w) => w.overloaded);
  if (over) {
    tips.push({ level: 'warn', icon: '📈', text: `${over.label} is overloaded: ${over.hours}h of work vs ${over.capacity}h capacity. Pull ${(over.hours - over.capacity).toFixed(1)}h earlier.` });
  }
  const light = week.days.slice(1).find((d) => d.hours < d.capacity * 0.5);
  if (light) {
    tips.push({ level: 'good', icon: '🌿', text: `${light.weekday} ${light.date.slice(5)} is light (${light.hours}h planned). A good day to get ahead or rest.` });
  }
  if (!tips.length) tips.push({ level: 'good', icon: '✅', text: 'Everything is on track. Keep your daily rhythm!' });
  return tips.slice(0, 5);
}

// Study session stats: minutes per day for the last 7 days, streak, top course.
function sessionStats(sessions, { today = new Date() } = {}) {
  const byDay = {};
  const byCourse = {};
  for (const s of sessions) {
    byDay[s.date] = (byDay[s.date] || 0) + s.minutes;
    byCourse[s.course || 'Other'] = (byCourse[s.course || 'Other'] || 0) + s.minutes;
  }
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfDay(today).getTime() - i * DAY_MS);
    const key = ymd(d);
    last7.push({ date: key, weekday: d.toLocaleDateString('en-US', { weekday: 'short' }), minutes: Math.round(byDay[key] || 0) });
  }
  // Streak counts back from today (or yesterday if nothing logged yet today).
  let streak = 0;
  let cursor = startOfDay(today);
  if (!byDay[ymd(cursor)]) cursor = new Date(cursor.getTime() - DAY_MS);
  while (byDay[ymd(cursor)]) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  const top = Object.entries(byCourse).sort((a, b) => b[1] - a[1])[0];
  return {
    last7,
    streak,
    weekMinutes: last7.reduce((s, d) => s + d.minutes, 0),
    todayMinutes: last7[6].minutes,
    topCourse: top ? { course: top[0], minutes: Math.round(top[1]) } : null,
  };
}

// iCalendar export: study blocks as timed events from startHour, deadlines as all-day events.
function toICS(week, { startHour = 18 } = {}) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escText = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyPilot//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:StudyPilot'];
  week.days.forEach((day) => {
    const d = day.date.replace(/-/g, '');
    let minute = startHour * 60;
    day.blocks.forEach((b, i) => {
      const end = minute + Math.round(b.hours * 60);
      const fmt = (m) => `${d}T${pad(Math.floor(m / 60) % 24)}${pad(m % 60)}00`;
      lines.push('BEGIN:VEVENT', `UID:sp-${d}-${i}-${b.taskId}@studypilot`, `DTSTAMP:${stamp}`,
        `DTSTART:${fmt(minute)}`, `DTEND:${fmt(Math.min(end, 24 * 60 - 1))}`,
        `SUMMARY:${escText(`📚 ${b.title}`)}`, `DESCRIPTION:${escText(`${b.course || ''} · ${b.hours}h study block (StudyPilot)`)}`, 'END:VEVENT');
      minute = end + 10; // 10 min break between blocks
    });
    day.deadlines.forEach((t) => {
      const next = new Date(`${day.date}T00:00:00`);
      next.setDate(next.getDate() + 1);
      lines.push('BEGIN:VEVENT', `UID:sp-due-${t.id}@studypilot`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${ymd(next).replace(/-/g, '')}`,
        `SUMMARY:${escText(`⏰ Due: ${t.title}`)}`, 'END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

module.exports = {
  buildWeekSchedule,
  buildInsights,
  sessionStats,
  toICS,
  buildDailyPlan,
  weeklyLoad,
  courseBreakdown,
  scoreTask,
  riskLevel,
  remainingHours,
  daysUntil,
  isOpen,
  ymd,
};
