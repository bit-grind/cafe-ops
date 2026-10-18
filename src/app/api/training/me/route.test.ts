import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  resolveTrainee: vi.fn(),
  touchTrainee: vi.fn(),
  getTrainingIdentity: vi.fn(),
}))

vi.mock('@/lib/adminAuth', () => ({ adminClient: mocks.adminClient }))
vi.mock('@/lib/training/traineeAuth', () => ({
  resolveTrainee: mocks.resolveTrainee,
  touchTrainee: mocks.touchTrainee,
}))
vi.mock('@/lib/training/identityServer', () => ({ getTrainingIdentity: mocks.getTrainingIdentity }))

import { GET } from './route'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GET /api/training/me', () => {
  it('checks the invite token before reading progress or private course identity', async () => {
    mocks.resolveTrainee.mockResolvedValue(null)

    const response = await GET(new Request('https://app.example.invalid/api/training/me'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.adminClient).not.toHaveBeenCalled()
    expect(mocks.getTrainingIdentity).not.toHaveBeenCalled()
  })

  it('returns authenticated course identity with progress and prevents shared caching', async () => {
    mocks.resolveTrainee.mockResolvedValue({
      id: 'trainee-1', full_name: 'Taylor Example', started_at: null,
      signed_off_at: null, signed_off_name: null,
    })
    const eq = vi.fn().mockResolvedValue({
      data: [{ module_id: 'welcome', best_score: 3, total: 3, attempts: 1, first_completed_at: null }],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq })
    mocks.adminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) })
    mocks.touchTrainee.mockResolvedValue(undefined)
    mocks.getTrainingIdentity.mockReturnValue({ businessName: 'Sample Coffee' })

    const response = await GET(new Request('https://app.example.invalid/api/training/me'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.identity).toEqual({ businessName: 'Sample Coffee' })
    expect(body.completed[0]).toMatchObject({ moduleId: 'welcome', bestScore: 3, total: 3 })
    expect(eq).toHaveBeenCalledWith('trainee_id', 'trainee-1')
    expect(mocks.touchTrainee).toHaveBeenCalledWith('trainee-1', true)
  })
})
