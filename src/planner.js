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

module.exports = {
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
