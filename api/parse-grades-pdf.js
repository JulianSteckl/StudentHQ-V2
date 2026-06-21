import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pdf } = req.body;
  if (!pdf) return res.status(400).json({ error: 'No PDF provided' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf },
        },
        {
          type: 'text',
          text: `Extract all courses and their grades from this document. Return ONLY a JSON array with no other text, in this exact format:
[{"name":"Course Name","grade":"A","type":"regular"}]

For "type", use: "ap" if the course is AP or IB, "honors" if it is Honors, otherwise "regular".
For "grade", use standard letter grades like A+, A, A−, B+, B, B−, C+, C, C−, D, F.
If a course has a numeric grade, convert it: 97-100=A+, 93-96=A, 90-92=A−, 87-89=B+, 83-86=B, 80-82=B−, 77-79=C+, 73-76=C, 70-72=C−, 60-69=D, below 60=F.
Only include courses with actual grades. Do not include in-progress or missing grades.`,
        },
      ],
    }],
  });

  try {
    const text = message.content[0].text.trim();
    const courses = JSON.parse(text);
    res.json({ courses });
  } catch {
    res.status(422).json({ error: 'Could not parse courses from PDF' });
  }
}
