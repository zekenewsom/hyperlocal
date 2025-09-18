const fs = require('node:fs');

(async () => {
  const { globby } = await import('globby');

  const IGNORE_FILES = new Set([
    'scripts/forbidden-check.ts',
    'scripts/forbidden-check.cjs'
  ]);

  const WORD_TOKENS = [
    'placeOrder','submitOrder','createOrder','cancelOrder','amendOrder',
    'sign','privateKey','apiKey','secret','wallet','withdraw'
  ];
  const PATH_TOKENS = ['/order','/orders','/execute','/trade','/position','/leverage','/margin'];

  const wordMatchers = WORD_TOKENS.map(t => ({ token: t, re: new RegExp(`\\b${t}\\b`, 'i') }));

  const files = await globby(['**/*.{ts,tsx,js,jsx}', '!**/node_modules/**', '!**/dist/**', '!**/.next/**']);
  const offenders = [];
  for (const file of files) {
    if (IGNORE_FILES.has(file)) continue;
    const txt = fs.readFileSync(file,'utf8');
    for (const { token, re } of wordMatchers) {
      if (re.test(txt)) offenders.push(`${file} :: contains word "${token}"`);
    }
    for (const token of PATH_TOKENS) {
      if (txt.includes(token)) offenders.push(`${file} :: contains path "${token}"`);
    }
  }
  if (offenders.length) {
    console.error('Forbidden trading-related symbols found:\n' + offenders.join('\n'));
    process.exit(1);
  }
  console.log('OK: no trading/execution symbols found.');
})();

