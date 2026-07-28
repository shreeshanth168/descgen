// ======================================================
// DescGen AI - Production API
// ======================================================

const GEMINI_MODEL = "gemini-3.5-flash-lite";

const SPLIT_TOKEN = "---SECTION---";


// ======================================================
// AI System Instructions
// ======================================================

const SYSTEM_PROMPT = `
You are DescGen AI.

You are a professional e-commerce copywriting AI.

Your job is to create:
- Marketplace listings
- SEO content
- Marketing copy
- FAQs
- Product specifications

Rules:

- Write human sounding content.
- Focus on conversions.
- Focus on customer benefits.
- Use clear professional language.
- Never explain your process.
- Never add unnecessary notes.
- Return only the requested content.
- Strictly follow any character limits given for a section.

`;


// ======================================================
// Platform Templates
// ======================================================

const TEMPLATES = {

amazon: `
Create Amazon listing content.

Include:

1. SEO optimized title
2. Five bullet points
3. Product description

Rules:
- Highlight benefits
- Include important keywords
- Make it conversion focused
`,

shopify: `
Create Shopify product page copy.

Include:

- Product headline
- Storytelling description
- Benefits
- Features
- Call to action

Make it premium brand style.
`,

etsy: `
Create Etsy listing copy.

Include:

- Emotional storytelling
- Handmade/personal feeling
- SEO friendly wording
- Customer connection
`,

flipkart: `
Create Flipkart product listing.

Include:

- Simple Indian customer language
- Benefits
- Features
- Buying motivation
`,

meesho: `
Create Meesho product listing.

Include:

- Short catchy description
- Affordable appeal
- Indian audience focused
- Conversion focused
`

};

// ======================================================
// Clean User Input
// ======================================================

function cleanInput(value = "") {
  return String(value).trim().replace(/[<>]/g, "").substring(0, 5000);
}


// ======================================================
// Build AI Prompt
// ======================================================

function buildPrompt(product) {

  const platform =
    product.platform && TEMPLATES[product.platform]
      ? TEMPLATES[product.platform]
      : `Create premium product descriptions.`;

  return `
${SYSTEM_PROMPT}

PRODUCT DETAILS

Product Name:
${product.name}

Features:
${product.features}

Tone:
${product.tone}

Platform:
${product.platform || "General"}

TASK:
${platform}

Also generate:

SEO Title:
Between 50 and 60 characters. Do not exceed 60 characters.

SEO Meta Description:
Between 140 and 160 characters. Do not exceed 160 characters.

Keywords:
Generate 20 relevant SEO keywords separated by commas.

Instagram Caption (Short):
A punchy 1-2 sentence caption with 3-5 relevant hashtags. Under 150 characters.

Instagram Caption (Long):
A fuller caption with hook, benefits, a call to action, and 8-10 relevant hashtags.

Facebook Ad Headline:
Under 40 characters. Attention-grabbing, benefit-led.

Facebook Ad Primary Text:
2-3 sentences of conversion-focused ad copy.

Facebook Ad CTA:
A single short call-to-action phrase (e.g. "Shop Now", "Get Yours Today").

WhatsApp Promotion:
Create short promotional message.

FAQ:
Create 5 common customer questions with answers.

Specifications:
Create professional product specifications.

IMPORTANT:
You must generate all 12 sections listed above, in this exact order, with no section left blank. Even if a section feels repetitive, write real content for it anyway.
Separate every section using exactly:
${SPLIT_TOKEN}

Return only the generated content.
`;
}


// ======================================================
// Parse AI Sections
// ======================================================

function parseSections(text = "") {
  const sections = text.split(SPLIT_TOKEN).map(s => s.trim());

  return {
    marketplace: sections[0] || "",
    seoTitle: sections[1] || "",
    seoMeta: sections[2] || "",
    keywords: sections[3] || "",
    instagramShort: sections[4] || "",
    instagramLong: sections[5] || "",
    facebookHeadline: sections[6] || "",
    facebookPrimaryText: sections[7] || "",
    facebookCTA: sections[8] || "",
    whatsapp: sections[9] || "",
    faq: sections[10] || "",
    specifications: sections[11] || ""
  };
}


// ======================================================
// Gemini API Call
// ======================================================

function createGeminiBody(prompt) {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 8192
    }
  };
}

async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createGeminiBody(prompt))
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API Error:", errorText);
    throw new Error("Gemini API failed");
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGeminiWithRetry(apiKey, prompt) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGemini(apiKey, prompt);
    } catch (error) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}


// ======================================================
// Request Validation
// ======================================================

function validateRequest(body = {}) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push("Product name is required");
  if (!body.features || !body.features.trim()) errors.push("Product features are required");
  if (!body.tone || !body.tone.trim()) errors.push("Tone is required");
  return errors;
}

function errorResponse(message) {
  return { success: false, error: message };
}


// ======================================================
// Vercel Serverless Function
// ======================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json(errorResponse("Method not allowed"));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json(errorResponse("GEMINI_API_KEY is missing"));
  }

  try {
    const body = req.body || {};
    const errors = validateRequest(body);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const product = {
      name: cleanInput(body.name),
      features: cleanInput(body.features),
      tone: cleanInput(body.tone),
      platform: cleanInput(body.platform || "")
    };

    const prompt = buildPrompt(product);
    const aiText = await callGeminiWithRetry(apiKey, prompt);

    if (!aiText) {
      return res.status(502).json(errorResponse("AI returned empty response"));
    }

    const result = parseSections(aiText);

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json(errorResponse("Something went wrong. Please try again."));
  }
}
