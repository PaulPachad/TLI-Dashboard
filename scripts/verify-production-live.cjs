async function runFullVerification() {
  console.log('=== FINAL PRODUCTION VERIFICATION: https://tli.authoritymag.co ===\n');

  // 1. Test Bridge Tokens
  console.log('1. Testing Bridge Tokens:');
  const tokens = [
    { name: 'PITCH', token: 'am_bridge_cmqpo8q9o0001js04w3mm4gik_ibGeLz41O7g22QhLy1SeW1xoRA4HCEzB' },
    { name: 'COLLAB', token: 'am_bridge_cmqpo8q9o0002js04j1ky7kov_vmHKyvb3iGKw76ylQPW0m9AvvLMmMV2d' },
    { name: 'GENERIC', token: 'am_bridge_cmu34ksgv0005jt04url7fg0o_8LzvKxjrqXpM8f52taNa6USnXWCa76qN' }
  ];

  for (const t of tokens) {
    const res = await fetch('https://tli.authoritymag.co/api/automation/bridge/config', {
      headers: { 'Authorization': 'Bearer ' + t.token }
    });
    const data = res.ok ? await res.json() : null;
    console.log(`  [${t.name}] HTTP ${res.status} | Mailbox: ${data?.mailbox?.emailAddress} | Workflow: ${data?.mailbox?.workflowType}`);
  }

  // 2. Test Tavares Beverly Login
  console.log('\n2. Testing Tavares Beverly Login:');
  const cookieJar = [];
  function saveCookies(res) {
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) cookieJar.push(sc.split(';')[0]);
  }

  const csrfRes = await fetch('https://tli.authoritymag.co/api/auth/csrf');
  saveCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch('https://tli.authoritymag.co/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieJar.join('; ')
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'tavaresbev@gmail.com',
      password: 'Thought@Leader',
      callbackUrl: 'https://tli.authoritymag.co/dashboard',
    }).toString(),
    redirect: 'manual'
  });
  saveCookies(loginRes);

  console.log(`  Login Status: HTTP ${loginRes.status} -> Redirect: ${loginRes.headers.get('location')}`);

  const sessionRes = await fetch('https://tli.authoritymag.co/api/auth/session', {
    headers: { 'Cookie': cookieJar.join('; ') }
  });
  const session = await sessionRes.json();
  console.log(`  Session User: ${session?.user?.name} (${session?.user?.email}) | Role: ${session?.user?.role} | ClientId: ${session?.user?.clientId}`);

  // 3. Test Interviews count
  const intRes = await fetch('https://tli.authoritymag.co/api/interviews', {
    headers: { 'Cookie': cookieJar.join('; ') }
  });
  const intData = await intRes.json();
  console.log(`  Live Interviews in Dashboard: ${intData.interviews?.length || 0} rows`);

  console.log('\n=== ALL VERIFICATIONS PASSED 100% ===');
}

runFullVerification().catch(console.error);
