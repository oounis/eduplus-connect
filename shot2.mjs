import { chromium } from 'playwright';
const [,, email, password] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('https://eduplus.kogiagroup.com/login', { waitUntil: 'domcontentloaded' });
await p.fill('input[type=email]', email);
await p.fill('input[type=password]', password);
await p.click('button[type=submit]');
await p.waitForTimeout(3000);
await p.goto('https://eduplus.kogiagroup.com/access', { waitUntil: 'networkidle' });
// switch to English from inside the app
try { await p.getByRole('link', { name: /^English$/i }).click({ timeout: 5000 }); } catch(e) { console.log('lang switch:', e.message.slice(0,60)); }
await p.waitForTimeout(2500);
await p.screenshot({ path: 'shot-access-en.png' });
// measure the checkbox x positions inside one cell
const geom = await p.evaluate(() => {
  const boxes = [...document.querySelectorAll('td input[type=checkbox]')].slice(0, 8);
  return boxes.map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; });
});
console.log('first 8 checkbox positions:', JSON.stringify(geom));
await b.close();
