#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const siteId = process.env.NETLIFY_SITE_ID || '8f4fc5dd-ae8e-42ca-b58f-178e67da6c12'
const stamp = process.env.BUILD_ID || `review${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}`
const outDir = process.env.REVIEW_DEPLOY_DIR || `/tmp/counteragent-review-${stamp}`

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function sh(command) {
  return execFileSync('sh', ['-c', command], { encoding: 'utf8' }).trim()
}

function loadNetlifyBuildEnv() {
  const authArg = process.env.NETLIFY_AUTH_TOKEN ? ` --auth '${process.env.NETLIFY_AUTH_TOKEN.replace(/'/g, `'\\''`)}'` : ''
  try {
    const output = sh(`netlify env:list --context production --plain${authArg}`)
    const env = {}
    for (const line of output.split('\n')) {
      const index = line.indexOf('=')
      if (index <= 0) continue
      const key = line.slice(0, index)
      const value = line.slice(index + 1)
      if (key.startsWith('NEXT_PUBLIC_')) env[key] = value
    }
    return env
  } catch {
    console.warn('Warning: could not load Netlify production env for local Next build; using current process env only.')
    return {}
  }
}

function copyRoute(src, dst) {
  if (!existsSync(src)) return
  mkdirSync(dst.split('/').slice(0, -1).join('/'), { recursive: true })
  copyFileSync(src, dst)
}

console.log(`Review deploy stamp: ${stamp}`)
rmSync('.next', { recursive: true, force: true })
rmSync(outDir, { recursive: true, force: true })

run('npm', ['run', 'lint'])
const netlifyBuildEnv = loadNetlifyBuildEnv()
run('npm', ['run', 'build'], { env: { ...process.env, ...netlifyBuildEnv, BUILD_ID: stamp } })

mkdirSync(join(outDir, '_next'), { recursive: true })
cpSync('.next/static', join(outDir, '_next/static'), { recursive: true })
if (existsSync('public')) cpSync('public', outDir, { recursive: true })
if (existsSync('netlify/functions')) cpSync('netlify/functions', join(outDir, 'netlify/functions'), { recursive: true })

const appDir = '.next/server/app'
copyRoute(join(appDir, 'index.html'), join(outDir, 'index.html'))
copyRoute(join(appDir, 'settings.html'), join(outDir, 'settings/index.html'))
copyRoute(join(appDir, 'dashboard.html'), join(outDir, 'dashboard/index.html'))
copyRoute(join(appDir, 'analytics.html'), join(outDir, 'analytics/index.html'))
copyRoute(join(appDir, 'alerts.html'), join(outDir, 'alerts/index.html'))
copyRoute(join(appDir, 'onboarding.html'), join(outDir, 'onboarding/index.html'))
copyRoute(join(appDir, '_not-found.html'), join(outDir, '404.html'))

const a0ProxyUrl = process.env.ORCHESTRATOR_URL || process.env.A0_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_A0_URL
writeFileSync(join(outDir, '_redirects'), [
  ...(a0ProxyUrl ? [`/api/a0/* ${a0ProxyUrl.replace(/\/$/, '')}/:splat 200`] : []),
  '/settings /settings/index.html 200',
  '/dashboard /dashboard/index.html 200',
  '/analytics /analytics/index.html 200',
  '/alerts /alerts/index.html 200',
  '/onboarding /onboarding/index.html 200',
  '/* /index.html 200',
  '',
].join('\n'))

writeFileSync(join(outDir, '_headers'), [
  '/*',
  '  Cache-Control: no-cache, no-store, must-revalidate',
  '/_next/static/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n'))

const version = readFileSync('lib/build-info.ts', 'utf8').match(/"version": "([^"]+)"/)?.[1] ?? stamp
console.log(`Built App Version: ${version}`)
console.log(`Deploy dir: ${outDir} (${sh(`du -sh ${outDir} | awk '{print $1}'`)})`)

if (existsSync(join(outDir, 'netlify/functions/a0-proxy.mjs'))) {
  mkdirSync(join(outDir, '.netlify/functions'), { recursive: true })
  copyFileSync(join(outDir, 'netlify/functions/a0-proxy.mjs'), join(outDir, '.netlify/functions/a0-proxy.mjs'))
}

run('netlify', [
  'deploy',
  '--no-build',
  '--prod',
  `--dir=${outDir}`,
  `--site=${siteId}`,
  '--message',
  `Review deploy ${version}`,
  '--timeout',
  '300',
])

for (const path of ['/', '/settings', '/_next/static/chunks/webpack-ddd80003f12cbdaf.js']) {
  const url = `https://counteragent.netlify.app${path}`
  const status = sh(`curl -L -sS -o /dev/null -w '%{http_code} %{content_type}' '${url}'`)
  console.log(`${url} -> ${status}`)
}

console.log(`Done. App Version: ${version}`)
