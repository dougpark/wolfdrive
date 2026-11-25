import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
