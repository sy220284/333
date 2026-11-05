

import('./lib/tools.mjs').then((tools) => {
  const result = tools.installTools();
  process.stdout.write(JSON.stringify({ ok: !!result.ok, log: String(result.log || '').slice(-20000), remedy: result.remedy || null }));
}).catch((e) => { process.stdout.write(JSON.stringify({ ok: false, log: String((e && e.message) || e) })); });
