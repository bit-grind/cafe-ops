import { describe, expect, it } from 'vitest'
import { buildWorkflowDispatch } from './githubDispatch'

describe('buildWorkflowDispatch', () => {
  it('targets the workflow dispatch endpoint for owner/name', () => {
    const { url } = buildWorkflowDispatch('bit-grind/cafe-ops', 'kounta-live-sales.yml', 'main', {})
    expect(url).toBe(
      'https://api.github.com/repos/bit-grind/cafe-ops/actions/workflows/kounta-live-sales.yml/dispatches',
    )
  })

  it('serialises ref and inputs into the body', () => {
    const { body } = buildWorkflowDispatch('o/r', 'wf.yml', 'main', {
      continue_monitoring: 'true',
      monitor_minutes: '70',
    })
    expect(JSON.parse(body)).toEqual({
      ref: 'main',
      inputs: { continue_monitoring: 'true', monitor_minutes: '70' },
    })
  })

  it('rejects a malformed repo', () => {
    expect(() => buildWorkflowDispatch('no-slash', 'wf.yml', 'main', {})).toThrow(/owner\/name/)
  })
})
