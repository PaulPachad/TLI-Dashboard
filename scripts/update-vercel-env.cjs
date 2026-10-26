const { spawnSync } = require('child_process');

const newUrl = "postgresql://postgres.xheuchraxuwqftxjqynq:TM5G2*%40%40WhWKXT6@aws-0-us-west-2.pooler.supabase.com:5432/postgres?schema=tli&sslmode=require";

const envs = ['production', 'preview', 'development'];

for (const env of envs) {
  console.log(`Setting DATABASE_URL for ${env}...`);
  const res = spawnSync('cmd.exe', ['/c', 'npx.cmd', '-y', 'vercel', 'env', 'add', 'DATABASE_URL', env, '--force'], {
    cwd: 'C:\\Projects\\Authority Mag SAAS\\tli-leverage-dashboard',
    input: newUrl,
    encoding: 'utf8',
  });
  console.log(`Result for ${env}: exitCode=${res.status}`);
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);
}
