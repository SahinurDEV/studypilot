// Minimal Notion API client (no dependencies, uses built-in fetch).
// Docs: https://developers.notion.com/reference

const NOTION_VERSION = '2022-06-28';
const BASE = 'https://api.notion.com/v1';

class NotionClient {
  constructor(token) {
    if (!token) throw new Error('NOTION_TOKEN is missing. Copy .env.example to .env and add your integration token.');
    this.token = token;
  }

  async request(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${json.message || res.statusText}`);
    return json;
  }

  // Read every row of the assignments database (handles pagination).
  async queryAll(databaseId) {
    const rows = [];
    let cursor;
    do {
      const page = await this.request('POST', `/databases/${databaseId}/query`, {
        start_cursor: cursor,
        page_size: 100,
      });
      rows.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return rows;
  }

  async getTasks(databaseId) {
    const rows = await this.queryAll(databaseId);
    return rows.map(pageToTask).filter((t) => t.title && t.due);
  }

  // Create the Student OS "Assignments" database inside a page you shared with the integration.
  async createAssignmentsDatabase(parentPageId) {
    return this.request('POST', '/databases', {
      parent: { type: 'page_id', page_id: parentPageId },
      icon: { type: 'emoji', emoji: '📚' },
      title: [{ type: 'text', text: { content: 'Assignments (StudyPilot)' } }],
      properties: {
        Name: { title: {} },
        Course: { select: {} },
        Type: {
          select: {
            options: ['Assignment', 'Exam', 'Project', 'Reading', 'Lab'].map((name) => ({ name })),
          },
        },
        Due: { date: {} },
        Status: {
          select: {
            options: [
              { name: 'Not started', color: 'gray' },
              { name: 'In progress', color: 'blue' },
              { name: 'Done', color: 'green' },
            ],
          },
        },
        Priority: {
          select: {
            options: [
              { name: 'High', color: 'red' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'gray' },
            ],
          },
        },
        'Effort (h)': { number: { format: 'number' } },
        'Progress %': { number: { format: 'number' } },
      },
    });
  }

  async addTask(databaseId, task) {
    return this.request('POST', '/pages', {
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: task.title } }] },
        Course: task.course ? { select: { name: task.course } } : undefined,
        Type: task.type ? { select: { name: task.type } } : undefined,
        Due: { date: { start: task.due } },
        Status: { select: { name: task.status || 'Not started' } },
        Priority: { select: { name: task.priority || 'Medium' } },
        'Effort (h)': { number: Number(task.effortHours) || 1 },
        'Progress %': { number: Number(task.progress) || 0 },
      },
    });
  }

  // Write the daily plan back into Notion as a page with to-do blocks.
  async writeDailyPlan(parentPageId, plan, weeks) {
    const riskEmoji = { overdue: '🔴', 'at-risk': '🟠', tight: '🟡', ok: '🟢' };
    const children = [
      heading(`Focus plan · ${plan.hoursPlanned}h of ${plan.hoursAvailable}h`),
      ...plan.blocks.map((b) =>
        todo(`${riskEmoji[b.risk] || ''} ${b.title}${b.course ? ` (${b.course})` : ''} · ${b.hours}h`)
      ),
      heading('Deadlines at risk'),
      ...plan.ranked
        .filter((t) => t.risk !== 'ok')
        .slice(0, 10)
        .map((t) => bullet(`${riskEmoji[t.risk]} ${t.title} · ${t.remaining}h left · ${t.daysLeft < 0 ? `${-t.daysLeft} day(s) overdue` : `due in ${t.daysLeft} day(s)`}`)),
      heading('Workload ahead'),
      ...weeks.map((w) =>
        bullet(`${w.overloaded ? '⚠️' : '✅'} ${w.label}: ${w.hours}h of work, ${w.count} deadline(s)`)
      ),
    ];
    if (children.length > 100) children.length = 100; // Notion API limit per request

    return this.request('POST', '/pages', {
      parent: { page_id: parentPageId },
      icon: { type: 'emoji', emoji: '🧭' },
      properties: { title: { title: [{ text: { content: `Today's Plan · ${plan.date}` } }] } },
      children,
    });
  }
}

function text(content) {
  return [{ type: 'text', text: { content: content.slice(0, 1900) } }];
}
function heading(content) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: text(content) } };
}
function todo(content) {
  return { object: 'block', type: 'to_do', to_do: { rich_text: text(content), checked: false } };
}
function bullet(content) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: text(content) } };
}

// Turn a Notion page into a plain task. Accepts a few common property names
// so it also works with existing Student OS templates.
function pageToTask(page) {
  const p = page.properties || {};
  const find = (...names) => names.map((n) => p[n]).find(Boolean);

  const titleProp = Object.values(p).find((v) => v.type === 'title');
  const due = find('Due', 'Due Date', 'Deadline', 'Date');
  const course = find('Course', 'Class', 'Subject');
  const status = find('Status');
  const priority = find('Priority');
  const effort = find('Effort (h)', 'Effort', 'Hours', 'Estimate');
  const progress = find('Progress %', 'Progress');
  const type = find('Type');

  return {
    id: page.id,
    url: page.url,
    title: plain(titleProp?.title),
    due: due?.date?.start || null,
    course: optionName(course) || plain(course?.rich_text) || '',
    status: optionName(status) || (status?.checkbox ? 'Done' : 'Not started'),
    priority: optionName(priority) || 'Medium',
    effortHours: effort?.number ?? 2,
    progress: progress?.number != null ? (progress.number <= 1 ? progress.number * 100 : progress.number) : 0,
    type: optionName(type) || '',
  };
}

function optionName(prop) {
  return prop?.select?.name || prop?.status?.name || prop?.multi_select?.[0]?.name || '';
}
function plain(rich) {
  return (rich || []).map((r) => r.plain_text).join('');
}

module.exports = { NotionClient, pageToTask };
