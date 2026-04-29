import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

function safe(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const commit = (process.env.COMMIT_REF || safe('git rev-parse HEAD') || 'unknown').slice(0, 40)
const shortCommit = commit === 'unknown' ? 'unknown' : commit.slice(0, 7)
const branch = process.env.BRANCH || safe('git rev-parse --abbrev-ref HEAD') || 'unknown'
const builtAt = new Date().toISOString()
const version = `ca-${shortCommit}`

mkdirSync('lib', { recursive: true })
writeFileSync(
  'lib/build-info.ts',
  `export const buildInfo = ${JSON.stringify({ version, commit, shortCommit, branch, builtAt }, null, 2)} as const\n`
)
console.log(`Wrote build info ${version} (${branch})`)
