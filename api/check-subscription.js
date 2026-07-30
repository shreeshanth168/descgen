// ======================================================
// Check Subscription Status
// Looks up the database (not the browser) to confirm
// whether an email has a real, verified paid subscription.
// ======================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
      `${supabaseUrl}/rest/v1/subscriptions?email=eq.${encodeURIComponent(cleanEmail)}&status=eq.active&select=plan&limit=1`,
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
      plan: subscribed ? rows[0].plan : null
    });

  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ subscribed: false });
  }
}
