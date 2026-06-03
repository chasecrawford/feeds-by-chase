# louisville-bsky-feed

Self-hosted Bluesky **keyword feed generator** — a replacement for feeds you
built in SkyFeed, running on your own machine and your own domain.

## How it works

```
Bluesky firehose ──(Jetstream)──▶  ingest + keyword match  ──▶  SQLite
                                                                   │
Bluesky app ──getFeedSkeleton──▶  this service  ◀──────────────────┘
```

1. A **Jetstream** consumer streams every new post on the network.
2. Each post is matched against the rules in [`src/feeds.ts`](src/feeds.ts).
   Matches are stored in SQLite (one row per post per feed it matches).
3. When someone opens your feed, Bluesky calls `getFeedSkeleton` and this
   service returns the most recent matching post URIs.
4. A one-time `publish` step registers each feed on your account so it shows
   up in the app.

The matching logic lives in the running service, so **changing keywords only
requires a restart** — you only re-`publish` when you add a feed or rename one.

## Recreating your SkyFeed feeds

SkyFeed has no export, so copy the rules out of its builder:

1. Open <https://skyfeed.app>, sign in, open each feed in the **Builder**.
2. From the **Regex** block, copy the keyword pattern → these become `include`.
3. From any **Remove / blocklist** block, copy the words → these become `exclude`.
4. Note the **language** filter and whether replies/reposts are allowed.
5. Add an entry to `FEEDS` in [`src/feeds.ts`](src/feeds.ts) for each feed.

## Setup

```bash
npm install
cp .env.example .env      # then edit .env
```

Fill in `.env`:

- `FEEDGEN_HOSTNAME` / `FEEDGEN_SERVICE_DID` — your public hostname and
  `did:web:<that hostname>`.
- `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` — for publishing (use an
  **app password**, never your main one).

## Exposing your machine (home-hosted, direct 443 + Caddy)

Bluesky must reach `https://feeds.chasecrawford.dev` from the public internet
with valid TLS. This setup runs everything on your machine behind your Nest
Wifi: **Caddy** terminates HTTPS on port 443 and reverse-proxies to the feed
service on `127.0.0.1:3020` (the feed service itself is localhost-only, so
Caddy is the sole internet-facing process).

Do these **in order** (cert issuance needs `:443` reachable first):

1. **DNS (Route 53):** add a record in your `chasecrawford.dev` hosted zone:

   ```
   feeds.chasecrawford.dev.   CNAME   your-dyndns-host.example.net.
   ```

   Verify: `nslookup feeds.chasecrawford.dev` resolves to your home IP.

2. **Port-forward (Google Home app):** Wifi → Settings → Advanced networking.
   - First **reserve a DHCP IP** for this machine (so it doesn't change).
   - Then **Port management → add**: external TCP **443** → this machine's
     reserved LAN IP, internal port **443**.
   - (Port 80 stays untouched — we use the TLS-ALPN-01 challenge over 443.)

3. **Allow Caddy through Windows Firewall** when prompted (or pre-allow TCP 443
   inbound).

4. **Run Caddy** from this folder, elevated (needed to bind :443):

   ```powershell
   caddy run --config ./Caddyfile
   ```

   On first run it obtains a Let's Encrypt cert via TLS-ALPN-01. Confirm from
   an outside network (e.g. phone on cellular):
   `https://feeds.chasecrawford.dev/.well-known/did.json` should load.

> Get Caddy on Windows: `winget install CaddyServer.Caddy` (or download from
> caddyserver.com). It auto-renews certs.

## Run

```powershell
npm run start      # feed service: ingest + serve on 127.0.0.1:3020
# (run `caddy run --config ./Caddyfile` in a second terminal)
npm run publish    # register feeds on your account (run once, and after adds)
```

Both the feed service and Caddy must stay running. Give the service a few
minutes to accumulate matching posts, then open your feed in the Bluesky app.

## Managing feeds

| Action                    | What to do                                  |
| ------------------------- | ------------------------------------------- |
| Add a feed                | add to `FEEDS`, restart, `npm run publish`  |
| Change keywords           | edit `include`/`exclude`, restart           |
| Rename / change descr.    | edit `feeds.ts`, `npm run publish`          |
| Remove a feed             | `npm run unpublish -- <shortname>`          |

## Notes

- `RETENTION_DAYS` controls how much history is kept; old rows are pruned hourly.
- The Jetstream cursor is saved so a restart resumes near where it left off.
- **Keep it always-on:** both the feed service and Caddy must run 24/7 for the
  feed to work and to avoid ingestion gaps. For unattended operation, run each
  as a Windows service (e.g. `nssm`) or a Task Scheduler task set to run at
  startup, rather than leaving terminals open.
- **Security:** the feed service binds `127.0.0.1` only; Caddy is the lone
  internet-facing process and serves only read-only, public data. Don't add a
  `0.0.0.0` bind or extra forwarded ports.
- This project never touches your existing SkyFeed feeds.
