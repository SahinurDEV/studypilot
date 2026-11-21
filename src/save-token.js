// Saves a Notion token from the clipboard into .env (macOS), without printing it.
// Usage: copy the token in Notion, then run `npm run token`.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envFile = path.join(__dirname, '..', '.env');
const token = execSync('pbpaste').toString().trim();
if (!/^(ntn_|secret_)\S{20,}$/.test(token)) {
  const looksLike = /\s/.test(token) ? 'text with spaces' : `${token.length} characters starting with "${token.slice(0, 4)}"`;
  console.error(`❌ The clipboard does not hold a Notion token (it holds ${looksLike}).`);
  console.error('   Click the copy icon next to the API token in Notion (or reveal it with the eye icon and copy it), then run this again.');
  process.exit(1);
}
if (!fs.existsSync(envFile)) fs.copyFileSync(path.join(__dirname, '..', '.env.example'), envFile);
let env = fs.readFileSync(envFile, 'utf8');
env = /^NOTION_TOKEN=.*$/m.test(env) ? env.replace(/^NOTION_TOKEN=.*$/m, `NOTION_TOKEN=${token}`) : `NOTION_TOKEN=${token}\n${env}`;
fs.writeFileSync(envFile, env);
console.log('✅ token saved');
