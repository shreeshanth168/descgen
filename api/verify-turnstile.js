// ======================================================
// Cloudflare Turnstile Verification
// Confirms a widget token is real before allowing signup/login.
// ======================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("Missing TURNSTILE_SECRET_KEY");
    return res.status(500).json({ success: false, error: "Server misconfigured" });
  }

  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing token" });
    }

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });

    const data = await verifyRes.json();

    return res.status(200).json({ success: !!data.success });

  } catch (error) {
    console.error("Turnstile verification error:", error);
    return res.status(500).json({ success: false, error: "Verification failed" });
  }
}
