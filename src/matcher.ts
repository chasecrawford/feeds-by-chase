import { FEEDS, FeedDef } from './feeds'
import { isAuthorBlocked } from './blocklists'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a regex from a keyword list (convenience mode).
 * - "#tag" terms must appear as a hashtag.
 * - plain terms use word boundaries so "lou" doesn't match "clout".
 */
function buildFromKeywords(terms: string[]): RegExp | null {
  const parts = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) =>
      t.startsWith('#')
        ? `#${escapeRegex(t.slice(1))}\\b`
        : `\\b${escapeRegex(t)}\\b`,
    )
  if (parts.length === 0) return null
  return new RegExp(`(?:${parts.join('|')})`, 'i')
}

function compileSide(
  rawRegex: string | undefined,
  keywords: string[] | undefined,
  flags: string,
): RegExp | null {
  if (rawRegex) return new RegExp(rawRegex, flags)
  return buildFromKeywords(keywords ?? [])
}

interface CompiledFeed {
  def: FeedDef
  include: RegExp | null
  exclude: RegExp | null
  langs: Set<string> | null
}

const compiled: CompiledFeed[] = FEEDS.map((def) => {
  const flags = def.regexFlags ?? 'is'
  return {
    def,
    include: compileSide(def.includeRegex, def.include, flags),
    exclude: compileSide(def.excludeRegex, def.exclude, flags),
    langs: def.langs && def.langs.length ? new Set(def.langs) : null,
  }
})

export interface PostInput {
  text: string
  langs: string[]
  isReply: boolean
  authorDid: string
}

/** Return the shortnames of every feed this post belongs to. */
export function matchFeeds(post: PostInput): string[] {
  const text = post.text ?? ''
  if (!text) return []
  const matches: string[] = []
  for (const c of compiled) {
    if (!c.include) continue
    // Language filter: only drop posts that EXPLICITLY declare languages, none
    // of which are wanted. Posts with no language tag (very common) pass — a
    // missing tag must not be treated as "not English".
    if (c.langs && post.langs.length) {
      const ok = post.langs.some((l) => c.langs!.has(l.split('-')[0]))
      if (!ok) continue
    }
    if (!c.def.allowReplies && post.isReply) continue
    if (!c.include.test(text)) continue
    if (c.exclude && c.exclude.test(text)) continue
    if (isAuthorBlocked(c.def.blockLists, post.authorDid)) continue
    matches.push(c.def.shortname)
  }
  return matches
}

export const FEED_SHORTNAMES = new Set(FEEDS.map((f) => f.shortname))

// Resolve an incoming feed record key (the trailing segment of the feed
// AT-URI) to the feed's shortname, which is how rows are keyed in the DB.
// A migrated feed is served at its original rkey (e.g. aaaps4w6ssniy) while a
// brand-new feed is served at its shortname, so we accept both.
export const FEED_KEY_TO_SHORTNAME = new Map<string, string>()
for (const f of FEEDS) {
  FEED_KEY_TO_SHORTNAME.set(f.shortname, f.shortname)
  if (f.rkey) FEED_KEY_TO_SHORTNAME.set(f.rkey, f.shortname)
}
