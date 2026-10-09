const path = require('path');
const express = require('express');
const ical = require('node-ical');

const app = express();
const PORT = process.env.PORT || 3000;
const TZ = process.env.DISPLAY_TZ || 'America/Chicago';
const CACHE_MS = Number(process.env.CACHE_MINUTES || 5) * 60 * 1000;
const WEEK_START = (process.env.WEEK_START || 'sunday').toLowerCase() === 'monday' ? 1 : 0;
const SHOW_LEGEND = (process.env.SHOW_LEGEND || 'true').toLowerCase() !== 'false';

// DAYS: how many days to show, rounded to whole weeks (7 or 14 are the sensible picks)
// START: "week" anchors to the start of the week, "today" makes it a rolling window
const DAYS = Math.min(28, Math.max(7, Math.round(Number(process.env.DAYS || 14) / 7) * 7));
const START = (process.env.START || 'week').toLowerCase() === 'today' ? 'today' : 'week';

// Weather. Open-Meteo needs no API key. Leave LAT/LON unset to turn it off.
const LAT = process.env.LAT ? Number(process.env.LAT) : null;
const LON = process.env.LON ? Number(process.env.LON) : null;
const UNITS = (process.env.UNITS || 'f').toLowerCase().startsWith('c') ? 'celsius' : 'fahrenheit';

// Which calendars count as hard deadlines, and the words that mark one.
const DEADLINE_CALENDARS = (process.env.DEADLINE_CALENDARS || 'Canvas,TAMU')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const DEADLINE_WORDS = /\b(due|deadline|quiz|exam|assignment|submission|submit|replies|reply to topic|final|midterm|paper|renewal|expires?|deadline)\b/i;

const PALETTE = [
  '#4CC2E0', '#F2A65A', '#8FD48A', '#C58FE8', '#E8788A', '#7FA8E8',
  '#E0C558', '#5FD9C0', '#F09A6B', '#A8B9D4', '#D98FC0', '#9FD45E'
];

/* ---------- calendar sources ---------- */

function loadCalendars() {
  const raw = process.env.CALENDARS;
  if (raw && raw.trim()) {
    return raw.split(',').map((entry, i) => {
      const [label, url, color] = entry.split('|').map(s => (s || '').trim());
      return { label: label || `Calendar ${i + 1}`, url, color: color || PALETTE[i % PALETTE.length] };
    }).filter(c => c.url);
  }
  if (process.env.ICS_URL) {
    return [{ label: 'Calendar', url: process.env.ICS_URL.trim(), color: PALETTE[0] }];
  }
  return [];
}

/* ---------- date helpers (all calendar-date math, no timezone drift) ---------- */

const keyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});

// "2026-08-05" for an instant, rendered in the display timezone
const dayKey = date => keyFmt.format(date);

// All-day events arrive anchored to UTC midnight, so read them in UTC
const allDayKey = date => date.toISOString().slice(0, 10);

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function keyToUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function weekdayIndex(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date);
  return WEEKDAYS[name];
}

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true
});

// "6a" / "6:30p" reads cleaner than "6:00 AM" from across a room
function shortTime(date) {
  const parts = timeFmt.formatToParts(date);
  const get = t => (parts.find(p => p.type === t) || {}).value;
  const hour = get('hour');
  const minute = get('minute');
  const suffix = (get('dayPeriod') || '').toLowerCase().startsWith('p') ? 'p' : 'a';
  return minute === '00' ? `${hour}${suffix}` : `${hour}:${minute}${suffix}`;
}

/* ---------- ICS parsing ---------- */

// Some exporters send SUMMARY;LANGUAGE=en-US:Practice, which the parser hands
// back as { params, val } instead of a string. Flatten anything that is not text.
function text(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.val === 'string') return value.val;
    if (typeof value.value === 'string') return value.value;
  }
  return value == null ? '' : String(value);
}

function expandRecurring(event, rangeStart, rangeEnd, out) {
  const durationMs = event.end - event.start;
  const occurrences = event.rrule.between(rangeStart, rangeEnd, true);

  for (const occurrence of occurrences) {
    const stamp = occurrence.toISOString().slice(0, 10);

    // Deleted single occurrence
    if (event.exdate && Object.keys(event.exdate).some(k => k.slice(0, 10) === stamp)) continue;

    // Moved or edited single occurrence
    const override = event.recurrences
      && Object.values(event.recurrences).find(r => allDayKey(new Date(r.start)) === stamp);

    if (override) {
      out.push({ start: new Date(override.start), end: new Date(override.end), source: override });
    } else {
      out.push({ start: occurrence, end: new Date(occurrence.getTime() + durationMs), source: event });
    }
  }
}

