import type { LlmSettings, Quest, QuestSource } from '@shared/types'
import { makeQuest, type ChapterSeed } from './quests'

/**
 * Turns assignment text into quest chapters.
 *
 * Provider-agnostic on purpose: you bring whichever free key you can get
 * (Google AI Studio, anything OpenAI-compatible like Groq or OpenRouter, or a
 * local Ollama), and if there's no key or no network we fall back to a local
 * splitter. Generation must never be the reason the app can't be used.
 *
 * The model is asked to *retitle and group* work that is already in the text.
 * It is never asked to invent requirements, and the result is always shown to
 * the user for approval before anything is saved.
 */

const REQUEST_TIMEOUT_MS = 30_000

export interface GenerationResult {
  quest: Quest
  usedFallback: boolean
  notice?: string
}

const SYSTEM_PROMPT = `You turn a student's real assignment text into a short pixel-game "quest".

Rules:
- Every chapter MUST correspond to work that is actually stated or clearly implied in the text. Never invent requirements, deadlines, or deliverables.
- "realTask" is the plain, literal description of the work, in the user's own words where possible.
- "title" is the playful renaming of that same work, in the requested theme.
- Produce between 3 and 7 chapters, ordered the way the work should be done.
- estMinutes is a realistic estimate for a student, between 15 and 180.
- reward is a short themed object name (2-3 words), e.g. "Ancient map".
- Respond with JSON only, no prose and no code fences.`

function userPrompt(text: string, theme: string): string {
  return `Theme: ${theme}

Assignment text:
"""
${text.slice(0, 12_000)}
"""

Return JSON shaped exactly like:
{"title":string,"subtitle":string,"chapters":[{"title":string,"realTask":string,"estMinutes":number,"reward":string}]}`
}

interface RawQuest {
  title?: string
  subtitle?: string
  chapters?: Array<{
    title?: string
    realTask?: string
    estMinutes?: number
    reward?: string
  }>
}

export async function generateQuest(
  text: string,
  theme: string,
  llm: LlmSettings,
  /** Where the text came from, so the quest can say so on its ticket. */
  source: QuestSource = 'paste'
): Promise<GenerationResult> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Nothing to read yet — paste your assignment text first.')

  if (llm.provider === 'none' || (!llm.apiKey && llm.provider !== 'ollama')) {
    return {
      quest: localQuest(trimmed, theme, source),
      usedFallback: true,
      notice: 'Made this offline — add a key in Settings › Connections for richer chapters.'
    }
  }

  try {
    const raw = await callProvider(trimmed, theme, llm)
    const quest = questFromRaw(raw, trimmed, theme, source)
    if (!quest) throw new Error('The model returned an unusable shape.')
    return { quest, usedFallback: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[llm] generation failed, using local splitter:', message)
    return {
      quest: localQuest(trimmed, theme, source),
      usedFallback: true,
      notice: `Couldn't reach the model (${message}) — built this one offline instead.`
    }
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function callProvider(text: string, theme: string, llm: LlmSettings): Promise<RawQuest> {
  switch (llm.provider) {
    case 'gemini':
      return callGemini(text, theme, llm)
    case 'openai-compatible':
      return callOpenAiCompatible(text, theme, llm)
    case 'ollama':
      return callOllama(text, theme, llm)
    default:
      throw new Error('No provider configured')
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Google AI Studio — the most generous free tier, no card required. */
async function callGemini(text: string, theme: string, llm: LlmSettings): Promise<RawQuest> {
  const model = llm.model || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt(text, theme) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          subtitle: { type: 'STRING' },
          chapters: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                realTask: { type: 'STRING' },
                estMinutes: { type: 'INTEGER' },
                reward: { type: 'STRING' }
              },
              required: ['title', 'realTask', 'estMinutes', 'reward']
            }
          }
        },
        required: ['title', 'subtitle', 'chapters']
      }
    }
  }
  const json = (await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': llm.apiKey },
    body: JSON.stringify(body)
  })) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }

  const out = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!out) throw new Error('Empty response')
  return parseLooseJson(out)
}

