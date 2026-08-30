import { chromium } from 'playwright';
const [,, email, password] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('https://eduplus.kogiagroup.com/login', { waitUntil: 'domcontentloaded' });
try { await p.getByRole('link', { name: /English/i }).click({ timeout: 4000 }); } catch {}
await p.waitForTimeout(700);
await p.fill('input[type=email]', email);
await p.fill('input[type=password]', password);
await p.click('button[type=submit]');
await p.waitForTimeout(3500);
// find the access-rights link
const links = await p.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
console.log('nav routes:', [...new Set(links)].filter(h=>h&&h.startsWith('/')).join(' '));
await p.goto('https://eduplus.kogiagroup.com/access', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
console.log('url:', p.url());
await p.screenshot({ path: 'shot-access-top.png' });
await p.screenshot({ path: 'shot-access-full.png', fullPage: true });
await b.close();
