#!/usr/bin/env node
// StudyPilot command line.
//   node src/cli.js setup        create the Assignments database in Notion + sample rows
//   node src/cli.js plan [hours] print today's plan
//   node src/cli.js sync [hours] write today's plan back into Notion as a page
const config = require('./config');
const { NotionClient } = require('./notion');
const { buildDailyPlan, weeklyLoad } = require('./planner');
const { sampleTasks } = require('./sample');

async function loadTasks() {
  if (config.demo) {
    console.log('ℹ️  Demo mode: no NOTION_TOKEN / NOTION_DATABASE_ID set, using sample tasks.\n');
    return sampleTasks();
  }
  return new NotionClient(config.token).getTasks(config.databaseId);
}

async function setup() {
  if (!config.token || !config.parentPageId) {
    throw new Error('Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID in .env first (see README).');
  }
  const notion = new NotionClient(config.token);
  const db = await notion.createAssignmentsDatabase(config.parentPageId);
  for (const task of sampleTasks()) await notion.addTask(db.id, task);
  console.log('✅ Created Assignments database with sample tasks.');
  console.log(`   Add this line to your .env:\n   NOTION_DATABASE_ID=${db.id.replace(/-/g, '')}`);
  console.log(`   Open it: ${db.url}`);
}

function printPlan(plan, weeks) {
  const icon = { overdue: '🔴', 'at-risk': '🟠', tight: '🟡', ok: '🟢' };
  console.log(`🧭 Today's plan (${plan.date}): ${plan.hoursPlanned}h of ${plan.hoursAvailable}h\n`);
  plan.blocks.forEach((b, i) =>
    console.log(`  ${i + 1}. ${icon[b.risk]} ${b.title} [${b.course}] · ${b.hours}h`)
  );
  const risky = plan.ranked.filter((t) => t.risk !== 'ok');
  if (risky.length) {
    console.log('\n⚠️  Deadlines at risk:');
    risky.forEach((t) => console.log(`  ${icon[t.risk]} ${t.title}: ${t.remaining}h left, ${t.daysLeft < 0 ? `${-t.daysLeft} day(s) overdue` : `due in ${t.daysLeft} day(s)`}`));
  }
  console.log('\n📅 Workload ahead:');
  weeks.forEach((w) =>
    console.log(`  ${w.overloaded ? '⚠️ ' : '✅'} ${w.label.padEnd(11)} ${String(w.hours).padStart(5)}h / ${w.capacity}h capacity · ${w.count} deadline(s)`)
  );
}

async function main() {
  const [cmd = 'plan', hoursArg] = process.argv.slice(2);
  const hoursAvailable = Number(hoursArg) || config.hoursPerDay;

  if (cmd === 'setup') return setup();

  const tasks = await loadTasks();
  const plan = buildDailyPlan(tasks, { hoursAvailable, hoursPerDay: config.hoursPerDay });
  const weeks = weeklyLoad(tasks, { hoursPerDay: config.hoursPerDay });

  if (cmd === 'plan') return printPlan(plan, weeks);

  if (cmd === 'sync') {
    printPlan(plan, weeks);
    if (config.demo || !config.parentPageId) {
      console.log('\nℹ️  Skipping Notion write: set NOTION_TOKEN, NOTION_DATABASE_ID and NOTION_PARENT_PAGE_ID.');
      return;
    }
    const page = await new NotionClient(config.token).writeDailyPlan(config.parentPageId, plan, weeks);
    console.log(`\n✅ Wrote "Today's Plan" to Notion: ${page.url}`);
    return;
  }

  console.log('Usage: node src/cli.js [setup | plan [hours] | sync [hours]]');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
