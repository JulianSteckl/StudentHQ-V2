const { createHandler, connectDB } = require('./_shared');
const { sanitizeProfile, bodyTooLarge } = require('./sanitize');

module.exports = createHandler(async (req, res, email) => {
  const client = await connectDB();
  const profiles = client.db('studenthq').collection('profiles');

  if (req.method === 'GET') {
    const doc = await profiles.findOne({ email }, { projection: { _id: 0 } });
    return res.json(doc || null);
  }

  if (req.method === 'POST') {
    if (bodyTooLarge(req.body)) {
      return res.status(413).json({ error: 'payload too large' });
    }
    const profile = sanitizeProfile(req.body || {}, email);
    await profiles.replaceOne({ email }, profile, { upsert: true });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
