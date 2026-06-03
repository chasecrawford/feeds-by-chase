import WebSocket from 'ws'
import { config } from './config'
import { matchFeeds } from './matcher'
import { extractSearchText } from './posttext'
import {
  addPostToFeeds,
  deletePost,
  getCursor,
  setCursor,
  pruneOlderThan,
} from './db'

const SERVICE = 'jetstream'
const POST = 'app.bsky.feed.post'

interface JetstreamEvent {
  did: string
  time_us: number
  kind: string
  commit?: {
    operation: 'create' | 'update' | 'delete'
    collection: string
    rkey: string
    record?: {
      text?: string
      langs?: string[]
      reply?: unknown
      embed?: unknown
      createdAt?: string
    }
  }
}

let ws: WebSocket | null = null
let lastSaved = 0

function postUri(did: string, rkey: string): string {
  return `at://${did}/${POST}/${rkey}`
}

function handle(evt: JetstreamEvent) {
  if (evt.kind !== 'commit' || !evt.commit) return
  const c = evt.commit
  if (c.collection !== POST) return

  const uri = postUri(evt.did, c.rkey)

  if (c.operation === 'delete') {
    deletePost(uri)
  } else if (c.record) {
    const feeds = matchFeeds({
      text: extractSearchText(c.record),
      langs: c.record.langs ?? [],
      isReply: !!c.record.reply,
      authorDid: evt.did,
    })
    if (feeds.length) {
      addPostToFeeds(uri, feeds, c.record.createdAt ?? new Date().toISOString())
    }
  }

  // Persist cursor at most ~once/sec so we can resume after a restart.
  if (evt.time_us - lastSaved > 1_000_000) {
    setCursor(SERVICE, evt.time_us)
    lastSaved = evt.time_us
  }
}

function connect() {
  const url = new URL(config.jetstreamEndpoint)
  url.searchParams.set('wantedCollections', POST)
  const cursor = getCursor(SERVICE)
  if (cursor) url.searchParams.set('cursor', String(cursor))

  console.log(`[jetstream] connecting ${url.toString()}`)
  ws = new WebSocket(url.toString())

  ws.on('open', () => console.log('[jetstream] connected'))
  ws.on('message', (data) => {
    try {
      handle(JSON.parse(data.toString()) as JetstreamEvent)
    } catch (err) {
      // skip malformed frame
    }
  })
  ws.on('close', () => {
    console.warn('[jetstream] disconnected, reconnecting in 2s')
    setTimeout(connect, 2000)
  })
  ws.on('error', (err) => {
    console.error('[jetstream] error:', (err as Error).message)
    ws?.close()
  })
}

export function startJetstream() {
  connect()
  // Prune old rows hourly to keep the DB small.
  setInterval(() => {
    const removed = pruneOlderThan(config.retentionDays)
    if (removed) console.log(`[prune] removed ${removed} old rows`)
  }, 3600_000)
}
