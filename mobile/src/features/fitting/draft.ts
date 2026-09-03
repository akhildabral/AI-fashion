// The fitting's draft: everything the member has answered, kept on the
// phone until the reveal so a killed app resumes at the same step and the
// profile is written exactly once, at the end.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Intent, StepKey } from './steps'

export const DRAFT_KEY = 'zauq.fitting.draft'

export type Side = 'left' | 'right'
export type Answer = Side | 'skip'

export interface DraftWeather {
  location: string
  temperatureC: number
  description: string
}

export interface FittingDraft {
  /** Whose draft this is; another member's draft is ignored. */
  userId: string | null
  /** The step to resume at. */
  step: StepKey
  firstName: string
  intent: Intent | null
  /** Every pair answered, in the deck's order; skips are kept so the deck resumes. */
  answers: Record<string, Answer>
  quizDone: boolean
  city: string
  weather: DraftWeather | null
  tone: string | null
  hour: number
}

export const EMPTY_DRAFT: FittingDraft = {
  userId: null,
  step: 'index',
  firstName: '',
  intent: null,
  answers: {},
  quizDone: false,
  city: '',
  weather: null,
  tone: null,
  hour: 7,
}

/** The quiz's choices as the API takes them: skips left out. */
export function quizChoices(answers: Record<string, Answer>): Record<string, Side> {
  const out: Record<string, Side> = {}
  for (const [id, a] of Object.entries(answers)) if (a !== 'skip') out[id] = a
  return out
}

export async function loadDraft(): Promise<FittingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FittingDraft>
    return { ...EMPTY_DRAFT, ...parsed }
  } catch {
    return null
  }
}

export function saveDraft(draft: FittingDraft): void {
  AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => undefined)
}

export function clearDraft(): void {
  AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined)
}