/** Groq, OpenRouter, Together, LM Studio — anything speaking /chat/completions. */
async function callOpenAiCompatible(
  text: string,
  theme: string,
  llm: LlmSettings
): Promise<RawQuest> {
  const base = (llm.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '')
  const json = (await fetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${llm.apiKey}`
    },
    body: JSON.stringify({
      model: llm.model || 'llama-3.3-70b-versatile',
      // json_object is supported far more widely across free endpoints than
      // full json_schema, and the shape is pinned in the prompt anyway.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(text, theme) }
      ]
    })
  })) as { choices?: Array<{ message?: { content?: string } }> }

  const out = json.choices?.[0]?.message?.content
  if (!out) throw new Error('Empty response')
  return parseLooseJson(out)
}

/** Fully local, no key, no network. */
async function callOllama(text: string, theme: string, llm: LlmSettings): Promise<RawQuest> {
  const base = (llm.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const json = (await fetchJson(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: llm.model || 'llama3.1',
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(text, theme) }
      ]
    })
  })) as { message?: { content?: string } }

  const out = json.message?.content
  if (!out) throw new Error('Empty response')
  return parseLooseJson(out)
}

/** Models still fence their JSON sometimes; be forgiving about it. */
function parseLooseJson(raw: string): RawQuest {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned) as RawQuest
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('Response was not JSON')
    return JSON.parse(cleaned.slice(start, end + 1)) as RawQuest
  }
}

function questFromRaw(
  raw: RawQuest,
  sourceText: string,
  theme: string,
  source: QuestSource
): Quest | null {
  const chapters = (raw.chapters ?? [])
    .filter((c) => c?.title && c?.realTask)
    .slice(0, 8)
    .map<ChapterSeed>((c, i) => ({
      title: String(c.title).trim(),
      realTask: String(c.realTask).trim(),
      estMinutes: clampMinutes(c.estMinutes),
      reward: (c.reward ?? DEFAULT_REWARDS[i % DEFAULT_REWARDS.length]).trim()
    }))
  if (chapters.length === 0) return null

  const quest = makeQuest(
    raw.title?.trim() || 'A new quest',
    raw.subtitle?.trim() || firstLine(sourceText),
    chapters,
    // Where it came from beats how it was processed: "notion" is the useful
    // label on the ticket, and every model-built quest is already 'llm'.
    source === 'paste' ? 'llm' : source,
    theme
  )
  quest.dueAt = findDueDate(sourceText)
  return quest
}

function clampMinutes(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 45
  return Math.min(180, Math.max(15, n))
}

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

const DEFAULT_REWARDS = [
  'Ancient map',
  'Magic key',
  'Workbench',
  'Rune blade',
  'Torch',
  'Royal seal',
  'Silver compass',
  'Velvet cloak'
]

const TITLE_FRAMES = [
  'Decode the {x}',
  'Repair the {x}',
  'Recruit the {x}',
  'Defeat the {x}',
  'Enter the {x}',
  'Deliver the {x}',
  'Cross the {x}',
  'Claim the {x}'
]

const ACTION_WORDS =
  /\b(implement|write|read|build|create|design|test|submit|prepare|analyse|analyze|research|review|draft|fix|refactor|document|study|revise|complete|compile|run|deploy|present)\b/i

/**
 * A deterministic local splitter so quest generation works with no key and no
 * network. It only ever regroups and retitles lines that are already in the
 * text — same contract as the model path.
 */
export function localQuest(text: string, theme: string, source: QuestSource = 'paste'): Quest {
  const raw = text.split(/\r?\n/)

  /**
   * Headings describe a document; they are not the work in it. Importing a
   * page whose top level is all headings once produced chapters literally
   * called "# Study Plan", so they are excluded as candidates — while still
   * being stripped rather than dropped, in case they are all there is.
   */
  const isHeading = (line: string): boolean => /^\s*#{1,6}\s/.test(line)

  const lines = raw.map(stripMarkers).filter((l) => l.length > 3)
  const bodyLines = raw
    .filter((l) => !isHeading(l))
    .map(stripMarkers)
    .filter((l) => l.length > 3)

  /**
   * An unticked checkbox is the clearest statement of outstanding work anyone
   * writes down, so when a page has them they beat every other heuristic.
   */
  const todos = raw
    .filter((l) => /^\s*[-*•]?\s*\[ \]/.test(l))
    .map(stripMarkers)
    .filter((l) => l.length > 3)

  const pool = bodyLines.length >= 3 ? bodyLines : lines
  let candidates = pool.filter(
    (l) => ACTION_WORDS.test(l) || (l.length < 120 && /[a-z]/i.test(l))
  )

  if (candidates.length < 3) {
    candidates = text
      .split(/(?<=[.!?])\s+/)
      .map(stripMarkers)
      .filter((s) => s.length > 12)
  }

  /**
   * Checked last so the "not enough candidates" fallback can never discard it.
   * Two outstanding boxes are a better answer than six sentences chopped out
   * of prose, even though two is below the threshold everything else uses.
   */
  if (todos.length > 0) candidates = todos

  const picked = candidates.slice(0, 6)
  if (picked.length === 0) picked.push(text.slice(0, 120))

  const chapters: ChapterSeed[] = picked.map((task, i) => ({
    title: TITLE_FRAMES[i % TITLE_FRAMES.length].replace('{x}', nounPhrase(task)),
    realTask: task,
    estMinutes: estimateMinutes(task),
    reward: DEFAULT_REWARDS[i % DEFAULT_REWARDS.length]
  }))

  const quest = makeQuest(titleCase(firstLine(text)) || 'A new quest', firstLine(text), chapters, source, theme)
  quest.dueAt = findDueDate(text)
  return quest
}

/**
 * Strip the markdown the Notion reader emits so it never reaches a chapter.
 *
 * The reader adds `#`, `-` and `[ ]` markers deliberately: they carry meaning
 * the splitter uses. They just must not survive into the task text a person
 * reads back, which is how a chapter ended up titled "# Study Plan".
 */
function stripMarkers(line: string): string {
  return (
    line
      .replace(/^[\s>*\-•]+/, '')
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      // Notion page titles routinely start with an emoji icon. Kept out of
      // titles and tasks alike, where it reads as a glitch: "📶study Plan".
      .replace(/^[^\p{L}\p{N}"'(]+/u, '')
      .trim()
  )
}

function nounPhrase(task: string): string {
  const words = task
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !ACTION_WORDS.test(w))
  const pick = words.slice(0, 2).join(' ') || 'Unknown Path'
  return titleCase(pick)
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** The first line with something in it, markers stripped — quests are titled from this. */
function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const cleaned = stripMarkers(line)
    if (cleaned.length > 0) return cleaned.slice(0, 90)
  }
  return ''
}

function estimateMinutes(task: string): number {
  if (task.length > 160) return 90
  if (task.length > 90) return 60
  if (task.length > 45) return 45
  return 30
}

/** Best-effort deadline sniffing; a wrong guess is left unset rather than faked. */
function findDueDate(text: string): number | undefined {
  const match = text.match(
    /\b(?:due|deadline|submit(?:ted)?\s+by)\b[^.\n]{0,30}?((?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
  )
  if (!match) return undefined
  const parsed = Date.parse(match[1])
  return Number.isNaN(parsed) ? undefined : parsed
}
