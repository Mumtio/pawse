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
export async function fetchPageText(
  notion: NotionSettings,
  pageId: string,
  /** Databases hold their content as rows, which are not blocks. */
  object: 'page' | 'database' = 'page'
): Promise<string> {
  const budget: Budget = { blocks: MAX_BLOCKS, seen: new Set([pageId]) }
  const lines =
    object === 'database'
      ? await readDatabaseRows(notion.token, pageId, budget)
      : await readChildren(notion.token, pageId, 0, budget)

  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  if (!text) {
    throw new Error(
      'That page came back empty. If its content lives on sub-pages, share those with your integration too.'
    )
  }
  return text.slice(0, MAX_TEXT_CHARS)
}

/**
 * Blocks that exist only to hold other blocks. They contribute no text of their
 * own, so they must not consume depth — a paragraph inside a column inside a
 * toggle is one level of meaning, not three, and counting it as three is how
 * real content ends up just past the depth limit.
 */
const CONTAINER_BLOCKS = new Set([
  'column_list',
  'column',
  'synced_block',
  'toggle',
  'callout',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do'
])

interface Budget {
  blocks: number
  /** Pages already read, so a pair of pages linking to each other can't loop. */
  seen: Set<string>
}

async function readChildren(
  token: string,
  blockId: string,
  depth: number,
  budget: Budget
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

      /**
       * An inline database is where a study plan actually keeps its work — the
       * page around it is usually just a heading. Its rows are not blocks, so
       * walking children finds nothing and the import comes back empty-handed.
       */
      if (block.type === 'child_database') {
        out.push(...(await readDatabaseRows(token, block.id, budget)))
        continue
      }

      /**
       * A planner page is often nothing but links to the pages holding the
       * real work. Following them is the difference between importing an
       * index and importing the plan.
       */
      if (block.type === 'link_to_page') {
        out.push(...(await readLinkedPage(token, block, depth, budget)))
        continue
      }

      // Toggles and list items routinely hold the actual detail as children.
      if (block.has_children) {
        const nested = CONTAINER_BLOCKS.has(block.type) ? depth : depth + 1
        out.push(...(await readChildren(token, block.id, nested, budget)))
      }
    }

    cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined
  } while (cursor && budget.blocks > 0)

  return out
}

/**
 * Follow a link to another page or database.
 *
 * Failures here are swallowed on purpose: a linked page the integration was
 * never shared with is the normal case, not an error worth aborting a whole
 * import over. The rest of the page is still worth having.
 */
async function readLinkedPage(
  token: string,
  block: Block,
  depth: number,
  budget: Budget
): Promise<string[]> {
  const link = block.link_to_page as
    | { type?: string; page_id?: string; database_id?: string }
    | undefined
  const targetId = link?.page_id ?? link?.database_id
  if (!targetId || budget.seen.has(targetId) || depth > MAX_BLOCK_DEPTH) return []
  budget.seen.add(targetId)

  try {
    if (link?.database_id) {
      return await readDatabaseRows(token, link.database_id, budget)
    }
    const page = (await callNotion(token, `/pages/${targetId}`)) as Record<string, unknown>
    const title = titleOf(page)
    const body = await readChildren(token, targetId, depth + 1, budget)
    return title ? [`\n## ${title}`, ...body] : body
  } catch {
    return []
  }
}

/**
 * A database's rows, one line each.
 *
 * Rows are pages, so the row's own title is the task and its properties are
 * the detail worth keeping — a due date and a status change what the work is,
 * where a "Created by" column does not. Properties are appended to the same
 * line so the splitter still sees one task per line.
 */
async function readDatabaseRows(
  token: string,
  databaseId: string,
  budget: Budget
): Promise<string[]> {
  if (budget.blocks <= 0) return []

  const out: string[] = []
  let cursor: string | undefined

  do {
    const json = (await callNotion(token, `/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, start_cursor: cursor })
    })) as {
      results?: Array<Record<string, unknown>>
      next_cursor?: string | null
      has_more?: boolean
    }

    for (const row of json.results ?? []) {
      if (budget.blocks <= 0) break
      budget.blocks -= 1

      const title = titleOf(row) || 'Untitled'
      const detail = rowDetail(row)
      out.push(`- ${title}${detail ? ` — ${detail}` : ''}`)
    }

    cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined
  } while (cursor && budget.blocks > 0)

  return out
}

/** The properties on a row that actually change what the work is. */
function rowDetail(row: Record<string, unknown>): string {
  const props = row.properties as Record<string, Record<string, unknown>> | undefined
  if (!props) return ''

  const parts: string[] = []
  for (const [name, prop] of Object.entries(props)) {
    const value = propertyValue(prop)
    // The title is already the task, so repeating it here is noise.
    if (!value || prop?.type === 'title') continue
    parts.push(`${name}: ${value}`)
    if (parts.length >= 4) break
  }
  return parts.join(' · ')
}

function propertyValue(prop: Record<string, unknown> | undefined): string {
  if (!prop) return ''
  switch (prop.type) {
    case 'rich_text':
      return plain(prop.rich_text as RichText[])
    case 'date': {
      const date = prop.date as { start?: string; end?: string } | null
      if (!date?.start) return ''
      return date.end ? `${date.start} → ${date.end}` : date.start
    }
    case 'select':
      return ((prop.select as { name?: string } | null)?.name) ?? ''
    case 'status':
      return ((prop.status as { name?: string } | null)?.name) ?? ''
    case 'multi_select':
      return ((prop.multi_select as Array<{ name?: string }>) ?? [])
        .map((s) => s.name)
        .filter(Boolean)
        .join(', ')
    case 'checkbox':
      return prop.checkbox ? 'done' : 'not done'
    case 'number':
      return prop.number === null || prop.number === undefined ? '' : String(prop.number)
    case 'url':
      return typeof prop.url === 'string' ? prop.url : ''
    // People, files, relations and rollups are metadata about the row rather
    // than a description of the work, and they crowd out what matters.
    default:
      return ''
  }
}

function lineFor(block: Block): string {
  const body = block[block.type] as
    | { rich_text?: RichText[]; checked?: boolean; title?: string }
    | undefined

  /**
   * Sub-pages and inline databases carry a bare `title` string instead of rich
   * text. Falling through to rich_text leaves them empty, which is how a hub
   * page — one that is nothing but links to the real work — imports as though
   * it were blank.
   */
  if (block.type === 'child_page' || block.type === 'child_database') {
    return body?.title ? `\n## ${body.title}` : ''
  }

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
