# Weather App (Full Stack: Tech Assessments #1 and #2)

**Author:Azhar Aziz** YOUR NAME

## What it does
**Frontend (React + Vite)**
- Search by city, zip/postal code, landmark, or `lat,lon` coordinates
- "My location" button (browser geolocation)
- Current weather: temperature, feels like, humidity, wind, rain, sunrise/sunset, emoji icons
- 5-day forecast with rain chance
- Error handling: location not found, invalid input, permission denied, API/server down
- Responsive layout (CSS grid/flex with `auto-fit`, mobile breakpoint)
- Shows author name and a PM Accelerator description in the footer

**Backend (Node + Express + SQLite)**
- **Create:** location + date range, validated (format, order, allowed window, location exists via geocoder), temperatures fetched and stored
- **Read:** list/get all stored records
- **Update:** change location, dates, or note (re-validated, temperatures re-fetched)
- **Delete:** remove a record
- **Export:** JSON, CSV, XML, Markdown (`/api/export?format=json|csv|xml|md`)
- **Extra APIs:** OpenStreetMap embedded map and a YouTube search link for each location

Weather data: [Open-Meteo](https://open-meteo.com) (free, no API key).

## Run it
Requires Node 18+.

```bash
# terminal 1 - API on :3001
cd server
npm install
npm start

# terminal 2 - frontend on :5173
cd client
npm install
npm run dev
```
Open http://localhost:5173. Dependencies are listed in `server/package.json` and `client/package.json`.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/weather?q=Paris` or `?lat=..&lon=..` | current weather + 5-day forecast |
| POST | `/api/records` | create `{location,start_date,end_date,note}` |
| GET | `/api/records`, `/api/records/:id` | read |
| PUT | `/api/records/:id` | update |
| DELETE | `/api/records/:id` | delete |
| GET | `/api/export?format=csv` | export |

Date ranges must fall within the last 92 days and next 15 days (Open-Meteo forecast limits), max 16 days long.