// Some providers (Arbiter, Outlook, club sites) refuse requests that do not
// look like a browser, so fetch the feed ourselves with browser-like headers
// and a timeout, and say exactly what went wrong when it fails.
async function download(calendar) {
  let url = calendar.url;
  if (url.toLowerCase().startsWith('webcal://')) url = 'https://' + url.slice(9);

  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/calendar, text/plain;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out after 20 seconds' : err.message;
    throw new Error(`could not connect (${reason})`);
  }

  if (!res.ok) throw new Error(`the server answered HTTP ${res.status}`);

  const body = await res.text();
  if (!body.includes('BEGIN:VCALENDAR')) {
    const looksLikePage = /<html|<!doctype/i.test(body.slice(0, 500));
    throw new Error(looksLikePage
      ? 'got a web page instead of a calendar (link expired, or it wants a login)'
      : 'the response was not a calendar feed');
  }
  return body;
}

async function fetchCalendar(calendar, rangeStart, rangeEnd) {
  const data = await ical.async.parseICS(await download(calendar));
  const instances = [];

  for (const event of Object.values(data)) {
    if (event.type !== 'VEVENT' || !event.start) continue;
    try {
      if (event.rrule) {
        expandRecurring(event, rangeStart, rangeEnd, instances);
      } else if (event.end >= rangeStart && event.start <= rangeEnd) {
        instances.push({ start: event.start, end: event.end || event.start, source: event });
      }
    } catch (err) {
      // One malformed event should not cost you the whole calendar
      console.warn(`Skipped an event in ${calendar.label}: ${err.message}`);
    }
  }

  return instances.map(({ start, end, source }) => {
    const allDay = source.datetype === 'date';
    return {
      title: text(source.summary).trim() || 'Busy',
      location: text(source.location).trim(),
      allDay,
      start: start.toISOString(),
      end: end.toISOString(),
      startKey: allDay ? allDayKey(start) : dayKey(start),
      endKey: allDay ? allDayKey(new Date(end.getTime() - 1)) : dayKey(new Date(end.getTime() - 1)),
      timeLabel: allDay ? 'All day' : shortTime(start),
      sortAt: allDay ? 0 : start.getTime(),
      calendar: calendar.label,
      color: calendar.color
    };
  });
}

/* ---------- weather ---------- */

// WMO weather codes, collapsed to the handful a wall display needs
const SKY = {
  0: ['Clear', 'clear'], 1: ['Mostly clear', 'clear'], 2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'], 45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'sleet'], 57: ['Freezing drizzle', 'sleet'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'sleet'], 67: ['Freezing rain', 'sleet'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'], 80: ['Showers', 'rain'], 81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorms', 'storm'], 96: ['Thunderstorms', 'storm'], 99: ['Thunderstorms', 'storm']
};

const sky = code => SKY[code] || ['', 'clear'];

let weatherCache = { at: 0, data: null };

async function getWeather() {
  if (LAT === null || LON === null || Number.isNaN(LAT) || Number.isNaN(LON)) return null;
  // Forecasts move slowly; 20 minutes is plenty and keeps us a polite caller
  if (weatherCache.data && Date.now() - weatherCache.at < 20 * 60 * 1000) return weatherCache.data;

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${LAT}&longitude=${LON}`
    + '&current=temperature_2m,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&temperature_unit=${UNITS}&timezone=${encodeURIComponent(TZ)}&forecast_days=2`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    const round = n => (typeof n === 'number' ? Math.round(n) : null);
    const daily = raw.daily || {};
    const current = raw.current || {};

    const pick = i => {
      if (!Array.isArray(daily.time) || daily.time.length <= i) return null;
      const [label, icon] = sky(daily.weather_code && daily.weather_code[i]);
      return {
        high: round(daily.temperature_2m_max && daily.temperature_2m_max[i]),
        low: round(daily.temperature_2m_min && daily.temperature_2m_min[i]),
        rain: round(daily.precipitation_probability_max && daily.precipitation_probability_max[i]),
        label, icon
      };
    };

    const [nowLabel, nowIcon] = sky(current.weather_code);
    const data = {
      now: { temp: round(current.temperature_2m), label: nowLabel, icon: nowIcon },
      today: pick(0),
      tomorrow: pick(1),
      unit: UNITS === 'celsius' ? 'C' : 'F'
    };

    weatherCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.warn(`Weather fetch failed: ${err.message}`);
    // A stale forecast beats a blank corner of the screen
    return weatherCache.data;
  }
}

