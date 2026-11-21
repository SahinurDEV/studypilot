const test = require('node:test');
const assert = require('node:assert');
const { buildDailyPlan, weeklyLoad, remainingHours, riskLevel, scoreTask, ymd } = require('../src/planner');
const { pageToTask } = require('../src/notion');

const today = new Date('2026-11-21T09:00:00');
const day = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

test('remaining hours accounts for progress', () => {
  assert.strictEqual(remainingHours({ effortHours: 4, progress: 25 }), 3);
  assert.strictEqual(remainingHours({ effortHours: 2, progress: 100 }), 0);
});

test('overdue tasks rank first, done tasks are skipped', () => {
  const tasks = [
    { id: 'a', title: 'Later', due: day(10), effortHours: 2, priority: 'Medium', status: 'Not started' },
    { id: 'b', title: 'Overdue', due: day(-1), effortHours: 1, priority: 'Low', status: 'In progress' },
    { id: 'c', title: 'Done', due: day(1), effortHours: 3, priority: 'High', status: 'Done' },
  ];
  const plan = buildDailyPlan(tasks, { today, hoursAvailable: 4 });
  assert.strictEqual(plan.ranked[0].id, 'b');
  assert.ok(!plan.ranked.some((t) => t.id === 'c'));
});

test('a big task due soon outranks a small task due soon', () => {
  const big = { due: day(2), effortHours: 8, priority: 'Medium' };
  const small = { due: day(2), effortHours: 1, priority: 'Medium' };
  assert.ok(scoreTask(big, today) > scoreTask(small, today));
});

test('plan never exceeds available hours', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    id: String(i), title: `T${i}`, due: day(1), effortHours: 3, priority: 'High', status: 'Not started',
  }));
  const plan = buildDailyPlan(tasks, { today, hoursAvailable: 5 });
  const total = plan.blocks.reduce((s, b) => s + b.hours, 0);
  assert.ok(total <= 5, `planned ${total}h`);
  assert.strictEqual(plan.hoursPlanned, total);
});

test('risk level flags work that cannot fit before the deadline', () => {
  assert.strictEqual(riskLevel({ due: day(1), effortHours: 10 }, today, 4), 'at-risk');
  assert.strictEqual(riskLevel({ due: day(10), effortHours: 2 }, today, 4), 'ok');
  assert.strictEqual(riskLevel({ due: day(-2), effortHours: 1 }, today, 4), 'overdue');
});

test('weekly load marks overloaded weeks', () => {
  const tasks = [{ due: day(2), effortHours: 40, status: 'Not started' }];
  const weeks = weeklyLoad(tasks, { today, hoursPerDay: 4 });
  assert.strictEqual(weeks[0].overloaded, true);
  assert.strictEqual(weeks[1].overloaded, false);
});

test('pageToTask maps Notion properties', () => {
  const page = {
    id: 'p1',
    url: 'https://notion.so/p1',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Essay' }] },
      Course: { type: 'select', select: { name: 'ENG 105' } },
      Due: { type: 'date', date: { start: '2026-11-25' } },
      Status: { type: 'status', status: { name: 'In progress' } },
      Priority: { type: 'select', select: { name: 'High' } },
      'Effort (h)': { type: 'number', number: 5 },
      'Progress %': { type: 'number', number: 0.4 },
    },
  };
  const t = pageToTask(page);
  assert.deepStrictEqual(
    { title: t.title, course: t.course, due: t.due, status: t.status, priority: t.priority, effortHours: t.effortHours, progress: t.progress },
    { title: 'Essay', course: 'ENG 105', due: '2026-11-25', status: 'In progress', priority: 'High', effortHours: 5, progress: 40 }
  );
});
