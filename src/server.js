// Small web dashboard: serves public/ and a JSON API. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { NotionClient } = require('./notion');
const { buildDailyPlan, weeklyLoad, courseBreakdown } = require('./planner');
const { sampleTasks } = require('./sample');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

async function getTasks() {
  if (config.demo) return sampleTasks();
  return new NotionClient(config.token).getTasks(config.databaseId);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleApi(req, res, url) {
  const hoursAvailable = Number(url.searchParams.get('hours')) || config.hoursPerDay;
  const tasks = await getTasks();
  const plan = buildDailyPlan(tasks, { hoursAvailable, hoursPerDay: config.hoursPerDay });
  const weeks = weeklyLoad(tasks, { hoursPerDay: config.hoursPerDay });

  if (url.pathname === '/api/plan' && req.method === 'GET') {
    return sendJson(res, 200, {
      mode: config.demo ? 'demo' : 'notion',
      canSync: !config.demo && Boolean(config.parentPageId),
      plan,
      weeks,
      courses: courseBreakdown(tasks),
    });
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    if (config.demo || !config.parentPageId) {
      return sendJson(res, 400, { error: 'Connect Notion first: set NOTION_TOKEN, NOTION_DATABASE_ID and NOTION_PARENT_PAGE_ID.' });
    }
    const page = await new NotionClient(config.token).writeDailyPlan(config.parentPageId, plan, weeks);
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
    sendJson(res, 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`🧭 StudyPilot running at http://localhost:${config.port} (${config.demo ? 'demo data' : 'live Notion data'})`);
  });
}

module.exports = server;
