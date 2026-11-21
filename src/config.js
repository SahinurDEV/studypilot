// Loads settings from .env (no dependency needed) and the environment.
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv();

module.exports = {
  token: process.env.NOTION_TOKEN || '',
  databaseId: process.env.NOTION_DATABASE_ID || '',
  parentPageId: process.env.NOTION_PARENT_PAGE_ID || '',
  hoursPerDay: Number(process.env.STUDY_HOURS_PER_DAY) || 4,
  port: Number(process.env.PORT) || 3000,
  get demo() {
    return !this.token || !this.databaseId;
  },
};
