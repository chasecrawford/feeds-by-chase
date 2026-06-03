import { AtpAgent } from '@atproto/api'
import { config } from '../src/config'
import { FEEDS, FeedDef } from '../src/feeds'

const COLLECTION = 'app.bsky.feed.generator'

/**
 * Publishes feeds defined in src/feeds.ts to your repo.
 *
 *   npm run publish                 -> all feeds
 *   npm run publish -- uofl-football        -> only that feed (by shortname)
 *   npm run publish -- --dry-run            -> show what WOULD change, write nothing
 *   npm run publish -- uofl-football --dry-run
 *
 * For a feed with `rkey` set, this MIGRATES THE EXISTING FEED IN PLACE: it
 * fetches the current record and rewrites only the `did` (pointing it at this
 * self-hosted service) plus displayName/description, while PRESERVING the
 * existing avatar and createdAt. Followers, likes, and the feed URL are kept.
 *
 * For a feed without `rkey`, it creates a brand-new feed under `shortname`.
 *
 * The feed's matching logic lives in the running service, so you only need to
 * publish when adding a feed or changing its name/description/target.
 */

async function login(): Promise<AtpAgent> {
  if (!config.blueskyHandle || !config.blueskyAppPassword) {
    throw new Error(
      'Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in .env before publishing.',
    )
  }
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({
    identifier: config.blueskyHandle,
    password: config.blueskyAppPassword,
  })
  return agent
}

async function publishFeed(
  agent: AtpAgent,
  did: string,
  feed: FeedDef,
  dryRun: boolean,
) {
  const rkey = feed.rkey ?? feed.shortname

  // Fetch any existing record (so we can preserve avatar/createdAt and detect
  // whether this is an in-place migration or a fresh create).
  let prev: Record<string, unknown> = {}
  let prevCid: string | undefined
  let prevDid: string | undefined
  try {
    const res = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
    })
    prev = (res.data.value ?? {}) as Record<string, unknown>
    prevCid = res.data.cid
    prevDid = prev.did as string | undefined
  } catch {
    // no existing record at this rkey -> fresh create
  }

  const isMigration = !!prevCid
  const record: Record<string, unknown> = {
    ...prev, // preserve avatar, $type, any extra fields
    did: config.serviceDid, // <-- repoint to this self-hosted service
    displayName: feed.displayName,
    description: feed.description,
    createdAt: (prev.createdAt as string) ?? new Date().toISOString(),
  }

  const arrow = `at://${did}/${COLLECTION}/${rkey}`
  const avatarNote = prev.avatar ? ', avatar preserved' : ''
  if (dryRun) {
    const what = isMigration
      ? `WOULD MIGRATE (did: ${prevDid} -> ${config.serviceDid}${avatarNote})`
      : `WOULD CREATE new feed`
    console.log(`• ${feed.displayName}\n    ${arrow}\n    ${what}`)
    return
  }

  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
    record,
    ...(prevCid ? { swapRecord: prevCid } : {}),
  })
  const verb = isMigration ? 'migrated' : 'created'
  console.log(`✔ ${verb} "${feed.displayName}" -> ${arrow}${avatarNote}`)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const names = args.filter((a) => !a.startsWith('--'))

  let selected = FEEDS
  if (names.length) {
    selected = FEEDS.filter((f) => names.includes(f.shortname))
    const unknown = names.filter(
      (n) => !FEEDS.some((f) => f.shortname === n),
    )
    if (unknown.length) throw new Error(`Unknown feed(s): ${unknown.join(', ')}`)
  }
  if (!selected.length) throw new Error('No feeds selected.')

  const agent = await login()
  const did = agent.session!.did
  console.log(
    `Logged in as ${config.blueskyHandle} (${did})${dryRun ? '  [DRY RUN]' : ''}\n`,
  )

  for (const feed of selected) {
    await publishFeed(agent, did, feed, dryRun)
  }

  if (dryRun) console.log('\nDry run only — nothing was written.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
