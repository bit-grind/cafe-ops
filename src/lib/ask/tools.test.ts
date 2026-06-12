import { describe, expect, it } from 'vitest'
import { executeAskTool, getAskToolsForRole } from '@/lib/ask/tools'

describe('getAskToolsForRole', () => {
  it('keeps supplier data tools away from guests', () => {
    const guest = getAskToolsForRole('guest')
    expect([...guest.allowedNames]).toEqual([
      'get_daily_sales',
      'get_top_products',
      'get_products_for_date',
      'get_weather',
    ])
    expect(guest.definitions.map(tool => tool.function.name)).not.toContain('get_supplier_bills')
    expect(guest.definitions.map(tool => tool.function.name)).not.toContain('search_purchase_line_items')
  })

  it('allows the configured admin to use the complete tool set', () => {
    expect(getAskToolsForRole('guest', true).definitions).toHaveLength(6)
  })

  it('does not expose any Ask tools to team-calendar users', () => {
    const team = getAskToolsForRole('team')
    expect(team.definitions).toEqual([])
    expect([...team.allowedNames]).toEqual([])
  })
})

describe('executeAskTool', () => {
  it('rejects a forged tool call before touching its backing service', async () => {
    const guest = getAskToolsForRole('guest')
    await expect(executeAskTool('get_supplier_bills', {}, {
      supabase: {} as never,
      allowedTools: guest.allowedNames,
    })).resolves.toEqual({ error: 'Tool not available for this role' })
  })
})
