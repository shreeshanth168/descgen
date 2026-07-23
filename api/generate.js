// This runs on Vercel's servers, not in the user's browser.
// It keeps your API key secret and talks to Google's free Gemini API.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, features, tone } = req.body || {};

  if (!name || !features) {
    return res.status(400).json({ error: 'Missing product name or features.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing an API key. Add GEMINI_API_KEY in Vercel project settings.' });
  }

  const prompt = `You write short, high-converting e-commerce product descriptions.

Product name: ${name}
Key features/details:
${features}

Tone: ${tone}

Write exactly 3 different product description options, each 2-4 sentences long, in the requested tone. Each should be genuinely different in angle (e.g. one focuses on the story/craftsmanship, one on practical benefits, one on the customer's emotional payoff). Do not use markdown formatting, headers, or numbering — just return the 3 descriptions separated by the exact delimiter "---SPLIT---" and nothing else before, between, or after them.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'The AI service failed to respond. Please try again.' });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const variants = text
      .split('---SPLIT---')
      .map(v => v.trim())
      .filter(Boolean);

    if (variants.length === 0) {
      return res.status(502).json({ error: 'No description was generated. Please try again.' });
    }

    return res.status(200).json({ variants });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}
