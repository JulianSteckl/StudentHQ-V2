const { createHandler, connectDB } = require('./_shared');
const { sanitizeUserData, bodyTooLarge } = require('./sanitize');

module.exports = createHandler(async (req, res, email) => {
  const client = await connectDB();
  const userdata = client.db('studenthq').collection('userdata');

  if (req.method === 'GET') {
    const doc = await userdata.findOne({ email }, { projection: { _id: 0 } });
    return res.json(doc || null);
  }

  if (req.method === 'POST') {
    if (bodyTooLarge(req.body)) {
      return res.status(413).json({ error: 'payload too large' });
    }
    const data = sanitizeUserData(req.body || {}, email);
    await userdata.replaceOne({ email }, data, { upsert: true });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
