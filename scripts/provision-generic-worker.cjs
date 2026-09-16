// Repair the missing Railway editor connection without printing credentials.
// Run from repository root with RAILWAY_CLI pointing to the authenticated CLI.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
for (const line of fs.readFileSync('production.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^DATABASE_URL=(.*)$/);
  if (match) process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, '');
}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
function setVariable(key, value) {
  const result = spawnSync(process.env.RAILWAY_CLI,
    ['variables', 'set', key, '--stdin', '--skip-deploys'],
    { cwd: 'auto-responder', input: value, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Railway could not set ${key}`);
  console.log(`Configured ${key} (value hidden)`);
}
(async () => {
  const mailbox = await db.automationMailbox.findFirst({where: {emailAddress: 'editor@authoritymag.co'}});
  if (!mailbox) throw new Error('Editor mailbox missing');
  const token = `am_bridge_${mailbox.id}_${crypto.randomBytes(24).toString('base64url')}`;
  setVariable('GMAIL_EDITOR_TOKEN_B64', fs.readFileSync('auto-responder/token_editor.json').toString('base64'));
  setVariable('AUTHORITY_GENERIC_BRIDGE_TOKEN', token);
  await db.automationMailbox.update({where: {id: mailbox.id}, data: {
    bridgeTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    bridgeTokenPreview: `...${token.slice(-6)}`,
    bridgeTokenRotatedAt: new Date(), bridgeStatus: 'TOKEN_READY',
  }});
  const response = await fetch('https://tli.authoritymag.co/api/automation/bridge/config', {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!response.ok) throw new Error(`Bridge verification failed: ${response.status}`);
  const config = await response.json();
  console.log(JSON.stringify({mailbox: config.mailbox.emailAddress, workflows: config.workflows}));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
