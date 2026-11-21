// Web dashboard: serves public/ and a JSON API. No dependencies.
//   GET   /api/plan?hours=4    plan, risk, workload
//   POST  /api/tasks           add a task            { title, course, due, effortHours, priority, type }
//   PATCH /api/tasks/:id       log work / set state  { addHours } | { progress } | { status }
//   POST  /api/sync?hours=4    write today's plan into Notion
//   GET   /api/calendar.ics    7-day study schedule + deadlines for any calendar app
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { NotionClient, pageToTask } = require('./notion');
const { buildDailyPlan, weeklyLoad, courseBreakdown, buildWeekSchedule, buildInsights, sessionStats, toICS, ymd } = require('./planner');
const { sampleTasks, sampleSessions } = require('./sample');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// In demo mode tasks live in memory so every interaction works without Notion.
let demoTasks = sampleTasks();
let nextId = 100;

// Study sessions (focus timer + logged hours). Demo starts with a few past sessions;
// with Notion connected they are kept in data/sessions.json.
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
let sessions = loadSessions();
function loadSessions() {
  if (config.demo) return sampleSessions();
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function logSession(task, hours) {
  if (!(hours > 0)) return;
  sessions.push({ date: ymd(new Date()), taskId: task.id, title: task.title, course: task.course, minutes: Math.round(hours * 60) });
  if (config.demo) return;
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
const notion = () => new NotionClient(config.token);

async function getTasks() {
  if (config.demo) return demoTasks;
  return notion().getTasks(config.databaseId);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

async function addTask(body) {
  const title = String(body.title || '').trim();
  if (!title) throw Object.assign(new Error('Title is required'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due || '')) throw Object.assign(new Error('Due date is required'), { status: 400 });
  const task = {
    title: title.slice(0, 200),
    course: String(body.course || '').trim().slice(0, 60),
    type: body.type || 'Assignment',
    due: body.due,
    status: 'Not started',
    priority: ['High', 'Medium', 'Low'].includes(body.priority) ? body.priority : 'Medium',
    effortHours: clamp(Number(body.effortHours) || 1, 0.5, 200),
    progress: 0,
  };
  if (config.demo) {
    const created = { id: `n${nextId++}`, ...task };
    demoTasks.push(created);
    return created;
  }
  return pageToTask(await notion().addTask(config.databaseId, task));
}

async function updateTask(id, body) {
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  let progress = task.progress || 0;
  let status = task.status;
  if (body.addHours != null) {
    progress += (Number(body.addHours) / (Number(task.effortHours) || 1)) * 100;
    logSession(task, Number(body.addHours));
  }
  if (body.progress != null) progress = Number(body.progress);
  progress = clamp(Math.round(progress), 0, 100);
  if (body.status) status = body.status;
  else status = progress >= 100 ? 'Done' : progress > 0 ? 'In progress' : 'Not started';
  if (status === 'Done') progress = 100;

  if (config.demo) Object.assign(task, { progress, status });
  else await notion().updateTask(id, { progress, status });
  return { ...task, progress, status };
}

async function handleApi(req, res, url) {
  const hoursAvailable = Number(url.searchParams.get('hours')) || config.hoursPerDay;

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    return sendJson(res, 201, await addTask(await readBody(req)));
  }

  const match = url.pathname.match(/^\/api\/tasks\/([\w-]+)$/);
  if (match && req.method === 'PATCH') {
    return sendJson(res, 200, await updateTask(match[1], await readBody(req)));
  }

  if (url.pathname === '/api/reset' && req.method === 'POST' && config.demo) {
    demoTasks = sampleTasks();
    sessions = sampleSessions();
    return sendJson(res, 200, { ok: true });
  }

  const tasks = await getTasks();
  const plan = buildDailyPlan(tasks, { hoursAvailable, hoursPerDay: config.hoursPerDay });
  const weeks = weeklyLoad(tasks, { hoursPerDay: config.hoursPerDay });
  const week = buildWeekSchedule(tasks, { hoursPerDay: config.hoursPerDay, hoursToday: hoursAvailable });

  if (url.pathname === '/api/calendar.ics' && req.method === 'GET') {
    const startHour = Math.min(Math.max(Number(url.searchParams.get('start')) || 18, 0), 22);
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="studypilot-${ymd(new Date())}.ics"`,
    });
    return res.end(toICS(week, { startHour }));
  }

  if (url.pathname === '/api/plan' && req.method === 'GET') {
    return sendJson(res, 200, {
      mode: config.demo ? 'demo' : 'notion',
      canSync: !config.demo && Boolean(config.parentPageId),
      hoursPerDay: config.hoursPerDay,
      plan,
      weeks,
      courses: courseBreakdown(tasks),
      doneCount: tasks.filter((t) => t.status === 'Done').length,
      week,
      insights: buildInsights({ plan, weeks, week, hoursPerDay: config.hoursPerDay }),
      stats: sessionStats(sessions),
    });
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    if (config.demo || !config.parentPageId) {
      return sendJson(res, 400, { error: 'Connect Notion first: set NOTION_TOKEN, NOTION_DATABASE_ID and NOTION_PARENT_PAGE_ID.' });
    }
    const page = await notion().writeDailyPlan(config.parentPageId, plan, weeks);
    return sendJson(res, 200, { url: page.url });
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`🧭 StudyPilot running at http://localhost:${config.port} (${config.demo ? 'demo data' : 'live Notion data'})`);
  });
}

module.exports = server;
