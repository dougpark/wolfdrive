import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let temporary: string
let mediaPath: string
let child: ReturnType<typeof Bun.spawn>
let base: string
let sqlite: Database
let directoryId: string
let tagId: string

async function request(path: string, method = 'GET', body?: unknown) {
    return fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

beforeAll(async () => {
    temporary = mkdtempSync(join(tmpdir(), 'wolfdrive-ingest-test-'))
    mkdirSync(join(temporary, 'data'))
    mediaPath = join(temporary, 'media')
    mkdirSync(mediaPath)
    writeFileSync(join(mediaPath, 'report.txt'), 'original')
    sqlite = new Database(join(temporary, 'data', 'wolfdrive.db'))
    migrate(drizzle(sqlite), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
    sqlite.query("INSERT INTO users (id, name, is_default) VALUES ('usr_default', 'Test', 1)").run()
    const portFile = join(temporary, 'port')
    const entry = new URL('../index.ts', import.meta.url).pathname
    const script = `const app = (await import(${JSON.stringify(entry)})).default; const server = Bun.serve({ ...app, hostname: '127.0.0.1', port: 0 }); await Bun.write(process.env.TEST_PORT_FILE, String(server.port));`
    child = Bun.spawn([process.execPath, '-e', script], {
        cwd: temporary,
        env: { ...process.env, TEST_PORT_FILE: portFile, MEDIA_HOST_PATH: '/host/storage', MEDIA_CONTAINER_PATH: '/media' },
        stdout: 'ignore',
        stderr: 'inherit',
    })
    for (let i = 0; i < 100 && !existsSync(portFile); i++) {
        if (child.exitCode !== null) throw new Error(`Test server exited: ${child.exitCode}`)
        await Bun.sleep(50)
    }
    if (!existsSync(portFile)) throw new Error('Test server did not start')
    base = `http://127.0.0.1:${readFileSync(portFile, 'utf8')}`
})

afterAll(async () => {
    if (child && child.exitCode === null) {
        child.kill()
        await child.exited
    }
    sqlite?.close()
    if (temporary) rmSync(temporary, { recursive: true, force: true })
})

test('folder tags, AI metadata search and rescanning work together', async () => {
    const storage = await (await request('/api/settings/storage')).json() as { hostPath: string; containerPath: string; schedule: { intervalSeconds: number | null } }
    expect(storage.hostPath).toBe('/host/storage')
    expect(storage.containerPath).toBe('/media')
    expect(storage.schedule.intervalSeconds).toBeNull()

    const tag = await (await request('/api/tags', 'POST', { name: 'Taxes' })).json() as { id: string }
    tagId = tag.id
    const same = await (await request('/api/tags', 'POST', { name: '  taxes ' })).json() as { id: string }
    expect(same.id).toBe(tagId)
    expect((await request('/api/directories', 'POST', { path: mediaPath, tagIds: ['missing'] })).status).toBe(400)
    const add = await request('/api/directories', 'POST', { path: mediaPath, tagIds: [tagId] })
    expect(add.status).toBe(201)
    directoryId = (await add.json() as { id: string }).id
    expect((await request(`/api/scan/${directoryId}`, 'POST')).status).toBe(200)
    const list = await (await request('/api/directories')).json() as { id: string; tags: { id: string }[] }[]
    expect(list[0]?.tags.map((item) => item.id)).toEqual([tagId])
    const files = await (await request(`/api/files?folderTags=${tagId}`)).json() as { id: string }[]
    expect(files).toHaveLength(1)
    expect(await (await request('/api/files?search=report')).json()).toHaveLength(1)
    expect(await (await request('/api/files?folderTags=missing')).json()).toEqual([])
    expect(await (await request(`/api/files?folderTags=${tagId},missing&folderTagMode=all`)).json()).toEqual([])
    expect(await (await request(`/api/files?folderTags=${tagId},missing&folderTagMode=any`)).json()).toHaveLength(1)
    expect(await (await request(`/api/files?tags=${tagId}`)).json()).toEqual([])

    sqlite.query("UPDATE media_files SET ai_summary = ?, ai_tags = ?, ai_model = ?, ai_indexed_mtime_ms = mtime_ms WHERE id = ?")
        .run('Annual finances', JSON.stringify(['deductions']), 'test-model', files[0]!.id)
    expect(await (await request('/api/files?search=finances')).json()).toHaveLength(1)
    expect(await (await request('/api/files?search=deductions')).json()).toHaveLength(1)
    expect(await (await request(`/api/files?search=deductions&folderTags=missing`)).json()).toEqual([])

    writeFileSync(join(mediaPath, 'report.txt'), 'updated file content')
    expect((await request(`/api/scan/${directoryId}`, 'POST')).status).toBe(200)
    expect(await (await request('/api/files?search=deductions')).json()).toEqual([])
    expect((await request(`/api/directories/${directoryId}/tags`, 'PUT', { tagIds: ['missing'] })).status).toBe(400)
    expect((await request(`/api/directories/${directoryId}/tags`, 'PUT', { tagIds: [] })).status).toBe(200)
    expect(await (await request(`/api/files?folderTags=${tagId}`)).json()).toEqual([])
    expect((await request(`/api/directories/${directoryId}/tags`, 'PUT', { tagIds: [tagId] })).status).toBe(200)
    expect((await request(`/api/tags/${tagId}`, 'DELETE')).status).toBe(200)
    expect(sqlite.query('SELECT count(*) AS count FROM directory_tags WHERE tag_id = ?').get(tagId)).toEqual({ count: 0 })
    const otherTag = await (await request('/api/tags', 'POST', { name: 'Documents' })).json() as { id: string }
    expect((await request(`/api/directories/${directoryId}/tags`, 'PUT', { tagIds: [otherTag.id] })).status).toBe(200)
    expect((await request(`/api/directories/${directoryId}`, 'DELETE')).status).toBe(200)
    expect(sqlite.query('SELECT count(*) AS count FROM directory_tags WHERE directory_id = ?').get(directoryId)).toEqual({ count: 0 })
})

test('schedule validates input, persists, and can be disabled', async () => {
    expect((await request('/api/settings/scan-schedule', 'PUT', { intervalSeconds: 30 })).status).toBe(400)
    const response = await request('/api/settings/scan-schedule', 'PUT', { intervalSeconds: 3600 })
    expect(response.status).toBe(200)
    const storage = await (await request('/api/settings/storage')).json() as { schedule: { intervalSeconds: number } }
    expect(storage.schedule.intervalSeconds).toBe(3600)
    const disabled = await (await request('/api/settings/scan-schedule', 'PUT', { intervalSeconds: null })).json() as { nextRunAt: string | null }
    expect(disabled.nextRunAt).toBeNull()
})

test('ignore review previews, cancels, detects stale changes, and applies without touching source files', async () => {
    const vault = join(temporary, 'review-vault')
    mkdirSync(vault)
    mkdirSync(join(vault, '.obsidian'))
    const excluded = join(vault, '.obsidian', 'workspace.json')
    const changed = join(vault, 'changed.txt')
    const missing = join(vault, 'missing.txt')
    const added = join(vault, 'new.txt')
    writeFileSync(excluded, 'settings')
    writeFileSync(changed, 'before')
    writeFileSync(missing, 'old')
    const folderResponse = await request('/api/directories', 'POST', { path: vault })
    const folder = await folderResponse.json() as { id: string }
    expect((await request(`/api/scan/${folder.id}`, 'POST')).status).toBe(200)
    const rows = sqlite.query('SELECT id, path FROM media_files WHERE directory_id = ?').all(folder.id) as { id: string; path: string }[]
    const excludedId = rows.find((row) => row.path === excluded)!.id
    const changedId = rows.find((row) => row.path === changed)!.id
    const tag = await (await request('/api/tags', 'POST', { name: 'Research' })).json() as { id: string }
    expect((await request(`/api/files/${excludedId}/tags`, 'PUT', { tagIds: [tag.id] })).status).toBe(200)
    sqlite.query("INSERT INTO reading_state (id, user_id, file_id, percent_read) VALUES ('review-reading', 'usr_default', ?, 40)").run(excludedId)
    sqlite.query('UPDATE media_files SET ai_summary = ?, ai_tags = ?, custom_categories = ? WHERE id = ?')
        .run('Important research summary', '["archive"]', '["research"]', excludedId)
    sqlite.query('UPDATE media_files SET ai_summary = ? WHERE id = ?').run('Old summary', changedId)
    writeFileSync(changed, 'changed to different content')
    unlinkSync(missing)
    writeFileSync(added, 'new content')
    const oldRules = await (await request('/api/settings/ignore')).json()
    const body = { patterns: ['.obsidian'] }
    expect((await request('/api/settings/ignore', 'POST', body)).status).toBe(409)

    async function preview() {
        const response = await request('/api/settings/ignore/preview', 'POST', body)
        expect(response.status).toBe(200)
        return await response.json() as { id: string; counts: { added: number; changed: number; removed: number }; missingCount: number }
    }
    const first = await preview()
    expect(first.counts).toEqual({ added: 1, changed: 1, removed: 2 })
    expect(first.missingCount).toBe(1)
    const page = await (await request(`/api/settings/ignore/preview/${first.id}?kind=removed`)).json() as {
        items: { path: string; impact: { tags: string[]; categories: string[]; aiSummary: string; aiTags: string[]; hasReadingProgress: boolean } }[]
    }
    const excludedChange = page.items.find((item) => item.path === excluded)!
    expect(excludedChange.impact).toEqual({
        tags: ['Research'], categories: ['research'], aiSummary: 'Important research summary',
        aiTags: ['archive'], hasReadingProgress: true,
    })
    expect(await (await request('/api/settings/ignore')).json()).toEqual(oldRules)
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE id = ?').get(excludedId)).toEqual({ count: 1 })
    expect((await request(`/api/settings/ignore/preview/${first.id}`, 'DELETE')).status).toBe(200)
    expect((await request(`/api/settings/ignore/preview/${first.id}/accept`, 'POST')).status).toBe(404)

    const databaseStale = await preview()
    sqlite.query('UPDATE media_files SET ai_summary = ? WHERE id = ?').run('Updated research', excludedId)
    expect((await request(`/api/settings/ignore/preview/${databaseStale.id}/accept`, 'POST')).status).toBe(409)
    expect(await (await request('/api/settings/ignore')).json()).toEqual(oldRules)

    const filesystemStale = await preview()
    const extra = join(vault, 'late.txt')
    writeFileSync(extra, 'late')
    expect((await request(`/api/settings/ignore/preview/${filesystemStale.id}/accept`, 'POST')).status).toBe(409)
    unlinkSync(extra)

    const approved = await preview()
    sqlite.exec("CREATE TRIGGER deny_review_delete BEFORE DELETE ON media_files BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    expect((await request(`/api/settings/ignore/preview/${approved.id}/accept`, 'POST')).status).toBe(500)
    expect(await (await request('/api/settings/ignore')).json()).toEqual(oldRules)
    expect(sqlite.query('SELECT count(*) AS count FROM file_tags WHERE file_id = ?').get(excludedId)).toEqual({ count: 1 })
    expect(sqlite.query('SELECT count(*) AS count FROM reading_state WHERE file_id = ?').get(excludedId)).toEqual({ count: 1 })
    sqlite.exec('DROP TRIGGER deny_review_delete')
    expect((await request(`/api/settings/ignore/preview/${approved.id}/accept`, 'POST')).status).toBe(200)
    expect(await (await request('/api/settings/ignore')).json()).toEqual(['.obsidian'])
    expect(existsSync(excluded)).toBe(true)
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE id = ?').get(excludedId)).toEqual({ count: 0 })
    expect(sqlite.query('SELECT count(*) AS count FROM file_tags WHERE file_id = ?').get(excludedId)).toEqual({ count: 0 })
    expect(sqlite.query('SELECT count(*) AS count FROM reading_state WHERE file_id = ?').get(excludedId)).toEqual({ count: 0 })
    expect(sqlite.query('SELECT count(*) AS count FROM tags WHERE id = ?').get(tag.id)).toEqual({ count: 1 })
    expect(sqlite.query('SELECT ai_summary FROM media_files WHERE id = ?').get(changedId)).toEqual({ ai_summary: null })
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE path = ?').get(added)).toEqual({ count: 1 })
    expect((await request(`/api/scan/${folder.id}`, 'POST')).status).toBe(200)
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE path = ?').get(excluded)).toEqual({ count: 0 })
})

test('review handles overlapping folders and rejects incomplete scans', async () => {
    const root = join(temporary, 'overlap')
    const childFolder = join(root, 'child')
    mkdirSync(root)
    mkdirSync(childFolder)
    const file = join(childFolder, 'item.txt')
    writeFileSync(file, 'research')
    const parent = await (await request('/api/directories', 'POST', { path: root })).json() as { id: string }
    expect((await request(`/api/scan/${parent.id}`, 'POST')).status).toBe(200)
    const fileRow = sqlite.query('SELECT id FROM media_files WHERE path = ?').get(file) as { id: string }
    const childDirectory = await (await request('/api/directories', 'POST', { path: childFolder })).json() as { id: string }
    const parentTag = await (await request('/api/tags', 'POST', { name: 'Parent folder' })).json() as { id: string }
    const childTag = await (await request('/api/tags', 'POST', { name: 'Child folder' })).json() as { id: string }
    await request(`/api/directories/${parent.id}/tags`, 'PUT', { tagIds: [parentTag.id] })
    await request(`/api/directories/${childDirectory.id}/tags`, 'PUT', { tagIds: [childTag.id] })
    const result = await request('/api/settings/ignore/preview', 'POST', { patterns: ['overlap/child/'] })
    expect(result.status).toBe(200)
    const preview = await result.json() as { id: string }
    const changes = await (await request(`/api/settings/ignore/preview/${preview.id}?kind=changed`)).json() as {
        items: { path: string; after: { directoryId: string }; beforeFolderTags: string[]; afterFolderTags: string[] }[]
    }
    const reassignment = changes.items.find((item) => item.path === file)!
    expect(reassignment.after.directoryId).toBe(childDirectory.id)
    expect(reassignment.beforeFolderTags).toEqual(['Parent folder'])
    expect(reassignment.afterFolderTags).toEqual(['Child folder'])
    await request(`/api/directories/${childDirectory.id}/tags`, 'PUT', { tagIds: [] })
    expect((await request(`/api/settings/ignore/preview/${preview.id}/accept`, 'POST')).status).toBe(409)
    const revised = await (await request('/api/settings/ignore/preview', 'POST', { patterns: ['overlap/child/'] })).json() as { id: string }
    expect((await request(`/api/settings/ignore/preview/${revised.id}/accept`, 'POST')).status).toBe(200)
    expect(sqlite.query('SELECT directory_id FROM media_files WHERE id = ?').get(fileRow.id)).toEqual({ directory_id: childDirectory.id })

    const absent = await (await request('/api/directories', 'POST', { path: join(temporary, 'not-mounted') })).json() as { id: string }
    const failed = await request('/api/settings/ignore/preview', 'POST', { patterns: ['*.txt'] })
    expect(failed.status).toBe(500)
    expect(await (await request('/api/settings/ignore')).json()).toEqual(['overlap/child/'])
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE id = ?').get(fileRow.id)).toEqual({ count: 1 })
    await request(`/api/directories/${absent.id}`, 'DELETE')
})

test('review pages large removal lists and leaves disabled folders untouched', async () => {
    const bulk = join(temporary, 'bulk')
    const disabled = join(temporary, 'disabled')
    mkdirSync(bulk)
    mkdirSync(disabled)
    for (let i = 0; i < 55; i++) writeFileSync(join(bulk, `file-${i}.txt`), 'bulk')
    const disabledFile = join(disabled, 'disabled.txt')
    writeFileSync(disabledFile, 'keep')
    const bulkDir = await (await request('/api/directories', 'POST', { path: bulk })).json() as { id: string }
    const disabledDir = await (await request('/api/directories', 'POST', { path: disabled })).json() as { id: string }
    expect((await request(`/api/scan/${bulkDir.id}`, 'POST')).status).toBe(200)
    expect((await request(`/api/scan/${disabledDir.id}`, 'POST')).status).toBe(200)
    sqlite.query('UPDATE media_directories SET enabled = 0 WHERE id = ?').run(disabledDir.id)
    const response = await request('/api/settings/ignore/preview', 'POST', { patterns: ['bulk/', 'disabled/'] })
    expect(response.status).toBe(200)
    const review = await response.json() as { id: string; counts: { removed: number }; disabledDirectories: string[] }
    expect(review.counts.removed).toBe(55)
    expect(review.disabledDirectories).toContain(disabled)
    const first = await (await request(`/api/settings/ignore/preview/${review.id}?kind=removed&offset=0`)).json() as { items: unknown[]; total: number }
    const second = await (await request(`/api/settings/ignore/preview/${review.id}?kind=removed&offset=50`)).json() as { items: unknown[]; total: number }
    expect([first.items.length, second.items.length, first.total, second.total]).toEqual([50, 5, 55, 55])
    expect((await request(`/api/settings/ignore/preview/${review.id}/accept`, 'POST')).status).toBe(200)
    expect(sqlite.query('SELECT count(*) AS count FROM media_files WHERE path = ?').get(disabledFile)).toEqual({ count: 1 })
    expect(existsSync(join(bulk, 'file-0.txt'))).toBe(true)
})
