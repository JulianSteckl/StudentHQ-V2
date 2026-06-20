const { MongoClient } = require('mongodb');
const https = require('https');

const uri = process.env.MONGODB_URI;
let cachedClient = null;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '262784487938-jek8tem7bheq8ms983j338p2s34ip3rc.apps.googleusercontent.com';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map();

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

async function connectDB() {
  if (!uri) throw new Error('MONGODB_URI is not configured');
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

function emailIsVerified(info) {
  return info && info.email && info.email_verified !== false && info.email_verified !== 'false';
}

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

  if (emailIsVerified(info)) return info.email.toLowerCase();

  const userinfo = await httpGetJson(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { Authorization: 'Bearer ' + token }
  );
  if (emailIsVerified(userinfo)) return userinfo.email.toLowerCase();
  return null;
}

function rateLimitKey(req, email) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || 'unknown';
  return email + ':' + ip;
}

function checkRateLimit(key) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (rateBuckets.size > 10_000) {
    for (const [k, b] of rateBuckets) {
      if (now - b.start > RATE_WINDOW_MS) rateBuckets.delete(k);
    }
  }
  return bucket.count <= RATE_MAX;
}

function createHandler(fn) {
  return async function handler(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    let email;
    try {
      email = await getVerifiedEmail(req);
    } catch (err) {
      return res.status(401).json({ error: 'auth verification failed' });
    }
    if (!email) return res.status(401).json({ error: 'unauthorized' });

    if (!checkRateLimit(rateLimitKey(req, email))) {
      return res.status(429).json({ error: 'rate limit exceeded' });
    }

    try {
      return await fn(req, res, email);
    } catch (err) {
      return res.status(500).json({ error: 'server error' });
    }
  };
}

module.exports = {
  connectDB,
  createHandler,
  getVerifiedEmail,
  GOOGLE_CLIENT_ID,
};
