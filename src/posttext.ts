/**
 * Builds the searchable text for a post record. Bluesky posts carry meaningful
 * text beyond the body — most importantly LINK CARD titles/descriptions/URLs
 * (article shares) and image alt text. Matching only `record.text` misses the
 * majority of news/article posts, so we concatenate all of it for matching.
 *
 * Works on the raw app.bsky.feed.post record (same shape from the firehose/
 * Jetstream and from com.atproto getRecord / app.bsky.feed.getPosts).
 */

interface PostRecord {
  text?: string
  embed?: unknown
}

function collectEmbed(embed: unknown, parts: string[]) {
  if (!embed || typeof embed !== 'object') return
  const e = embed as Record<string, any>

  // app.bsky.embed.external — link card
  if (e.external && typeof e.external === 'object') {
    const ext = e.external as Record<string, any>
    if (ext.title) parts.push(String(ext.title))
    if (ext.description) parts.push(String(ext.description))
    // Include only the hostname of the URI — never the path. Path segments can
    // contain author names, article slugs, etc. that accidentally match player
    // surnames or topic keywords (e.g. /autoren/eva-kienholz/ matching \bkienholz\b).
    // Domain-based include patterns (cardchronicle.com) still work; standalone
    // keyword patterns cannot match unintended URL paths.
    if (ext.uri) {
      try {
        parts.push(new URL(String(ext.uri)).hostname)
      } catch {
        // malformed URI — skip entirely rather than risk a path match
      }
    }
  }

  // app.bsky.embed.images — alt text
  if (Array.isArray(e.images)) {
    for (const img of e.images) {
      if (img?.alt) parts.push(String(img.alt))
    }
  }

  // app.bsky.embed.video — alt text
  if (typeof e.alt === 'string') parts.push(e.alt)

  // app.bsky.embed.recordWithMedia — recurse into the media half
  if (e.media) collectEmbed(e.media, parts)
}

export function extractSearchText(record: PostRecord | undefined): string {
  if (!record) return ''
  const parts: string[] = []
  if (record.text) parts.push(record.text)
  collectEmbed(record.embed, parts)
  return parts.join('\n')
}
