import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { appSettings, directoryTags, fileTags, mediaDirectories, mediaFiles, readingState, tags } from '../db/schema'
import { getMediaCategory, shouldIgnore } from './scanner'

type FileRow = typeof mediaFiles.$inferSelect
type Directory = typeof mediaDirectories.$inferSelect
type StagedFile = Pick<FileRow, 'path' | 'directoryId' | 'userId' | 'relativePath' | 'filename' | 'extension' | 'mimeType' | 'mediaCategory' | 'sizeBytes' | 'mtimeMs'>
type Kind = 'added' | 'changed' | 'removed'

interface Impact {
    tags: string[]
    categories: string[]
    aiSummary: string | null
    aiTags: string[]
    hasReadingProgress: boolean
}

interface Change {
    path: string
    reason: string
    before: StagedFile | null
    after: StagedFile | null
    impact: Impact | null
    fileId: string | null
    beforeFolder: string | null
    afterFolder: string | null
    beforeFolderTags: string[]
    afterFolderTags: string[]
}

interface Snapshot {
    directories: Directory[]
    files: FileRow[]
    allFiles: FileRow[]
    fileTagRows: { fileId: string; tagId: string; name: string | null }[]
    directoryTagRows: { directoryId: string; tagId: string; name: string | null }[]
    readingRows: (typeof readingState.$inferSelect)[]
    rules: typeof appSettings.$inferSelect | undefined
    fingerprint: string
}

interface Preview {
    id: string
    userId: string
    patterns: string[]
    snapshotHash: string
    filesystemHash: string
    expiresAt: number
    changes: Record<Kind, Change[]>
    disabledDirectories: string[]
}

const PREVIEW_TTL_MS = 15 * 60 * 1000
const previews = new Map<string, Preview>()

export class IgnoreReviewError extends Error {
    constructor(message: string, readonly status: number) { super(message) }
}

function hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function snapshot(userId: string): Snapshot {
    const directories = db.select().from(mediaDirectories).where(eq(mediaDirectories.userId, userId)).orderBy(asc(mediaDirectories.id)).all()
    // Paths are globally unique, including across users.
    const allFiles = db.select().from(mediaFiles).orderBy(asc(mediaFiles.path)).all()
    const files = allFiles.filter((file) => file.userId === userId)
    const fileTagRows = db.select({ fileId: fileTags.fileId, tagId: fileTags.tagId, name: tags.name })
        .from(fileTags).innerJoin(mediaFiles, eq(fileTags.fileId, mediaFiles.id))
        .leftJoin(tags, eq(fileTags.tagId, tags.id))
        .where(eq(mediaFiles.userId, userId)).orderBy(asc(fileTags.fileId), asc(fileTags.tagId)).all()
    const directoryTagRows = db.select({ directoryId: directoryTags.directoryId, tagId: directoryTags.tagId, name: tags.name })
        .from(directoryTags).innerJoin(mediaDirectories, eq(directoryTags.directoryId, mediaDirectories.id))
        .leftJoin(tags, eq(directoryTags.tagId, tags.id))
        .where(eq(mediaDirectories.userId, userId)).orderBy(asc(directoryTags.directoryId), asc(directoryTags.tagId)).all()
    const readingRows = db.select({ state: readingState }).from(readingState)
        .innerJoin(mediaFiles, eq(readingState.fileId, mediaFiles.id))
        .where(eq(mediaFiles.userId, userId)).orderBy(asc(readingState.id)).all().map((row) => row.state)
    const rules = db.select().from(appSettings).where(eq(appSettings.key, 'ignore_patterns')).get()
    return { directories, files, allFiles, fileTagRows, directoryTagRows, readingRows, rules, fingerprint: hash({ directories, allFiles, fileTagRows, directoryTagRows, readingRows, rules }) }
}

function validatePatterns(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 1000 || value.some((pattern) => typeof pattern !== 'string' || pattern.length > 4096 || pattern.includes('\0'))) {
        throw new IgnoreReviewError('Rules must be an array of at most 1000 strings.', 400)
    }
    const patterns: string[] = value.map((pattern: string) => pattern.trim()).filter(Boolean)
    for (const pattern of patterns) {
        if (pattern.startsWith('!')) throw new IgnoreReviewError('Negated ignore rules are not supported.', 400)
        if (!pattern.startsWith('#')) {
            try { new Bun.Glob(pattern) } catch { throw new IgnoreReviewError(`Invalid ignore pattern: ${pattern}`, 400) }
        }
    }
    return patterns
}

