import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const workflows = ['kounta-live-sales.yml', 'kounta-sync.yml'].map(name => ({
  name,
  source: readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'),
}))

// Execute the actual workflow Bash, rather than a second implementation of it.
function scriptsNamed(source, name) {
  const lines = source.split('\n')
  const scripts = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== `      - name: ${name}`) continue
    while (++i < lines.length && !lines[i].startsWith('      - ')) {
      if (lines[i] !== '        run: |') continue
      const script = []
      while (++i < lines.length && (lines[i].startsWith('          ') || lines[i] === '')) {
        script.push(lines[i].slice(10))
      }
      scripts.push(script.join('\n'))
      i--
      break
    }
  }
  return scripts
}

function bash(script, env = {}) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 5_000,
  })
}

describe.each(workflows)('$name import setup', ({ source }) => {
  const preflights = scriptsNamed(source, 'Check import configuration')
  const required = ['KOUNTA_USER', 'KOUNTA_PASS', 'IMPORT_SECRET', 'APP_URL']

  it('uses a supported runner and leaves running monitors uncancelled', () => {
    const runners = [...source.matchAll(/^    runs-on: (.+)$/gm)].map(match => match[1])
    expect(runners.length).toBeGreaterThan(0)
    expect(runners.every(runner => runner === 'ubuntu-24.04')).toBe(true)
    expect(source).toContain('cancel-in-progress: false')
    expect(preflights).toHaveLength(runners.length)
  })

  it.each(required)('fails when %s is missing instead of reporting a successful skip', missing => {
    const directory = mkdtempSync(join(tmpdir(), 'kounta-preflight-'))
    try {
      for (const script of preflights) {
        const env = Object.fromEntries(required.map(name => [name, `private-${name}`]))
        delete env[missing]
        const result = bash(script, { ...env, GITHUB_OUTPUT: join(directory, 'output') })
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(`::error::Missing required import configuration: ${missing}`)
        expect(result.stdout).not.toContain('ready=true')
        expect(result.stderr).not.toContain('private-')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('accepts literal secret metacharacters without evaluating or printing them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kounta-preflight-'))
    try {
      for (const [index, script] of preflights.entries()) {
        expect(script).not.toContain('${{')
        const output = join(directory, `output-${index}`)
        const result = bash(script, {
          KOUNTA_USER: 'private-user',
          KOUNTA_PASS: 'private-"; $(exit 17) `exit 19`',
          IMPORT_SECRET: 'private-import-secret',
          APP_URL: 'https://example.invalid',
          GITHUB_OUTPUT: output,
        })
        expect(result.status).toBe(0)
        expect(readFileSync(output, 'utf8')).toBe('ready=true\n')
        expect(`${result.stdout}${result.stderr}`).not.toContain('private-')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  describe.each([
    ['Install deps', 'npm'],
    ['Install Chromium', 'npx'],
  ])('%s', (name, command) => {
    const scripts = scriptsNamed(source, name)
    function run(script, failures) {
      return bash(`
        attempts=0
        sleep() { echo "delay:$1"; }
        ${command}() {
          attempts=$((attempts + 1))
          echo "attempt:$attempts"
          [ "$attempts" -gt "$FAILURES" ]
        }
        ${script}
      `, { FAILURES: String(failures) })
    }

    it('does not retry an immediate success', () => {
      expect(scripts).toHaveLength(preflights.length)
      for (const script of scripts) {
        const result = run(script, 0)
        expect(result.status).toBe(0)
        expect(result.stdout.match(/attempt:\d/g)).toEqual(['attempt:1'])
        expect(result.stdout).not.toContain('delay:')
      }
    })

    it('recovers after two transient setup failures', () => {
      for (const script of scripts) {
        const result = run(script, 2)
        expect(result.status).toBe(0)
        expect(result.stdout.match(/attempt:\d/g)).toEqual(['attempt:1', 'attempt:2', 'attempt:3'])
        expect(result.stdout.match(/delay:\d+/g)).toEqual(['delay:10', 'delay:20'])
      }
    })

    it('fails after three attempts without an unbounded retry loop', () => {
      for (const script of scripts) {
        const result = run(script, 3)
        expect(result.status).toBe(1)
        expect(result.stdout.match(/attempt:\d/g)).toEqual(['attempt:1', 'attempt:2', 'attempt:3'])
        expect(result.stderr).toContain('failed after three attempts')
        expect(result.stdout.match(/delay:\d+/g)).toEqual(['delay:10', 'delay:20'])
      }
    })
  })
})

it('keeps cancelled monitors from spawning successors and backs off failed chains', () => {
  const live = workflows.find(workflow => workflow.name === 'kounta-live-sales.yml').source
  expect(live).toContain("if: ${{ !cancelled() && steps.pre.outputs.ready == 'true' }}")
  expect(live).toContain('sleep 300')
  expect(live).toContain("format('kounta-live-sales-manual-{0}', github.run_id)")
})

describe('monitor successor timing', () => {
  const live = workflows.find(workflow => workflow.name === 'kounta-live-sales.yml').source
  const [script] = scriptsNamed(live, 'Continue live monitor during trading')

  function continueMonitor(minute, afterBackoff, outcome = 'failure') {
    return bash(`
      node() { printf '%s' "$BRISBANE_MINUTE"; }
      sleep() { echo "delay:$1"; BRISBANE_MINUTE="$AFTER_BACKOFF"; }
      gh() { echo 'successor dispatched'; }
      ${script}
    `, {
      BRISBANE_MINUTE: String(minute),
      AFTER_BACKOFF: String(afterBackoff),
      CONTINUE_MONITORING: 'true',
      SYNC_OUTCOME: outcome,
      GITHUB_REF_NAME: 'main',
    })
  }

  it('does not dispatch when retry backoff crosses the trading cutoff', () => {
    const result = continueMonitor(14 * 60 + 19, 14 * 60 + 24)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('delay:300')
    expect(result.stdout).toContain('Trading ended during retry backoff')
    expect(result.stdout).not.toContain('successor dispatched')
  })

  it('retries a failed chain during trading and continues successful chains immediately', () => {
    const failed = continueMonitor(8 * 60, 8 * 60 + 5)
    expect(failed.status).toBe(0)
    expect(failed.stdout).toContain('delay:300')
    expect(failed.stdout).toContain('successor dispatched')
    const success = continueMonitor(8 * 60, 8 * 60, 'success')
    expect(success.status).toBe(0)
    expect(success.stdout).not.toContain('delay:')
    expect(success.stdout).toContain('successor dispatched')
  })

  it('exits without waiting or dispatching outside trading', () => {
    const result = continueMonitor(15 * 60, 15 * 60)
    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain('delay:')
    expect(result.stdout).not.toContain('successor dispatched')
  })
})
