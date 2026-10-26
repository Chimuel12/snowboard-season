// Captures a still of every webcam in cams.json into cams/<id>/<slot>.jpg (slot = 06, 12 or 18, Europe/Berlin)
// and updates cams/index.json. Panomax and feratel players are opened in headless Chromium and the
// still image they load is saved; if none is found, a screenshot of the player is used instead.
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'cams');
const cams = JSON.parse(await fs.readFile(path.join(ROOT, 'cams.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

function berlinHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(d));
}
const h = berlinHour();
const slot = process.env.SLOT || (h < 9 ? '06' : h < 15 ? '12' : '18');

let index = { cams: {} };
try { index = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')); } catch {}

async function save(cam, buf) {
  const img = sharp(buf);
  const m = await img.metadata();
  const wide = m.width / m.height > 2.6; // panomax panoramas are very wide strips
  const out = await (wide ? img.resize({ height: 480, withoutEnlargement: true }) : img.resize({ width: 1280, withoutEnlargement: true }))
    .jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  await fs.mkdir(path.join(OUT, cam.id), { recursive: true });
  await fs.writeFile(path.join(OUT, cam.id, slot + '.jpg'), out);
  const meta = await sharp(out).metadata();
  const e = index.cams[cam.id] || (index.cams[cam.id] = { slots: {} });
  e.slots[slot] = { t: new Date().toISOString(), w: meta.width, h: meta.height };
  e.latest = slot;
  return out.length;
}

async function fromPlayer(browser, cam) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, userAgent: UA });
  const hits = [];
  page.on('response', async r => {
    const u = r.url();
    if (/live-image\.panomax\.com\/cams\/\d+\/recent_reduced\.jpg/.test(u) || /wtvpict\.feratel\.com\/picture\//.test(u)) {
      try { const b = await r.body(); if (b.length > 20000) hits.push(b); } catch {}
    }
  });
  try {
    await page.goto(cam.src, { waitUntil: 'networkidle', timeout: 60000 });
  } catch {}
  await page.waitForTimeout(5000);
  let buf = hits.sort((a, b) => b.length - a.length)[0];
  if (!buf) buf = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.close();
  return buf;
}

const browser = await chromium.launch();
const queue = [...cams];
let ok = 0, fail = 0;
async function worker() {
  for (let cam; (cam = queue.shift());) {
    try {
      let buf;
      if (cam.kind === 'img') {
        const r = await fetch(cam.src + '?t=' + Date.now(), { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } else buf = await fromPlayer(browser, cam);
      const n = await save(cam, buf);
      ok++; console.log('ok  ', cam.id, slot, Math.round(n / 1024) + ' KB');
    } catch (e) { fail++; console.log('FAIL', cam.id, e.message); }
  }
}
await Promise.all([worker(), worker(), worker()]);
await browser.close();
index.updated = new Date().toISOString();
index.slot = slot;
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`done: ${ok} ok, ${fail} failed, slot ${slot}`);
