import { useState, useEffect } from 'react';

const NAME = 'Azhar Aziz'; // TODO: put your name here
const ABOUT = `The Product Manager Accelerator Program is designed to support PM professionals through every stage of their careers. From students looking for entry-level jobs to Directors looking to take on a leadership role, our program has helped over hundreds of students fulfill their career aspirations. Our Product Manager Accelerator community are ambitious and committed. Through our program they have learnt, honed and developed new PM and leadership skills, giving them a strong foundation for their future endeavors.`;

const ICONS = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'],
  75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'],
};
const icon = (c) => ICONS[c] || ['🌡️', 'Unknown'];

async function api(path, options) {
  let res;
  try {
    res = await fetch('/api' + path, options);
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function App() {
  const [q, setQ] = useState('');
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const code = weather?.current.weather_code;
  const theme = code === undefined ? 'default'
    : code <= 1 ? 'sunny' : code <= 3 ? 'cloudy' : code <= 48 ? 'fog'
    : code <= 67 || (code >= 80 && code <= 82) ? 'rain' : code <= 77 ? 'snow' : 'storm';
  useEffect(() => { document.body.className = 'theme-' + theme; }, [theme]);

  const load = async (path) => {
    setLoading(true); setError('');
    try { setWeather(await api(path)); } catch (e) { setError(e.message); setWeather(null); }
    setLoading(false);
  };
  const search = (e) => { e.preventDefault(); if (!q.trim()) return setError('Please enter a location'); load('/weather?q=' + encodeURIComponent(q)); };
  const locate = () => {
    if (!navigator.geolocation) return setError('Geolocation is not supported by your browser');
    navigator.geolocation.getCurrentPosition(
      (p) => load(`/weather?lat=${p.coords.latitude}&lon=${p.coords.longitude}`),
      () => setError('Location permission denied. Type a location instead.')
    );
  };

  return (
    <main>
      <header>
        <h1>🌍 Weather App</h1>
        <form onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, zip code, landmark, or lat,lon" />
          <button>Search</button>
          <button type="button" className="ghost" onClick={locate}>📍 My location</button>
        </form>
        {error && <div className="error">{error}</div>}
        {loading && <p>Loading…</p>}
      </header>

      {weather && <Weather w={weather} />}
      <Records />

      <footer>
        <strong>Built by {NAME}</strong>
        <p>{ABOUT}</p>
      </footer>
    </main>
  );
}

function Weather({ w }) {
  const c = w.current, d = w.daily, u = w.units;
  const [ic, label] = icon(c.weather_code);
  return (
    <section>
      <h2>{w.location.name}{w.location.country && `, ${w.location.country}`}</h2>
      <div className="current">
        <div className="big">{ic}</div>
        <div><div className="temp">{Math.round(c.temperature_2m)}{u.temperature_2m}</div>{label}</div>
      </div>
      <div className="details">
        <div>🤒 Feels like {Math.round(c.apparent_temperature)}{u.apparent_temperature}</div>
        <div>💧 Humidity {c.relative_humidity_2m}%</div>
        <div>💨 Wind {c.wind_speed_10m} {u.wind_speed_10m}</div>
        <div>☔ Rain {c.precipitation} {u.precipitation}</div>
        <div>🌅 Sunrise {d.sunrise[0].slice(11)}</div>
        <div>🌇 Sunset {d.sunset[0].slice(11)}</div>
      </div>
      <h3>5-day forecast</h3>
      <div className="forecast">
        {d.time.map((t, i) => (
          <div className="day" key={t}>
            <strong>{new Date(t + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
            <span>{icon(d.weather_code[i])[0]}</span>
            {Math.round(d.temperature_2m_max[i])}° / {Math.round(d.temperature_2m_min[i])}°
            <div>☔ {d.precipitation_probability_max[i] ?? 0}%</div>
          </div>
        ))}
      </div>
      <iframe title="map" src={w.map_url} loading="lazy" />
      <p><a href={w.youtube_url} target="_blank" rel="noreferrer">▶️ Watch videos about {w.location.name} on YouTube</a></p>
    </section>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function Records() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ location: '', start_date: today(), end_date: today(), note: '' });
  const [editing, setEditing] = useState(null); // record id
  const [error, setError] = useState('');

  const refresh = () => api('/records').then(setList).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (editing) await api('/records/' + editing, json('PUT', form));
      else await api('/records', json('POST', form));
      setEditing(null); setForm({ ...form, location: '', note: '' });
      refresh();
    } catch (err) { setError(err.message); }
  };
  const edit = (r) => { setEditing(r.id); setForm({ location: r.query, start_date: r.start_date, end_date: r.end_date, note: r.note }); };
  const del = async (id) => {
    if (!confirm('Delete this record?')) return;
    try { await api('/records/' + id, { method: 'DELETE' }); refresh(); } catch (err) { setError(err.message); }
  };

  return (
    <section>
      <h2>Saved temperature ranges</h2>
      <form onSubmit={submit}>
        <input value={form.location} onChange={set('location')} placeholder="Location" required />
        <input type="date" value={form.start_date} onChange={set('start_date')} required />
        <input type="date" value={form.end_date} onChange={set('end_date')} required />
        <input value={form.note} onChange={set('note')} placeholder="Note (optional)" />
        <button>{editing ? 'Update' : 'Save'}</button>
        {editing && <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>}
      </form>
      {error && <div className="error">{error}</div>}
      <p className="row">Export:
        {['json', 'csv', 'xml', 'md'].map((f) => <a key={f} className="btn" href={'/api/export?format=' + f}>{f.toUpperCase()}</a>)}
      </p>
      {list.map((r) => (
        <div className="record" key={r.id}>
          <strong>{r.name}{r.country && `, ${r.country}`}</strong> · {r.start_date} → {r.end_date} {r.note && <em>· {r.note}</em>}
          <table>
            <thead><tr><th>Date</th><th>Max °C</th><th>Min °C</th></tr></thead>
            <tbody>{r.temps.map((t) => <tr key={t.date}><td>{t.date}</td><td>{t.max}</td><td>{t.min}</td></tr>)}</tbody>
          </table>
          <p className="row">
            <button onClick={() => edit(r)}>Edit</button>
            <button className="danger" onClick={() => del(r.id)}>Delete</button>
            <a href={r.youtube_url} target="_blank" rel="noreferrer">▶️ YouTube</a>
          </p>
        </div>
      ))}
      {!list.length && <p>No records yet.</p>}
    </section>
  );
}