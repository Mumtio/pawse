import type { NotionPage, NotionSettings } from '@shared/types'

/**
 * Reading assignments out of Notion.
 *
 * Uses an internal integration token rather than OAuth on purpose. OAuth needs
 * a client secret and a redirect the app can honour, and a desktop app that
 * ships its own source cannot keep a secret — every install would share one,
 * and anyone could lift it. An internal token is created by the user, lives
 * only on their machine, and is revocable from Notion's own settings without
 * involving Pawse at all.
 *
 * The integration also starts with access to nothing. Notion pages must be
 * explicitly shared with it one by one, which means the blast radius of this
 * feature is whatever the person deliberately connected and nothing else.
 *
 * Read-only by design: Pawse never creates, edits, or deletes anything in a
 * workspace. It pulls text out and leaves the original exactly as it was.
 */

const API = 'https://api.notion.com/v1'
/** Pinned: Notion breaks shapes between versions and requires this header. */
const NOTION_VERSION = '2022-06-28'
const REQUEST_TIMEOUT_MS = 20_000

/** Deep page trees are common; this keeps one import from walking a whole wiki. */
const MAX_BLOCK_DEPTH = 3
const MAX_BLOCKS = 400
/** Matches the cap the quest prompt applies anyway. */
const MAX_TEXT_CHARS = 12_000

interface RichText {
  plain_text?: string
}

interface Block {
  id: string
  type: string
  has_children?: boolean
  [key: string]: unknown
}

async function callNotion(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  if (!token.trim()) throw new Error('No Notion token — add one in Settings › Connections.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token.trim()}`,
        'Notion-Version': NOTION_VERSION,
        'content-type': 'application/json',
        ...init.headers
      }
    })

    if (!res.ok) {
      // Notion's own messages are unusually good; pass them through rather than
      // flattening every failure into "something went wrong".
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(friendlyError(res.status, body?.message))
    }
    return await res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Notion took too long to answer.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function friendlyError(status: number, message?: string): string {
  if (status === 401) return 'That token was rejected — check it in Settings › Connections.'
  if (status === 404) {
    return "Notion can't see that page. Share it with your integration from the page's ⋯ menu."
  }
  if (status === 429) return 'Notion is rate-limiting; give it a moment and try again.'
  return message || `Notion returned ${status}.`
}

/** Confirm the token works, and say whose workspace it belongs to. */
export async function testNotion(notion: NotionSettings): Promise<string> {
  const me = (await callNotion(notion.token, '/users/me')) as {
    name?: string
    bot?: { workspace_name?: string }
  }
  return me.bot?.workspace_name || me.name || 'your workspace'
}

/**
 * Pages and databases the integration can see.
 *
 * An empty result is far more often "nothing has been shared yet" than "no
 * matches", so the caller distinguishes the two rather than showing a bare
 * "no results" that leaves someone stuck.
 */
export async function searchNotion(notion: NotionSettings, query: string): Promise<NotionPage[]> {
  const json = (await callNotion(notion.token, '/search', {
    method: 'POST',
    body: JSON.stringify({
      query: query.trim() || undefined,
      page_size: 25,
      sort: { direction: 'descending', timestamp: 'last_edited_time' }
    })
  })) as { results?: Array<Record<string, unknown>> }

  return (json.results ?? [])
    .map(toPage)
    .filter((p): p is NotionPage => p !== null)
}

function toPage(raw: Record<string, unknown>): NotionPage | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  if (!id) return null
  const object = raw.object === 'database' ? 'database' : 'page'

  return {
    id,
    object,
    title: titleOf(raw) || 'Untitled',
    url: typeof raw.url === 'string' ? raw.url : undefined,
    editedAt: typeof raw.last_edited_time === 'string' ? Date.parse(raw.last_edited_time) : undefined
  }
}

/**
 * A Notion title lives in a different place for each object type: databases
 * carry it at the top level, while a page's sits inside whichever property is
 * of type "title" — and that property's name is whatever the user called it.
 */
function titleOf(raw: Record<string, unknown>): string {
  const top = raw.title
  if (Array.isArray(top)) return plain(top as RichText[])

  const props = raw.properties as Record<string, { type?: string; title?: RichText[] }> | undefined
  if (props) {
    for (const prop of Object.values(props)) {
      if (prop?.type === 'title' && Array.isArray(prop.title)) return plain(prop.title)
    }
  }
  return ''
}

function plain(rich: RichText[] | undefined): string {
  return (rich ?? []).map((r) => r.plain_text ?? '').join('').trim()
}

/**
 * Flatten a page into plain text.
 *
 * Structure is kept only where it changes meaning — headings, list markers and
 * checkbox state — because the quest splitter reads lines and a wall of
 * undifferentiated prose splits badly. Everything else is dropped.
 */
export async function fetchPageText(notion: NotionSettings, pageId: string): Promise<string> {
  const budget = { blocks: MAX_BLOCKS }
  const lines = await readChildren(notion.token, pageId, 0, budget)
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  if (!text) {
    throw new Error('That page has no text in it — is the content on a sub-page?')
  }
  return text.slice(0, MAX_TEXT_CHARS)
}

async function readChildren(
  token: string,
  blockId: string,
  depth: number,
  budget: { blocks: number }
): Promise<string[]> {
  if (depth > MAX_BLOCK_DEPTH || budget.blocks <= 0) return []

  const out: string[] = []
  let cursor: string | undefined

  do {
    const query = new URLSearchParams({ page_size: '100' })
    if (cursor) query.set('start_cursor', cursor)

    const json = (await callNotion(token, `/blocks/${blockId}/children?${query}`)) as {
      results?: Block[]
      next_cursor?: string | null
      has_more?: boolean
    }

    for (const block of json.results ?? []) {
      if (budget.blocks <= 0) break
      budget.blocks -= 1

      const line = lineFor(block)
      if (line) out.push('  '.repeat(depth) + line)

      // Toggles and list items routinely hold the actual detail as children.
      if (block.has_children) {
        out.push(...(await readChildren(token, block.id, depth + 1, budget)))
      }
    }

    cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined
  } while (cursor && budget.blocks > 0)

  return out
}

function lineFor(block: Block): string {
  const body = block[block.type] as { rich_text?: RichText[]; checked?: boolean } | undefined
  const text = plain(body?.rich_text)
  if (!text) return ''

  switch (block.type) {
    case 'heading_1':
      return `\n# ${text}`
    case 'heading_2':
      return `\n## ${text}`
    case 'heading_3':
      return `\n### ${text}`
    case 'bulleted_list_item':
      return `- ${text}`
    case 'numbered_list_item':
      return `1. ${text}`
    // Checkbox state matters: an unticked box is outstanding work, which is
    // exactly what a quest chapter is meant to represent.
    case 'to_do':
      return `- [${body?.checked ? 'x' : ' '}] ${text}`
    case 'quote':
      return `> ${text}`
    default:
      return text
  }
}
