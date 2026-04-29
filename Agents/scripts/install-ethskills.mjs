#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const agentsRoot = path.join(repoRoot, 'Agents')
const manifestPath = path.join(agentsRoot, 'ethskills.manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

function usage() {
  console.log(`Usage:
  node Agents/scripts/install-ethskills.mjs --agent A0-Orchestrator
  node Agents/scripts/install-ethskills.mjs --skills frontend-ux,wallets,l2s
  node Agents/scripts/install-ethskills.mjs --agent A3-Execution --dry-run

Installs selected ETHSkills into Agents/.ethskills/<skill>/SKILL.md.
Do not install the full catalog unless the task explicitly needs it.`)
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.length === 0) {
  usage()
  process.exit(args.length === 0 ? 1 : 0)
}

const dryRun = args.includes('--dry-run')
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const agent = getArg('--agent')
const explicitSkills = getArg('--skills')
let skills = []

if (agent) {
  skills = manifest.agents[agent]
  if (!skills) {
    console.error(`Unknown agent "${agent}". Known agents: ${Object.keys(manifest.agents).join(', ')}`)
    process.exit(1)
  }
}

if (explicitSkills) {
  skills.push(...explicitSkills.split(',').map((s) => s.trim()).filter(Boolean))
}

skills = [...new Set(skills)]
if (skills.length === 0) {
  console.error('No skills selected. Use --agent or --skills.')
  process.exit(1)
}

for (const skill of skills) {
  if (!manifest.skills[skill]) {
    console.error(`Unknown/unapproved skill "${skill}". Add it to Agents/ethskills.manifest.json first.`)
    process.exit(1)
  }
}

console.log(`Selected ETHSkills: ${skills.join(', ')}`)
if (dryRun) process.exit(0)

const outRoot = path.join(agentsRoot, '.ethskills')
await mkdir(outRoot, { recursive: true })

for (const skill of skills) {
  const url = `${manifest.source}/${skill}/SKILL.md`
  const res = await fetch(url, { headers: { 'user-agent': 'CounterAgent-ethskills-installer/1.0' } })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
  const text = await res.text()
  const dir = path.join(outRoot, skill)
  await mkdir(dir, { recursive: true })
  const body = `<!-- Vendored from ${url}. Refresh with Agents/scripts/install-ethskills.mjs. -->\n\n${text}`
  await writeFile(path.join(dir, 'SKILL.md'), body)
  console.log(`Installed ${skill} -> ${path.relative(repoRoot, path.join(dir, 'SKILL.md'))}`)
}

const gitignore = path.join(outRoot, '.gitignore')
if (!existsSync(gitignore)) {
  await writeFile(gitignore, '# ETHSkills are fetched on demand; commit only if intentionally vendoring for a release.\n*\n!.gitignore\n')
}