async function stage(snapshot: Snapshot, patterns: string[]) {
    const eligible = new Map<string, StagedFile[]>()
    const excluded = new Set<string>()
    const observations: string[] = []
    const enabled = snapshot.directories.filter((directory) => directory.enabled)
    for (const directory of enabled) {
        const root = await stat(directory.path)
        if (!root.isDirectory()) throw new Error(`Not a directory: ${directory.path}`)
        observations.push(JSON.stringify([directory.id, directory.path, root.dev, root.ino]))
        const entries = await readdir(directory.path, { recursive: true, withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile()) continue
            const parent = entry.parentPath ?? (entry as { path?: string }).path ?? directory.path
            const path = join(parent, entry.name)
            const info = await stat(path)
            if (!info.isFile()) throw new Error(`File changed during scan: ${path}`)
            const relativePath = relative(directory.path, path)
            const ignored = entry.name.startsWith('.') || shouldIgnore(relativePath, entry.name, patterns, directory.path)
            observations.push(JSON.stringify([directory.id, path, info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, ignored]))
            if (ignored) {
                excluded.add(path)
                continue
            }
            const extension = extname(entry.name).toLowerCase().replace('.', '')
            const mimeType = Bun.file(path).type || 'application/octet-stream'
            const file: StagedFile = {
                path, directoryId: directory.id, userId: directory.userId, relativePath, filename: entry.name,
                extension, mimeType, mediaCategory: getMediaCategory(mimeType, extension),
                sizeBytes: info.size, mtimeMs: Math.trunc(info.mtimeMs),
            }
            const matches = eligible.get(path) ?? []
            matches.push(file)
            eligible.set(path, matches)
        }
    }
    observations.sort()
    return { eligible, excluded, filesystemHash: hash(observations) }
}

function basic(file: FileRow): StagedFile {
    const { path, directoryId, userId, relativePath, filename, extension, mimeType, mediaCategory, sizeBytes, mtimeMs } = file
    return { path, directoryId, userId, relativePath, filename, extension, mimeType, mediaCategory, sizeBytes, mtimeMs }
}

function diff(current: Snapshot, staged: Awaited<ReturnType<typeof stage>>): Record<Kind, Change[]> {
    const changes: Record<Kind, Change[]> = { added: [], changed: [], removed: [] }
    const files = new Map(current.allFiles.map((file) => [file.path, file]))
    const enabledIds = new Set(current.directories.filter((directory) => directory.enabled).map((directory) => directory.id))
    const tagNames = new Map<string, string[]>()
    for (const row of current.fileTagRows) {
        const names = tagNames.get(row.fileId) ?? []
        names.push(row.name ?? `(deleted tag ${row.tagId})`)
        tagNames.set(row.fileId, names)
    }
    const readingIds = new Set(current.readingRows.map((row) => row.fileId))
    const folders = new Map(current.directories.map((directory) => [directory.id, directory.path]))
    const folderTags = new Map<string, string[]>()
    for (const row of current.directoryTagRows) {
        const names = folderTags.get(row.directoryId) ?? []
        names.push(row.name ?? `(deleted tag ${row.tagId})`)
        folderTags.set(row.directoryId, names)
    }
    const folderDetails = (before: StagedFile | null, after: StagedFile | null) => ({
        beforeFolder: before ? folders.get(before.directoryId) ?? null : null,
        afterFolder: after ? folders.get(after.directoryId) ?? null : null,
        beforeFolderTags: before ? folderTags.get(before.directoryId) ?? [] : [],
        afterFolderTags: after ? folderTags.get(after.directoryId) ?? [] : [],
    })
    const impact = (file: FileRow): Impact => ({
        tags: tagNames.get(file.id) ?? [], categories: file.customCategories ?? [],
        aiSummary: file.aiSummary, aiTags: file.aiTags ?? [], hasReadingProgress: readingIds.has(file.id),
    })
    for (const [path, candidates] of staged.eligible) {
        const previous = files.get(path)
        if (previous && !enabledIds.has(previous.directoryId)) {
            throw new IgnoreReviewError(`A scanned path is already indexed under another user or disabled folder: ${path}`, 409)
        }
        const next = candidates.find((candidate) => candidate.directoryId === previous?.directoryId) ?? candidates[0]!
        if (!previous) {
            changes.added.push({ path, reason: 'New file', before: null, after: next, impact: null, fileId: null, ...folderDetails(null, next) })
        } else if (hash(basic(previous)) !== hash(next)) {
            const contentChanged = previous.sizeBytes !== next.sizeBytes || previous.mtimeMs !== next.mtimeMs
            changes.changed.push({
                path, reason: contentChanged ? 'File metadata changed' : 'Indexed folder or file type changed',
                before: basic(previous), after: next, impact: impact(previous), fileId: previous.id, ...folderDetails(basic(previous), next),
            })
        }
    }
    for (const file of current.files) {
        if (!enabledIds.has(file.directoryId) || staged.eligible.has(file.path)) continue
        changes.removed.push({
            path: file.path, reason: staged.excluded.has(file.path) ? 'Excluded by proposed rules or hidden-file policy' : 'Missing from scanned folders',
            before: basic(file), after: null, impact: impact(file), fileId: file.id, ...folderDetails(basic(file), null),
        })
    }
    for (const kind of ['added', 'changed', 'removed'] as const) {
        changes[kind].sort((a, b) => a.path.localeCompare(b.path))
    }
    return changes
}

