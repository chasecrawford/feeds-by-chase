import express from 'express'
import { config } from './config'
import { FEEDS } from './feeds'
import { FEED_KEY_TO_SHORTNAME } from './matcher'
import { getFeedPage } from './db'

// The publisher (record owner) DID; falls back to the service DID only for
// building informational URIs in describeFeedGenerator.
const publisherDid = config.publisherDid || config.serviceDid

// Trailing record key of a feed AT-URI: at://<did>/app.bsky.feed.generator/<rkey>
function rkeyFromFeedUri(feed: string): string | null {
  const m = feed.match(/app\.bsky\.feed\.generator\/([^/]+)$/)
  return m ? m[1] : null
}

export function createServer() {
  const app = express()

  app.get('/health', (_req, res) => res.json({ ok: true }))

  // did:web document so Bluesky can resolve this service's DID.
  app.get('/.well-known/did.json', (_req, res) => {
    res.json({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: config.serviceDid,
      service: [
        {
          id: '#bsky_fg',
          type: 'BskyFeedGenerator',
          serviceEndpoint: `https://${config.hostname}`,
        },
      ],
    })
  })

  app.get('/xrpc/app.bsky.feed.describeFeedGenerator', (_req, res) => {
    res.json({
      did: config.serviceDid,
      feeds: FEEDS.map((f) => ({
        uri: `at://${publisherDid}/app.bsky.feed.generator/${f.rkey ?? f.shortname}`,
      })),
    })
  })

  app.get('/xrpc/app.bsky.feed.getFeedSkeleton', (req, res) => {
    const feedParam = String(req.query.feed ?? '')
    const key = rkeyFromFeedUri(feedParam)
    const shortname = key ? FEED_KEY_TO_SHORTNAME.get(key) : undefined
    if (!shortname) {
      return res
        .status(400)
        .json({ error: 'UnknownFeed', message: 'Unknown feed' })
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1),
      100,
    )
    const cursorParam = req.query.cursor
      ? parseInt(String(req.query.cursor), 10)
      : undefined

    const rows = getFeedPage(shortname, limit, cursorParam)
    const feed = rows.map((r) => ({ post: r.uri }))
    const cursor =
      rows.length === limit ? String(rows[rows.length - 1].id) : undefined

    res.json({ cursor, feed })
  })

  return app
}
