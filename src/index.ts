import { config } from './config'
import { createServer } from './server'
import { startJetstream } from './jetstream'
import { startBlocklists } from './blocklists'
import './db' // initialize schema
import { FEEDS } from './feeds'

async function main() {
  console.log(
    `[feedgen] starting — ${FEEDS.length} feed(s): ${FEEDS.map((f) => f.shortname).join(', ')}`,
  )

  await startBlocklists()
  startJetstream()

  const app = createServer()
  app.listen(config.port, config.bindHost, () => {
    console.log(
      `[feedgen] listening on http://${config.bindHost}:${config.port}`,
    )
    console.log(`[feedgen] service DID: ${config.serviceDid}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