/* ---------- deadlines ---------- */

// The single nearest thing with a hard date, so it stops hiding in a column
function nextDeadline(events, now) {
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const candidates = events.filter(e => {
    const when = new Date(e.allDay ? e.end : e.start);
    if (when < now || new Date(e.start) > soon) return false;

    // A deadline is a moment, not a block. Canvas writes due dates as all-day
    // items or zero-length events; a class session or a gym block has real
    // duration and is something you attend, not something you owe.
    const isMoment = e.allDay || new Date(e.end) - new Date(e.start) <= 60000;
    if (!isMoment) return false;

    const byCalendar = DEADLINE_CALENDARS.includes(String(e.calendar).toLowerCase());
    return byCalendar || DEADLINE_WORDS.test(e.title);
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const at = a.allDay ? new Date(a.start).setHours(23, 59) : a.sortAt;
    const bt = b.allDay ? new Date(b.start).setHours(23, 59) : b.sortAt;
    return at - bt;
  });

  const pick = candidates[0];
  return {
    title: pick.title,
    calendar: pick.calendar,
    color: pick.color,
    allDay: pick.allDay,
    start: pick.start,
    dayKey: pick.startKey
  };
}

/* ---------- grid assembly ---------- */

async function buildGrid() {
  const calendars = loadCalendars();
  if (!calendars.length) {
    throw new Error('No calendar configured. Set ICS_URL or CALENDARS in your environment.');
  }

  const now = new Date();
  const todayKey = dayKey(now);
  const offset = START === 'today' ? 0 : (weekdayIndex(now) - WEEK_START + 7) % 7;
  const firstKey = addDays(todayKey, -offset);
  const dayKeys = Array.from({ length: DAYS }, (_, i) => addDays(firstKey, i));

  const rangeStart = keyToUTC(addDays(firstKey, -2));
  const rangeEnd = keyToUTC(addDays(firstKey, DAYS + 2));

  const results = await Promise.allSettled(
    calendars.map(c => fetchCalendar(c, rangeStart, rangeEnd))
  );

  const events = [];
  const problems = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value);
    else {
      problems.push(calendars[i].label);
      console.error(`${calendars[i].label} failed: ${r.reason && r.reason.message}`);
    }
  });

  const days = dayKeys.map(key => {
    const dayEvents = events
      .filter(e => e.startKey <= key && e.endKey >= key)
      .sort((a, b) => a.sortAt - b.sortAt || String(a.title).localeCompare(String(b.title)));

    const date = keyToUTC(key);
    return {
      key,
      dayNumber: date.getUTCDate(),
      month: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(date),
      isFirstOfMonth: date.getUTCDate() === 1,
      isToday: key === todayKey,
      isPast: key < todayKey,
      events: dayEvents
    };
  });

  const upNext = events
    .filter(e => !e.allDay && new Date(e.start) > now)
    .sort((a, b) => a.sortAt - b.sortAt)
    .slice(0, 4);

  return {
    timezone: TZ,
    weekStart: WEEK_START,
    start: START,
    generatedAt: now.toISOString(),
    calendars: SHOW_LEGEND ? calendars.map(c => ({ label: c.label, color: c.color })) : [],
    todayLabel: new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric'
    }).format(now),
    weekdayNames: Array.from({ length: 7 }, (_, i) => {
      const d = keyToUTC(addDays(firstKey, i));
      return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d);
    }),
    days,
    upNext,
    nextDeadline: nextDeadline(events, now),
    weather: await getWeather(),
    problems
  };
}

/* ---------- routes ---------- */

let cache = { at: 0, payload: null };

app.get('/api/calendar', async (req, res) => {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_MS) {
      return res.json({ ...cache.payload, cached: true });
    }
    const payload = await buildGrid();
    cache = { at: Date.now(), payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('Calendar fetch failed:', err.message);
    if (cache.payload) return res.json({ ...cache.payload, stale: true });
    res.status(500).json({ error: err.message });
  }
});

app.get('/healthz', (req, res) => res.send('ok'));

// Phone view. /day is friendlier to type and to save to a home screen.
app.get('/day', (req, res) => res.sendFile(path.join(__dirname, 'public', 'day.html')));

// No cache lifetime on the front end. A wall display that keeps showing a
// stale layout for an hour after a deploy is worse than a few extra requests,
// and ETags mean unchanged files still come back as a cheap 304.
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

app.listen(PORT, () => console.log(`Wall calendar running on ${PORT} (${TZ})`));
