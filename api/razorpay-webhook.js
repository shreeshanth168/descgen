// ======================================================
// Razorpay Webhook Handler (signature-verified)
// Only requests carrying a valid HMAC signature from Razorpay
// are trusted — anything else is rejected outright.
// ======================================================

import crypto from "crypto";

// Vercel normally parses the JSON body automatically, but signature
// verification requires the exact raw bytes Razorpay signed — so we
// disable the automatic parser and read the raw body ourselves.
export const config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false; // lengths differ, definitely not a match
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!webhookSecret || !supabaseUrl || !supabaseKey) {
    console.error("Missing required environment variables");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  if (!isValidSignature(rawBody, signature, webhookSecret)) {
    console.error("Webhook signature verification FAILED — request rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const event = JSON.parse(rawBody);

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

    let plan = "monthly";
    if (amount >= 199900) plan = "annual";

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
