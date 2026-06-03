import { config } from '../src/config'
import { FEEDS, FeedDef } from '../src/feeds'
import { addPostToFeeds, db } from '../src/db'
import { matchFeeds } from '../src/matcher'
import { extractSearchText } from '../src/posttext'

/**
 * Seeds the local DB with recent posts from a feed's ORIGINAL SkyFeed feed, so
 * a migrated feed isn't empty at cutover. Pulls the skeleton straight from
 * SkyFeed's generator (feeds.skyfeed.eu) by record key — this works even after
 * the feed record has been repointed to us, because SkyFeed still has the
 * algorithm config. Each candidate post is hydrated and run through OUR current
 * matching rules, so only posts that actually belong are inserted.
 *
 *   npm run backfill -- uofl-basketball
 *   npm run backfill -- uofl-football --limit 500
 *   npm run backfill                              # all feeds that have an rkey
 */

const SKYFEED = 'https://feeds.skyfeed.eu'
const APPVIEW = 'https://public.api.bsky.app'

async function resolveDid(): Promise<string> {
  if (config.publisherDid) return config.publisherDid
  const u = new URL('https://bsky.social/xrpc/com.atproto.identity.resolveHandle')
  u.searchParams.set('handle', config.blueskyHandle)
  const r = (await fetch(u).then((x) => x.json())) as { did?: string }
  if (!r.did) throw new Error(`Could not resolve handle ${config.blueskyHandle}`)
  return r.did
}

async function skyfeedSkeleton(feedUri: string, limit: number): Promise<string[]> {
  const uris: string[] = []
  let cursor: string | undefined
  while (uris.length < limit) {
    const u = new URL(`${SKYFEED}/xrpc/app.bsky.feed.getFeedSkeleton`)
    u.searchParams.set('feed', feedUri)
    u.searchParams.set('limit', '100')
    if (cursor) u.searchParams.set('cursor', cursor)
    const r = (await fetch(u).then((x) => x.json())) as {
      feed?: { post?: string }[]
      cursor?: string
    }
    const batch = (r.feed ?? []).map((p) => p.post).filter(Boolean) as string[]
    uris.push(...batch)
    if (!r.cursor || batch.length === 0) break
    cursor = r.cursor
  }
  return uris.slice(0, limit)
}

interface Hydrated {
  uri: string
  text: string
  langs: string[]
  isReply: boolean
  authorDid: string
  createdAt: string
}

async function hydrate(uris: string[]): Promise<Hydrated[]> {
  const out: Hydrated[] = []
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25)
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPosts`)
    chunk.forEach((c) => u.searchParams.append('uris', c))
    const r = (await fetch(u).then((x) => x.json())) as {
      posts?: {
        uri: string
        indexedAt?: string
        author?: { did?: string }
        record?: { text?: string; langs?: string[]; reply?: unknown; createdAt?: string }
      }[]
    }
    for (const p of r.posts ?? []) {
      out.push({
        uri: p.uri,
        text: extractSearchText(p.record),
        langs: p.record?.langs ?? [],
        isReply: !!p.record?.reply,
        authorDid: p.author?.did ?? '',
        createdAt: p.record?.createdAt ?? p.indexedAt ?? new Date().toISOString(),
      })
    }
  }
  return out
}

async function backfillFeed(feed: FeedDef, did: string, limit: number) {
  if (!feed.rkey) {
    console.log(`- ${feed.shortname}: no rkey (new feed) — nothing to backfill`)
    return
  }
  const sourceUri = `at://${did}/app.bsky.feed.generator/${feed.rkey}`
  console.log(`• ${feed.shortname}: reading SkyFeed source ${sourceUri}`)
  const uris = await skyfeedSkeleton(sourceUri, limit)
  const posts = await hydrate(uris)
  // keep only posts that pass our CURRENT rules
  const matched = posts.filter((p) =>
    matchFeeds({
      text: p.text,
      langs: p.langs,
      isReply: p.isReply,
      authorDid: p.authorDid,
    }).includes(feed.shortname),
  )
  matched.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // oldest first
  const before = (
    db.prepare('SELECT COUNT(*) c FROM feed_post WHERE feed = ?').get(feed.shortname) as { c: number }
  ).c
  for (const p of matched) addPostToFeeds(p.uri, [feed.shortname], p.createdAt)
  const after = (
    db.prepare('SELECT COUNT(*) c FROM feed_post WHERE feed = ?').get(feed.shortname) as { c: number }
  ).c
  console.log(
    `  candidates ${uris.length}, matched-our-rules ${matched.length}; feed rows ${before} -> ${after} (+${after - before})`,
  )
}

async function main() {
  const args = process.argv.slice(2)
  const limitArg = args.indexOf('--limit')
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) || 300 : 300
  const names = args.filter((a) => !a.startsWith('--') && a !== String(limit))

  let selected = FEEDS.filter((f) => f.rkey)
  if (names.length) selected = FEEDS.filter((f) => names.includes(f.shortname))
  if (!selected.length) throw new Error('No matching feeds to backfill.')

  const did = await resolveDid()
  console.log(`Source repo: ${did}, limit=${limit}\n`)
  for (const feed of selected) await backfillFeed(feed, did, limit)
  console.log('\nBackfill complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
