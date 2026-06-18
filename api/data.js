const { MongoClient } = require('mongodb');
const https = require('https');

const uri = process.env.MONGODB_URI;
let cachedClient = null;

// Small GET-JSON helper that works on every Node version (no global fetch needed).
function httpGetJson(url, headers) {
  return new Promise((resolve) => {
    const request = https.get(url, { headers: headers || {} }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        if (resp.statusCode < 200 || resp.statusCode >= 300) return resolve(null);
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    request.on('error', () => resolve(null));
    request.setTimeout(5000, () => { request.destroy(); resolve(null); });
  });
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '262784487938-jek8tem7bheq8ms983j338p2s34ip3rc.apps.googleusercontent.com';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

async function connectDB() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin)
  );
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// Verify the caller's Google access token with Google and return the
// authoritative, verified email. Never trust an email sent by the client.
async function getVerifiedEmail(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];

  const info = await httpGetJson(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token)
  );
  if (!info) return null;
  if (info.aud !== GOOGLE_CLIENT_ID && info.azp !== GOOGLE_CLIENT_ID) return null;

  if (info.email && info.email_verified !== false && info.email_verified !== 'false') {
    return info.email.toLowerCase();
  }
  const userinfo = await httpGetJson(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { Authorization: 'Bearer ' + token }
  );
  if (userinfo && userinfo.email) return userinfo.email.toLowerCase();
  return null;
}

function capArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

// Keep only known top-level keys and bound list sizes so a client can't
// write unbounded data. Item contents are the user's own and only affect
// their own record.
function sanitizeUserData(body, email) {
  const grades = (body.grades && typeof body.grades === 'object' && !Array.isArray(body.grades))
    ? body.grades : {};
  return {
    email,
    homework:   capArray(body.homework, 1000),
    quizzes:    capArray(body.quizzes, 500),
    notes:      capArray(body.notes, 1000),
    schedule:   capArray(body.schedule, 200),
    flashcards: capArray(body.flashcards, 500),
    grades,
    gradeHistory: capArray(body.gradeHistory, 200),
    toolOpens: capArray(body.toolOpens, 200),
    focusSessions: Number.isFinite(body.focusSessions) ? Math.max(0, body.focusSessions) : 0,
    streak:     Number.isFinite(body.streak) ? body.streak : 0,
    updatedAt:  Number.isFinite(body.updatedAt) ? body.updatedAt : Date.now(),
    savedAt:    Date.now(),
  };
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  let email;
  try {
    email = await getVerifiedEmail(req);
  } catch (err) {
    return res.status(401).json({ error: 'auth verification failed' });
  }
  if (!email) return res.status(401).json({ error: 'unauthorized' });

  try {
    const client = await connectDB();
    const userdata = client.db('studenthq').collection('userdata');

    if (req.method === 'GET') {
      const doc = await userdata.findOne({ email }, { projection: { _id: 0 } });
      return res.json(doc || null);
    }

    if (req.method === 'POST') {
      const data = sanitizeUserData(req.body || {}, email);
      await userdata.replaceOne({ email }, data, { upsert: true });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
};
