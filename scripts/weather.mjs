// Writes data/weather.json: 16-day snow forecast per area (Open-Meteo) and the monthly seasonal outlook (ECMWF via Open-Meteo).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PTS = { neb: [47.4185, 10.34, 1930], fel: [47.35, 10.228, 1750], ifen: [47.348, 10.125, 1750], sol: [47.389, 10.244, 1300], val: [47.409, 10.279, 815] };
const get = async u => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u); if (r.ok) return r.json(); } catch {} await new Promise(r => setTimeout(r, 4000)); } throw new Error('fetch failed ' + u); };

const out = { updated: new Date().toISOString(), forecast: {}, outlook: null };
for (const [k, [la, lo, el]] of Object.entries(PTS)) {
  const d = await get(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&elevation=${el}&daily=snowfall_sum,precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code&hourly=snow_depth&forecast_days=16&timezone=Europe%2FBerlin`);
  const sd = {};
  d.hourly.time.forEach((t, i) => { const day = t.slice(0, 10), v = d.hourly.snow_depth[i]; if (v != null) sd[day] = Math.max(sd[day] ?? 0, v); });
  out.forecast[k] = { time: d.daily.time, sf: d.daily.snowfall_sum, pr: d.daily.precipitation_sum, tx: d.daily.temperature_2m_max, tn: d.daily.temperature_2m_min, wc: d.daily.weather_code, sd: d.daily.time.map(t => sd[t] == null ? null : Math.round(sd[t] * 100)) };
}
try {
  const s = await get('https://seasonal-api.open-meteo.com/v1/seasonal?latitude=47.42&longitude=10.34&monthly=temperature_2m_anomaly,precipitation_anomaly,snowfall_anomaly');
  out.outlook = { time: s.monthly.time, t: s.monthly.temperature_2m_anomaly, p: s.monthly.precipitation_anomaly, sf: s.monthly.snowfall_anomaly };
} catch (e) { console.log('outlook failed', e.message); }
await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data', 'weather.json'), JSON.stringify(out));
console.log('weather ok', Object.keys(out.forecast).length, 'points; outlook', !!out.outlook);
