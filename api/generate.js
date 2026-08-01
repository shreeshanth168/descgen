// ======================================================
// DescGen AI - Production API (JSON-structured output)
// ======================================================

const GEMINI_MODEL = "gemini-3.5-flash-lite";

// ======================================================
// Platform-specific guidance for the "marketplace" field
// ======================================================

const PLATFORM_GUIDANCE = {
  amazon: "Write this as Amazon-style listing copy: a benefit-led opening line, followed by five short benefit-focused bullet points (use line breaks between bullets), then a brief closing product description. Highlight keywords naturally.",
  shopify: "Write this as a Shopify product page: a short headline, a 2-3 sentence brand story, a highlights section (3-4 bullet points), and end with a call to action. Premium, brand-forward tone.",
  etsy: "Write this as an Etsy listing: warm, personal, story-driven, emphasizing handmade or small-batch quality and an emotional connection with the buyer.",
  flipkart: "Write this as a Flipkart listing: simple, direct Indian-audience language, clear benefits and features, and a buying motivation line. Keep sentences short.",
  meesho: "Write this as a Meesho listing: short, catchy, price-and-value focused, simple language for a broad Indian audience, conversion-focused.",
  "": "Write this as a general, premium product description suitable for any online store."
};

function buildPrompt(product) {
  const guidance = PLATFORM_GUIDANCE[product.platform] || PLATFORM_GUIDANCE[""];

  return `
You are DescGen AI, a professional e-commerce copywriter. Write human-sounding, conversion-focused, benefit-led copy. Never explain your process. Return only what is requested.

PRODUCT DETAILS
Product Name: ${product.name}
Features: ${product.features}
Tone: ${product.tone}
Platform: ${product.platform || "General"}

Respond with ONLY a valid JSON object (no markdown fences, no extra text) with exactly these keys, each a string:

{
  "marketplace": "${guidance}",
  "seoTitle": "An SEO title between 50 and 60 characters, not exceeding 60.",
  "seoMeta": "An SEO meta description between 140 and 160 characters, not exceeding 160.",
  "keywords": "20 relevant SEO keywords separated by commas.",
  "instagramShort": "A punchy 1-2 sentence Instagram caption with 3-5 hashtags, under 150 characters.",
  "instagramLong": "A fuller Instagram caption with a hook, benefits, a call to action, and 8-10 hashtags.",
  "facebookHeadline": "A Facebook ad headline under 40 characters, attention-grabbing and benefit-led.",
  "facebookPrimaryText": "2-3 sentences of conversion-focused Facebook ad copy.",
  "facebookCTA": "A short call-to-action phrase, e.g. Shop Now or Get Yours Today.",
  "whatsapp": "A short WhatsApp promotional message.",
  "faq": "5 common customer questions with answers, formatted as Q: ... A: ... pairs separated by line breaks.",
  "specifications": "A clean list of product specifications based on the given features, one per line."
}

Fill in real content for every key based on the product details above — the text in the JSON template shown is instruction, not literal output. Every key must have real, non-empty content. Return ONLY the JSON object, nothing else.
`;
}


// ======================================================
// Clean User Input
// ======================================================

function cleanInput(value = "") {
  return String(value).trim().replace(/[<>]/g, "").substring(0, 2000);
}


// ======================================================
// Gemini API Call (JSON mode)
// ======================================================

function createGeminiBody(prompt) {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: "application/json"
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
// Safe JSON Parsing (strip markdown fences if present)
// ======================================================

const EXPECTED_KEYS = [
  "marketplace", "seoTitle", "seoMeta", "keywords",
  "instagramShort", "instagramLong",
  "facebookHeadline", "facebookPrimaryText", "facebookCTA",
  "whatsapp", "faq", "specifications"
];

function parseAIResponse(text = "") {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON parse failed:", err.message, "Raw text:", cleaned.slice(0, 500));
    throw new Error("AI response was not valid JSON");
  }

  const result = {};
  EXPECTED_KEYS.forEach(key => {
    result[key] = typeof parsed[key] === "string" ? parsed[key].trim() : "";
  });

  return result;
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
// Allowed origins (basic anti-abuse — blocks direct script/bot calls)
// ======================================================

const ALLOWED_ORIGINS = [
  "https://www.descgenai.online",
  "https://descgenai.online",
  "https://descgen-delta.vercel.app"
];

function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
}


