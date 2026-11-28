import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

// The status checks that branch protection requires on `main` (Settings → Branches), by exact
// name. They are the `name:` of the jobs in ci.yml. CodeQL (codeql.yml) is not required.
// To compare with the live rules:
//   gh api repos/joeran-kuschel/watchlist-roulette/branches/main/protection --jq '.required_status_checks.contexts'
const REQUIRED_CHECKS = ['Docker images', 'Backend (Node 26)', 'Frontend (Node 26)']
// Jobs of ci.yml that are deliberately not required (job key → reason). None for now.
const NOT_REQUIRED: Record<string, string> = {}

const root = join(import.meta.dirname, '../..')
const workflow = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')) as {
  on: { pull_request?: { paths?: unknown; 'paths-ignore'?: unknown } | null }
  jobs: Record<string, { name?: string; strategy?: unknown; uses?: string }>
}
// A job without `name:` reports under its key
const jobNames = Object.entries(workflow.jobs).map(([key, job]) => ({
  key,
  name: job.name ?? key,
}))

const hint =
  'Update REQUIRED_CHECKS in backend/tests/ci-required-checks.test.ts AND the required status ' +
  'checks of `main` under Settings → Branches (see documentation/backend/ci.md).'

describe('CI job names and the required checks of main', () => {
  it.each(REQUIRED_CHECKS)('has a job named "%s"', (required) => {
    const names = jobNames.map((job) => job.name)
    expect(names, `No job in ci.yml is named "${required}". ${hint}`).toContain(required)
  })

  it('has no job that is neither required nor marked as not required', () => {
    const unlisted = jobNames.filter(
      (job) => !REQUIRED_CHECKS.includes(job.name) && !(job.key in NOT_REQUIRED),
    )
    expect(
      unlisted.map((job) => job.name),
      `These jobs are not in REQUIRED_CHECKS or NOT_REQUIRED. ${hint}`,
    ).toEqual([])
  })

  it('lists every required check once', () => {
    expect(new Set(REQUIRED_CHECKS).size).toBe(REQUIRED_CHECKS.length)
  })

  it('has at least one job', () => {
    expect(jobNames.length).toBeGreaterThan(0)
  })

  it('gives every job a unique name', () => {
    const names = jobNames.map((job) => job.name)
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([])
  })

  it('gives every job a literal name without expressions or surrounding spaces', () => {
    // `${{ matrix.node }}` in a name is resolved by GitHub, so the literal text would not match
    const odd = jobNames.filter((job) => job.name.includes('${{') || job.name !== job.name.trim())
    expect(odd.map((job) => job.name)).toEqual([])
  })

  it('names every job explicitly, so the check name does not fall back to the job key', () => {
    const unnamed = Object.entries(workflow.jobs).filter(([, job]) => !job.name)
    expect(unnamed.map(([key]) => key)).toEqual([])
  })

  it('has no matrix or reusable-workflow job, whose check names differ from the job name', () => {
    const special = Object.entries(workflow.jobs).filter(([, job]) => job.strategy || job.uses)
    expect(special.map(([key]) => key)).toEqual([])
  })

  it('only marks existing jobs as not required, and never a required one', () => {
    const keys = jobNames.map((job) => job.key)
    for (const key of Object.keys(NOT_REQUIRED)) {
      expect(keys).toContain(key)
      expect(REQUIRED_CHECKS).not.toContain(jobNames.find((job) => job.key === key)?.name)
    }
  })

  it('runs on every pull request, without a paths filter that would leave a required check pending', () => {
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.on.pull_request?.paths).toBeUndefined()
    expect(workflow.on.pull_request?.['paths-ignore']).toBeUndefined()
  })
})
