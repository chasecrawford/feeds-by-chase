import Database from 'better-sqlite3'
import { config } from './config'

export const db = new Database(config.sqlitePath)
db.pragma('journal_mode = WAL')
// Allow the backfill script and the live service to write concurrently
// without "database is locked" errors.
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS feed_post (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uri        TEXT NOT NULL,
    feed       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(uri, feed)
  );
  CREATE INDEX IF NOT EXISTS idx_feed_post_feed_id ON feed_post(feed, id DESC);

  CREATE TABLE IF NOT EXISTS sub_state (
    service TEXT PRIMARY KEY,
    cursor  INTEGER NOT NULL
  );
`)

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO feed_post (uri, feed, created_at) VALUES (?, ?, ?)`,
)
const insertMany = db.transaction(
  (rows: { uri: string; feed: string; createdAt: string }[]) => {
    for (const r of rows) insertStmt.run(r.uri, r.feed, r.createdAt)
  },
)

export function addPostToFeeds(uri: string, feeds: string[], createdAt: string) {
  if (feeds.length === 0) return
  insertMany(feeds.map((feed) => ({ uri, feed, createdAt })))
}

const deleteStmt = db.prepare(`DELETE FROM feed_post WHERE uri = ?`)
export function deletePost(uri: string) {
  deleteStmt.run(uri)
}

const pageStmt = db.prepare(
  `SELECT id, uri FROM feed_post WHERE feed = ? AND id < ? ORDER BY id DESC LIMIT ?`,
)
const pageFirstStmt = db.prepare(
  `SELECT id, uri FROM feed_post WHERE feed = ? ORDER BY id DESC LIMIT ?`,
)

export interface FeedRow {
  id: number
  uri: string
}

export function getFeedPage(
  feed: string,
  limit: number,
  cursor?: number,
): FeedRow[] {
  if (cursor && Number.isFinite(cursor)) {
    return pageStmt.all(feed, cursor, limit) as FeedRow[]
  }
  return pageFirstStmt.all(feed, limit) as FeedRow[]
}

const getCursorStmt = db.prepare(
  `SELECT cursor FROM sub_state WHERE service = ?`,
)
const setCursorStmt = db.prepare(
  `INSERT INTO sub_state (service, cursor) VALUES (?, ?)
   ON CONFLICT(service) DO UPDATE SET cursor = excluded.cursor`,
)

export function getCursor(service: string): number | undefined {
  const row = getCursorStmt.get(service) as { cursor: number } | undefined
  return row?.cursor
}
export function setCursor(service: string, cursor: number) {
  setCursorStmt.run(service, cursor)
}

export function pruneOlderThan(days: number) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
  const info = db
    .prepare(`DELETE FROM feed_post WHERE created_at < ?`)
    .run(cutoff)
  return info.changes
}