function getPreview(userId: string, id: string): Preview {
    const preview = previews.get(id)
    if (!preview || preview.userId !== userId || preview.expiresAt <= Date.now()) {
        if (preview?.expiresAt && preview.expiresAt <= Date.now()) previews.delete(id)
        throw new IgnoreReviewError('Preview expired or not found. Create a new preview.', 404)
    }
    return preview
}

export async function createIgnorePreview(userId: string, input: unknown) {
    const patterns = validatePatterns(input)
    const current = snapshot(userId)
    const staged = await stage(current, patterns)
    if (snapshot(userId).fingerprint !== current.fingerprint) throw new IgnoreReviewError('The index changed during the scan. Create a new preview.', 409)
    const changes = diff(current, staged)
    for (const [id, preview] of previews) if (preview.userId === userId) previews.delete(id)
    const preview: Preview = {
        id: crypto.randomUUID(), userId, patterns, snapshotHash: current.fingerprint, filesystemHash: staged.filesystemHash,
        expiresAt: Date.now() + PREVIEW_TTL_MS, changes,
        disabledDirectories: current.directories.filter((dir) => !dir.enabled).map((dir) => dir.path),
    }
    previews.set(preview.id, preview)
    const timer = setTimeout(() => previews.delete(preview.id), PREVIEW_TTL_MS)
    timer.unref()
    return {
        id: preview.id, expiresAt: new Date(preview.expiresAt).toISOString(),
        counts: { added: changes.added.length, changed: changes.changed.length, removed: changes.removed.length },
        disabledDirectories: preview.disabledDirectories,
        missingCount: changes.removed.filter((change) => change.reason === 'Missing from scanned folders').length,
        indexedCount: current.files.filter((file) => current.directories.some((dir) => dir.id === file.directoryId && dir.enabled)).length,
    }
}

export function getIgnorePreviewPage(userId: string, id: string, kind: Kind, offset: number, limit: number) {
    const preview = getPreview(userId, id)
    return { items: preview.changes[kind].slice(offset, offset + limit), total: preview.changes[kind].length, offset, limit }
}

export function discardIgnorePreview(userId: string, id: string) {
    getPreview(userId, id)
    previews.delete(id)
}

export async function acceptIgnorePreview(userId: string, id: string) {
    const preview = getPreview(userId, id)
    const current = snapshot(userId)
    if (current.fingerprint !== preview.snapshotHash) throw new IgnoreReviewError('The index or rules changed. Create a new preview.', 409)
    const staged = await stage(current, preview.patterns)
    if (staged.filesystemHash !== preview.filesystemHash) throw new IgnoreReviewError('The filesystem changed. Create a new preview.', 409)
    const now = new Date().toISOString()
    db.transaction((tx) => {
        if (snapshot(userId).fingerprint !== preview.snapshotHash) throw new IgnoreReviewError('The index or rules changed. Create a new preview.', 409)
        if (preview.expiresAt <= Date.now() || previews.get(id) !== preview) throw new IgnoreReviewError('Preview expired or was discarded.', 409)
        const ids = preview.changes.removed.map((change) => change.fileId!)
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400)
            tx.delete(fileTags).where(inArray(fileTags.fileId, chunk)).run()
            tx.delete(readingState).where(inArray(readingState.fileId, chunk)).run()
            tx.delete(mediaFiles).where(inArray(mediaFiles.id, chunk)).run()
        }
        for (const change of preview.changes.changed) {
            const next = change.after!
            const contentChanged = change.before!.sizeBytes !== next.sizeBytes || change.before!.mtimeMs !== next.mtimeMs
            tx.update(mediaFiles).set({
                ...next, indexedAt: now,
                ...(contentChanged ? { aiSummary: null, aiTags: null, aiModel: null, aiIndexedMtimeMs: null } : {}),
            }).where(eq(mediaFiles.id, change.fileId!)).run()
        }
        for (const change of preview.changes.added) {
            tx.insert(mediaFiles).values({
                ...change.after!, id: `file_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, indexedAt: now,
            }).run()
        }
        for (const directory of current.directories) {
            if (directory.enabled) tx.update(mediaDirectories).set({ lastScannedAt: now }).where(eq(mediaDirectories.id, directory.id)).run()
        }
        tx.insert(appSettings).values({ key: 'ignore_patterns', value: JSON.stringify(preview.patterns), updatedAt: now })
            .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(preview.patterns), updatedAt: now } }).run()
    })
    previews.delete(id)
    return { patterns: preview.patterns }
}
