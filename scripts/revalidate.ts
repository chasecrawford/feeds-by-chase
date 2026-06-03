import { FEEDS } from '../src/feeds'
import { db } from '../src/db'
import { matchFeeds } from '../src/matcher'
import { extractSearchText } from '../src/posttext'

/**
 * Re-checks every post stored for a feed against the CURRENT matching rules in
 * feeds.ts and removes any that no longer qualify. Useful after changing a
 * feed's keywords/regex (or after a backfill that seeded posts under different
 * rules — e.g. a now-removed player name).
 *
 *   npm run revalidate -- uofl-basketball
 *   npm run revalidate                       # all feeds with stored rows
 *
 * Reads only public data. Posts the AppView no longer returns (deleted) are
 * left alone (the app drops them on hydration anyway); only posts that are
 * confirmed to no longer match are removed.
 */

const APPVIEW = 'https://public.api.bsky.app'

interface HydratedPost {
  uri: string
  text: string
  langs: string[]
  isReply: boolean
  authorDid: string
}

async function hydrate(uris: string[]): Promise<Map<string, HydratedPost>> {
  const out = new Map<string, HydratedPost>()
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25)
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPosts`)
    chunk.forEach((c) => u.searchParams.append('uris', c))
    const r = (await fetch(u).then((x) => x.json())) as {
      posts?: {
        uri: string
        author?: { did?: string }
        record?: { text?: string; langs?: string[]; reply?: unknown }
      }[]
    }
    for (const p of r.posts ?? []) {
      out.set(p.uri, {
        uri: p.uri,
        text: extractSearchText(p.record),
        langs: p.record?.langs ?? [],
        isReply: !!p.record?.reply,
        authorDid: p.author?.did ?? '',
      })
    }
  }
  return out
}

async function revalidateFeed(shortname: string) {
  const rows = db
    .prepare('SELECT uri FROM feed_post WHERE feed = ?')
    .all(shortname) as { uri: string }[]
  const uris = rows.map((r) => r.uri)
  if (!uris.length) {
    console.log(`• ${shortname}: no stored rows`)
    return
  }
  const posts = await hydrate(uris)
  const del = db.prepare('DELETE FROM feed_post WHERE uri = ? AND feed = ?')
  let removed = 0
  let missing = 0
  for (const uri of uris) {
    const p = posts.get(uri)
    if (!p) {
      missing++
      continue // not returned (deleted/unavailable) — leave it
    }
    const matches = matchFeeds({
      text: p.text,
      langs: p.langs,
      isReply: p.isReply,
      authorDid: p.authorDid,
    })
    if (!matches.includes(shortname)) {
      del.run(uri, shortname)
      removed++
    }
  }
  console.log(
    `• ${shortname}: checked ${uris.length}, removed ${removed} no-longer-matching` +
      (missing ? `, ${missing} unavailable (left)` : ''),
  )
}

async function main() {
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  let selected = FEEDS.map((f) => f.shortname)
  if (names.length) selected = names

  for (const s of selected) await revalidateFeed(s)
  console.log('\nRevalidate complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
