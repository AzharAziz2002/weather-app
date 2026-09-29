import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database('weather.db');
db.exec(`CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT, name TEXT, country TEXT, lat REAL, lon REAL,
  start_date TEXT, end_date TEXT, temps TEXT, note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// ---------- helpers ----------
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message || 'Server error' }));

async function getJson(url) {
  let r;
  try { r = await fetch(url); } catch { throw httpErr(502, 'Could not reach the weather service'); }
  if (!r.ok) throw httpErr(502, 'Weather service returned an error');
  return r.json();
}

// Accepts "lat,lon" or a place name / postal code / landmark (fuzzy match by Open-Meteo geocoder)
async function geocode(q) {
  if (!q || !q.trim()) throw httpErr(400, 'Please enter a location');
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    const lat = +m[1], lon = +m[2];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw httpErr(400, 'Coordinates are out of range');
    return { name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, country: '', lat, lon };
  }
  const term = q.split(',')[0].trim();
  const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1`);
  if (!d.results?.length) throw httpErr(404, `Location "${q}" was not found. Try a city, zip code, or "lat,lon".`);
  const r = d.results[0];
  return { name: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude };
}

const DAY = 86400000;
function validateDates(start, end) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(start || '') || !re.test(end || '')) throw httpErr(400, 'Dates must be in YYYY-MM-DD format');
  const s = Date.parse(start), e = Date.parse(end);
  if (isNaN(s) || isNaN(e)) throw httpErr(400, 'Invalid date');
  if (s > e) throw httpErr(400, 'Start date must be on or before end date');
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  if (s < today - 92 * DAY || e > today + 15 * DAY)
    throw httpErr(400, 'Dates must be within the last 92 days and the next 15 days');
  if ((e - s) / DAY > 15) throw httpErr(400, 'Date range can be at most 16 days');
}

async function fetchTemps(loc, start, end) {
  const d = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${start}&end_date=${end}`
  );
  return d.daily.time.map((date, i) => ({
    date, max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i],
  }));
}

const toRecord = (r) => ({ ...r, temps: JSON.parse(r.temps) });
const mapUrl = (r) => `https://www.openstreetmap.org/export/embed.html?bbox=${r.lon - 0.1},${r.lat - 0.06},${r.lon + 0.1},${r.lat + 0.06}&marker=${r.lat},${r.lon}`;
const ytUrl = (r) => `https://www.youtube.com/results?search_query=${encodeURIComponent('travel ' + r.name + ' ' + r.country)}`;
const withExtras = (r) => ({ ...toRecord(r), map_url: mapUrl(r), youtube_url: ytUrl(r) });

// ---------- current weather + 5-day forecast ----------
app.get('/api/weather', wrap(async (req, res) => {
  let loc;
  if (req.query.lat && req.query.lon) {
    loc = await geocode(`${req.query.lat},${req.query.lon}`);
  } else loc = await geocode(req.query.q);
  const d = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&forecast_days=5&timezone=auto`
  );
  res.json({ location: loc, current: d.current, daily: d.daily, units: d.current_units, map_url: mapUrl(loc), youtube_url: ytUrl(loc) });
}));

// ---------- CRUD ----------
app.post('/api/records', wrap(async (req, res) => {
  const { location, start_date, end_date, note = '' } = req.body;
  validateDates(start_date, end_date);
  const loc = await geocode(location);
  const temps = await fetchTemps(loc, start_date, end_date);
  const info = db.prepare(
    `INSERT INTO records (query,name,country,lat,lon,start_date,end_date,temps,note) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(location, loc.name, loc.country, loc.lat, loc.lon, start_date, end_date, JSON.stringify(temps), note);
  res.status(201).json(withExtras(db.prepare('SELECT * FROM records WHERE id=?').get(info.lastInsertRowid)));
}));

app.get('/api/records', wrap(async (_req, res) => {
  res.json(db.prepare('SELECT * FROM records ORDER BY id DESC').all().map(withExtras));
}));

app.get('/api/records/:id', wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM records WHERE id=?').get(req.params.id);
  if (!r) throw httpErr(404, 'Record not found');
  res.json(withExtras(r));
}));

app.put('/api/records/:id', wrap(async (req, res) => {
  const old = db.prepare('SELECT * FROM records WHERE id=?').get(req.params.id);
  if (!old) throw httpErr(404, 'Record not found');
  const location = req.body.location ?? old.query;
  const start = req.body.start_date ?? old.start_date;
  const end = req.body.end_date ?? old.end_date;
  const note = req.body.note ?? old.note;
  validateDates(start, end);
  const loc = await geocode(location);
  const temps = await fetchTemps(loc, start, end); // re-fetch so stored data stays coherent
  db.prepare(`UPDATE records SET query=?,name=?,country=?,lat=?,lon=?,start_date=?,end_date=?,temps=?,note=? WHERE id=?`)
    .run(location, loc.name, loc.country, loc.lat, loc.lon, start, end, JSON.stringify(temps), note, old.id);
  res.json(withExtras(db.prepare('SELECT * FROM records WHERE id=?').get(old.id)));
}));

app.delete('/api/records/:id', wrap(async (req, res) => {
  const info = db.prepare('DELETE FROM records WHERE id=?').run(req.params.id);
  if (!info.changes) throw httpErr(404, 'Record not found');
  res.status(204).end();
}));

// ---------- export ----------
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

app.get('/api/export', wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM records ORDER BY id').all().map(toRecord);
  const format = (req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename=weather.json');
    return res.json(rows);
  }
  if (format === 'csv') {
    const lines = ['id,location,country,lat,lon,note,date,max_c,min_c'];
    rows.forEach((r) => r.temps.forEach((t) =>
      lines.push([r.id, r.name, r.country, r.lat, r.lon, r.note, t.date, t.max, t.min].map(csvCell).join(','))));
    res.type('text/csv').attachment('weather.csv').send(lines.join('\n'));
  } else if (format === 'xml') {
    const body = rows.map((r) =>
      `  <record id="${r.id}"><location>${esc(r.name)}</location><country>${esc(r.country)}</country>` +
      `<start>${r.start_date}</start><end>${r.end_date}</end><note>${esc(r.note)}</note><days>` +
      r.temps.map((t) => `<day date="${t.date}" max="${t.max}" min="${t.min}"/>`).join('') + `</days></record>`).join('\n');
    res.type('application/xml').attachment('weather.xml').send(`<?xml version="1.0"?>\n<records>\n${body}\n</records>`);
  } else if (format === 'md') {
    const md = rows.map((r) =>
      `## #${r.id} ${r.name}, ${r.country} (${r.start_date} to ${r.end_date})\n${r.note ? `_${r.note}_\n` : ''}\n| Date | Max °C | Min °C |\n|---|---|---|\n` +
      r.temps.map((t) => `| ${t.date} | ${t.max} | ${t.min} |`).join('\n')).join('\n\n');
    res.type('text/markdown').attachment('weather.md').send(`# Weather Records\n\n${md}`);
  } else throw httpErr(400, 'Format must be json, csv, xml, or md');
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
