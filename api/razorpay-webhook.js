// ======================================================
// Razorpay Webhook Handler
// Razorpay's own servers call this directly when a payment
// succeeds — this cannot be faked by a user's browser.
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
    const event = req.body;

    // Only act on successful payment events
    if (event.event !== "payment_link.paid" && event.event !== "payment.captured") {
      return res.status(200).json({ received: true, skipped: true });
    }

    const payment = event.payload?.payment?.entity || {};
    const paymentId = payment.id || "";
    const email = payment.email || event.payload?.payment_link?.entity?.customer?.email || "";
    const amount = payment.amount || 0; // in paise

    if (!paymentId || !email) {
      console.error("Webhook missing required fields", { paymentId, email });
      return res.status(400).json({ error: "Missing payment id or email" });
    }

    // Determine plan from amount (₹199 = 19900 paise, ₹1999 = 199900 paise)
    let plan = "monthly";
    if (amount >= 199900) plan = "annual";

    // Write to Supabase
    const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        payment_id: paymentId,
        plan,
        status: "active"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Supabase insert failed:", errText);
      return res.status(500).json({ error: "Failed to record subscription" });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
