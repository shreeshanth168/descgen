// ======================================================
// Check Subscription Status
// Looks up the database (not the browser) to confirm
// whether an email has a real, verified paid subscription.
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const { email } = req.body || {};
    if (!email || !email.trim()) {
      return res.status(400).json({ subscribed: false });
    }

    const cleanEmail = email.toLowerCase().trim();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?email=eq.${encodeURIComponent(cleanEmail)}&status=eq.active&select=plan,unlimited,generations_used&limit=1`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      console.error("Supabase lookup failed:", await response.text());
      return res.status(500).json({ subscribed: false });
    }

    const rows = await response.json();
    const subscribed = Array.isArray(rows) && rows.length > 0;

    return res.status(200).json({
      subscribed,
      plan: subscribed ? rows[0].plan : null,
      unlimited: subscribed ? !!rows[0].unlimited : false,
      generationsUsed: subscribed ? (rows[0].generations_used || 0) : 0,
      limit: subscribed ? 300 : 0
    });

  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ subscribed: false });
  }
}
