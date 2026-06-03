import { AtpAgent } from '@atproto/api'
import { config } from '../src/config'

/**
 * Removes a published feed record from your repo.
 * Usage:  npm run unpublish -- <shortname>
 * This does NOT touch the SkyFeed feeds — only feeds published by this project.
 */
async function main() {
  const shortname = process.argv[2]
  if (!shortname) {
    throw new Error('Usage: npm run unpublish -- <shortname>')
  }
  if (!config.blueskyHandle || !config.blueskyAppPassword) {
    throw new Error('Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in .env.')
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({
    identifier: config.blueskyHandle,
    password: config.blueskyAppPassword,
  })

  await agent.com.atproto.repo.deleteRecord({
    repo: agent.session!.did,
    collection: 'app.bsky.feed.generator',
    rkey: shortname,
  })
  console.log(`✔ unpublished feed "${shortname}"`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
