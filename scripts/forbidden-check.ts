import { globby } from 'globby';
import fs from 'node:fs';

const FORBIDDEN = [
  'placeOrder','submitOrder','createOrder','cancelOrder','amendOrder',
  'sign','privateKey','apiKey','secret','wallet','withdraw',
  '/order','/orders','/execute','/trade','/position','/leverage','/margin'
];

(async () => {
  const files = await globby(['**/*.{ts,tsx,js,jsx}', '!**/node_modules/**', '!**/dist/**', '!**/.next/**']);
  const offenders: string[] = [];
  for (const file of files) {
    const txt = fs.readFileSync(file,'utf8');
    for (const token of FORBIDDEN) {
      if (txt.includes(token)) {
        offenders.push(`${file} :: contains "${token}"`);
      }
    }
  }
  if (offenders.length) {
    console.error('Forbidden trading-related symbols found:\n' + offenders.join('\n'));
    process.exit(1);
  }
  console.log('OK: no trading/execution symbols found.');
})();

