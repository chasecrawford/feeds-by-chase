import 'dotenv/config'

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export const config = {
  hostname: req('FEEDGEN_HOSTNAME'),
  serviceDid: req('FEEDGEN_SERVICE_DID'),
  // The repo (account) that owns the published feed records. Used only to
  // build correct feed AT-URIs in describeFeedGenerator.
  publisherDid: process.env.FEEDGEN_PUBLISHER_DID ?? '',
  port: parseInt(process.env.FEEDGEN_PORT ?? '3020', 10),
  // Bind to localhost by default so only the local reverse proxy (Caddy) can
  // reach it; Caddy is the sole internet-facing process. Set to 0.0.0.0 only
  // if you intentionally want to expose the service directly.
  bindHost: process.env.FEEDGEN_BIND ?? '127.0.0.1',
  sqlitePath: process.env.SQLITE_PATH ?? './feed.sqlite',
  jetstreamEndpoint:
    process.env.JETSTREAM_ENDPOINT ??
    'wss://jetstream2.us-east.bsky.network/subscribe',
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? '7', 10),

  // Publishing only
  blueskyHandle: process.env.BLUESKY_HANDLE ?? '',
  blueskyAppPassword: process.env.BLUESKY_APP_PASSWORD ?? '',
}
