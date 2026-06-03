import { FEEDS } from './feeds'

const APPVIEW = 'https://public.api.bsky.app'
const REFRESH_MS = 30 * 60 * 1000

// listUri -> set of member author DIDs
const sets = new Map<string, Set<string>>()

function allListUris(): string[] {
  const s = new Set<string>()
  for (const f of FEEDS) for (const u of f.blockLists ?? []) s.add(u)
  return [...s]
}

async function fetchList(uri: string): Promise<Set<string>> {
  const dids = new Set<string>()
  let cursor: string | undefined
  do {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.graph.getList`)
    u.searchParams.set('list', uri)
    u.searchParams.set('limit', '100')
    if (cursor) u.searchParams.set('cursor', cursor)
    const r = (await fetch(u).then((x) => x.json())) as {
      items?: { subject?: { did?: string } }[]
      cursor?: string
    }
    for (const it of r.items ?? []) {
      if (it.subject?.did) dids.add(it.subject.did)
    }
    cursor = r.cursor
  } while (cursor)
  return dids
}

async function refresh() {
  for (const uri of allListUris()) {
    try {
      const dids = await fetchList(uri)
      sets.set(uri, dids)
      console.log(`[blocklist] ${uri} -> ${dids.size} authors`)
    } catch (e) {
      console.error(`[blocklist] failed ${uri}:`, (e as Error).message)
    }
  }
}

export function isAuthorBlocked(
  listUris: string[] | undefined,
  did: string,
): boolean {
  if (!listUris || listUris.length === 0) return false
  for (const u of listUris) {
    if (sets.get(u)?.has(did)) return true
  }
  return false
}

export async function startBlocklists() {
  if (allListUris().length === 0) return
  await refresh()
  setInterval(() => {
    void refresh()
  }, REFRESH_MS)
}