// ======================================================
// Verify the real logged-in user via their Supabase session
// token — never trust an email the client claims in the body.
// ======================================================

async function getVerifiedEmail(req, supabaseUrl, supabaseKey) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.email ? user.email.toLowerCase().trim() : null;
  } catch {
    return null;
  }
}


// ======================================================
// Rate limiting — max requests per user in a rolling window
// ======================================================

const RATE_LIMIT_MAX = 5;      // max generations
const RATE_LIMIT_WINDOW_SEC = 60; // per this many seconds

async function checkRateLimit(email, supabaseUrl, supabaseKey) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SEC * 1000).toISOString();

  const res = await fetch(
    `${supabaseUrl}/rest/v1/rate_limits?email=eq.${encodeURIComponent(email)}&created_at=gte.${windowStart}&select=id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );

  if (!res.ok) return { allowed: true }; // fail open rather than block everyone on an outage

  const rows = await res.json();
  if (Array.isArray(rows) && rows.length >= RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  // Log this attempt
  await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ email })
  });

  return { allowed: true };
}


// ======================================================
// Plan limits
// ======================================================

const PLAN_LIMITS = {
  monthly: 300, // ₹199 plan
  annual: 300
};

async function checkAndTrackUsage(email, supabaseUrl, supabaseKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&status=eq.active&select=id,plan,unlimited,generations_used,period_start&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!res.ok) return { allowed: true }; // fail open for free/unauthenticated flows

  const rows = await res.json();
  if (!rows.length) return { allowed: true, notSubscribed: true };

  const row = rows[0];
  if (row.unlimited) return { allowed: true };

  const limit = PLAN_LIMITS[row.plan] || 300;
  const periodStart = new Date(row.period_start);
  const now = new Date();
  const daysSince = (now - periodStart) / (1000 * 60 * 60 * 24);

  let used = row.generations_used || 0;
  let newPeriodStart = row.period_start;

  if (daysSince >= 30) {
    used = 0;
    newPeriodStart = now.toISOString();
  }

  if (used >= limit) {
    return { allowed: false, limit };
  }

  // Track this usage
  await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${row.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ generations_used: used + 1, period_start: newPeriodStart })
  });

  return { allowed: true };
}


// ======================================================
// Vercel Serverless Function
// ======================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json(errorResponse("Method not allowed"));
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json(errorResponse("Forbidden"));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey) {
    return res.status(500).json(errorResponse("GEMINI_API_KEY is missing"));
  }

  try {
    const body = req.body || {};
    const errors = validateRequest(body);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const email = await getVerifiedEmail(req, supabaseUrl, supabaseKey);

    if (email && supabaseUrl && supabaseKey) {
      const rateCheck = await checkRateLimit(email, supabaseUrl, supabaseKey);
      if (!rateCheck.allowed) {
        return res.status(429).json(errorResponse(
          `You're generating too quickly. Please wait a minute and try again.`
        ));
      }
    }

    if (email && supabaseUrl && supabaseKey) {
      const usage = await checkAndTrackUsage(email, supabaseUrl, supabaseKey);
      if (!usage.allowed) {
        return res.status(403).json(errorResponse(
          `You've reached your plan's limit of ${usage.limit} generations this month. Upgrade or wait for your next billing cycle.`
        ));
      }
    }

    const rawPlatform = cleanInput(body.platform || "").toLowerCase();
    const platform = PLATFORM_GUIDANCE[rawPlatform] ? rawPlatform : "";

    const product = {
      name: cleanInput(body.name),
      features: cleanInput(body.features),
      tone: cleanInput(body.tone),
      platform
    };

    const prompt = buildPrompt(product);
    const aiText = await callGeminiWithRetry(apiKey, prompt);

    if (!aiText) {
      return res.status(502).json(errorResponse("AI returned empty response"));
    }

    const result = parseAIResponse(aiText);

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json(errorResponse("Something went wrong. Please try again."));
  }
}
