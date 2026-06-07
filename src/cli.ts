#!/usr/bin/env node
/**
 * threshold-registry — print the readable capability registry.
 *
 * The CLI face of listCapabilities()/registryMarkdown(): the answer to
 * "what already exists, so I don't build it twice?" for both humans and
 * coding agents.
 *
 * Usage:
 *   THRESHOLD_TOKEN=thld_... npx threshold-registry           # markdown digest
 *   THRESHOLD_TOKEN=thld_... npx threshold-registry --json    # raw normalized JSON
 *   THRESHOLD_TOKEN=thld_... npx threshold-registry --base-url http://localhost:8787
 *
 * Paste the markdown output into a project's CLAUDE.md so agents check the
 * registry before scaffolding anything new.
 */

import { listCapabilities, registryMarkdown } from './capability.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'threshold-registry — print your Threshold capability registry',
        '',
        'Auth: set THRESHOLD_TOKEN (app token or Clerk JWT).',
        '',
        'Flags:',
        '  --json              raw normalized JSON instead of markdown',
        '  --base-url <url>    override https://thresholdlabs.io',
        '  -h, --help          this message',
      ].join('\n')
    )
    return
  }

  const token = process.env.THRESHOLD_TOKEN || process.env.THRESHOLD_JWT
  if (!token) {
    console.error('threshold-registry: set THRESHOLD_TOKEN (app token or Clerk JWT) and re-run.')
    process.exit(1)
  }

  const baseUrlIdx = args.indexOf('--base-url')
  const baseUrl = baseUrlIdx !== -1 ? args[baseUrlIdx + 1] : undefined

  const caps = await listCapabilities({ token, baseUrl })

  if (args.includes('--json')) {
    console.log(JSON.stringify(caps, null, 2))
    return
  }

  console.log(registryMarkdown(caps))
}

main().catch((err: unknown) => {
  console.error(`threshold-registry: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
