import 'server-only'

import { parseTrainingIdentity } from './identity'

export function getTrainingIdentity() {
  return parseTrainingIdentity(process.env.TRAINING_IDENTITY_JSON)
}
