export type TrainingIdentity = {
  businessName: string
  shortName: string
  readinessName: string
  founderName: string
  footerLocation: string
}

export const DEFAULT_TRAINING_IDENTITY: TrainingIdentity = {
  businessName: 'Example Cafe',
  shortName: 'Cafe',
  readinessName: 'Cafe',
  founderName: 'Alex Morgan',
  footerLocation: 'Your neighbourhood',
}

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** Only display-copy fields may cross from private configuration to the course. */
export function normalizeTrainingIdentity(input: unknown): TrainingIdentity {
  const value = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}

  return {
    businessName: textOrDefault(value.businessName, DEFAULT_TRAINING_IDENTITY.businessName),
    shortName: textOrDefault(value.shortName, DEFAULT_TRAINING_IDENTITY.shortName),
    readinessName: textOrDefault(value.readinessName, DEFAULT_TRAINING_IDENTITY.readinessName),
    founderName: textOrDefault(value.founderName, DEFAULT_TRAINING_IDENTITY.founderName),
    footerLocation: textOrDefault(value.footerLocation, DEFAULT_TRAINING_IDENTITY.footerLocation),
  }
}

export function parseTrainingIdentity(raw: string | undefined): TrainingIdentity {
  if (!raw) return normalizeTrainingIdentity(null)
  try {
    return normalizeTrainingIdentity(JSON.parse(raw))
  } catch {
    return normalizeTrainingIdentity(null)
  }
}
