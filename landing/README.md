# NOVA landing page

The public marketing site for NOVA: what it is, how it works, the trust model, plans, and a
contact / demo request form. One Cloudflare Worker serves everything.

```
landing/
  public/index.html     the whole page (inline CSS and JS, no build step)
  public/img/*.webp     Control Center screenshots, resized from docs/assets
  src/worker.js         serves the page and images, handles POST /api/contact
  wrangler.toml         Worker config and the LEADS KV binding
```

## Run locally

```bash
cd landing
npm install
npx wrangler dev        # http://localhost:8787
```

## Deploy

```bash
npx wrangler login
npx wrangler deploy
```

The `LEADS` KV namespace (`nova-landing-leads`) already exists in the account. To deploy into a
different account, create one with `npx wrangler kv namespace create LEADS` and put its id in
`wrangler.toml`.

## Contact form

`POST /api/contact` takes JSON `{interest, name, email, company, role, size, message}`.

- Validates required fields and email shape, caps every field's length.
- Rejects cross-origin posts and bodies over 16 KB.
- Hidden honeypot field (`website`) silently drops bots.
- Rate limit: 5 submissions per IP per 10 minutes.

Each lead is stored in KV under `lead:<ISO timestamp>:<id>` with name, email, company and
interest in the key's metadata, so the list view is readable without opening each entry.

**Reading leads:** Cloudflare dashboard → Storage & Databases → KV → `nova-landing-leads`, or

```bash
npx wrangler kv key list --binding LEADS --prefix lead:
npx wrangler kv key get --binding LEADS "lead:2026-11-18T22:50:00.000Z:abcd1234"
```
