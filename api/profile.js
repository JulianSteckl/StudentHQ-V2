const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let cachedClient = null;

// Public Google OAuth client id (safe to expose). Override via env if needed.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '262784487938-jek8tem7bheq8ms983j338p2s34ip3rc.apps.googleusercontent.com';

// Extra origins allowed to call this API from a browser (comma-separated).
// Same-origin requests (the deployed app) do not need CORS and always work.
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

  const resp = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(match[1])
  );
  if (!resp.ok) return null;

  const info = await resp.json();
  if (info.aud !== GOOGLE_CLIENT_ID) return null;        // token issued for our app
  if (!info.email) return null;
  if (info.email_verified === false || info.email_verified === 'false') return null;
  return info.email.toLowerCase();
}

function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// Whitelist and bound every field we persist, and force the email to the
// one we verified from the token.
function sanitizeProfile(body, email) {
  const rawSubjects = Array.isArray(body.subjects) ? body.subjects.slice(0, 20) : [];
  const subjects = rawSubjects.map(s => ({
    id:    str(s && s.id, 64),
    name:  str(s && s.name, 80),
    short: str(s && s.short, 24),
    color: str(s && s.color, 16),
    grade: str(s && s.grade, 4),
    gpa:   num(s && s.gpa, 0),
    pct:   num(s && s.pct, 0),
  }));
  return {
    email,
    name:        str(body.name, 120),
    picture:     str(body.picture, 512),
    grade:       str(body.grade, 32),
    school:      str(body.school, 120),
    subjects,
    completedAt: num(body.completedAt, Date.now()),
    updatedAt:   Date.now(),
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
    const profiles = client.db('studenthq').collection('profiles');

    if (req.method === 'GET') {
      const doc = await profiles.findOne({ email }, { projection: { _id: 0 } });
      return res.json(doc || null);
    }

    if (req.method === 'POST') {
      const profile = sanitizeProfile(req.body || {}, email);
      await profiles.replaceOne({ email }, profile, { upsert: true });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'server error' });
  }
};
