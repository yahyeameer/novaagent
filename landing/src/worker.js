// NOVA marketing site: serves the landing page and stores contact / demo requests in KV.
import html from "../public/index.html";

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const INTERESTS = new Set(["demo", "pilot", "partner", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = 5; // submissions per IP per 10 minutes

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS },
  });
}

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function handleContact(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, error: "Cross-origin requests are not allowed." }, 403);
  }
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json({ ok: false, error: "Expected JSON." }, 415);
  }
  if (Number(request.headers.get("Content-Length") || 0) > 16_000) {
    return json({ ok: false, error: "Request too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  // Honeypot: bots fill the hidden field. Pretend success so they move on.
  if (clean(body.website, 200)) return json({ ok: true });

  const lead = {
    interest: INTERESTS.has(body.interest) ? body.interest : "other",
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    company: clean(body.company, 160),
    role: clean(body.role, 120),
    size: clean(body.size, 40),
    message: clean(body.message, 4000),
  };
  if (!lead.name || !lead.company) return json({ ok: false, error: "Please add your name and company." }, 422);
  if (!EMAIL_RE.test(lead.email)) return json({ ok: false, error: "Please enter a valid work email." }, 422);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `rl:${ip}`;
  const count = Number((await env.LEADS.get(rlKey)) || 0);
  if (count >= RATE_LIMIT) {
    return json({ ok: false, error: "Too many requests. Please try again in a few minutes." }, 429);
  }
  await env.LEADS.put(rlKey, String(count + 1), { expirationTtl: 600 });

  const now = new Date();
  const id = `lead:${now.toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    ...lead,
    received_at: now.toISOString(),
    country: request.cf?.country || null,
    user_agent: clean(request.headers.get("User-Agent") || "", 300),
  };
  await env.LEADS.put(id, JSON.stringify(record), {
    metadata: { name: lead.name, email: lead.email, company: lead.company, interest: lead.interest },
  });

  return json({ ok: true, id });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      try {
        return await handleContact(request, env);
      } catch (err) {
        console.error("contact failed", err);
        return json({ ok: false, error: "We couldn't save your request. Please try again." }, 500);
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: SECURITY_HEADERS });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", ...SECURITY_HEADERS },
      });
    }

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain" } });
    }

    return Response.redirect(`${url.origin}/`, 302);
  },
};
