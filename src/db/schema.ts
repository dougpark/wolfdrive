import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm'

// 0. Core Media File Metadata
export const files = sqliteTable('files', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull().unique(),
    size: integer('size').notNull(),
    mimeType: text('mime_type'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});


// 1. User Identity & Settings Profile
export const users = sqliteTable('users', {
    id: text('id').primaryKey(), // e.g., 'usr_default'
    name: text('name').notNull(),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

// 2. Registered scan directories
export const mediaDirectories = sqliteTable('media_directories', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    label: text('label'), // Optional display name (e.g., "Family Photos")
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastScannedAt: text('last_scanned_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('media_directories_user_id_idx').on(table.userId),
])

// 3. Media Files Table
export const mediaFiles = sqliteTable('media_files', {
    id: text('id').primaryKey(),
    directoryId: text('directory_id').notNull().references(() => mediaDirectories.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull().unique(), // Absolute filesystem path
    relativePath: text('relative_path').notNull(),
    filename: text('filename').notNull(),
    extension: text('extension').notNull(),
    mimeType: text('mime_type'),
    mediaCategory: text('media_category').notNull(), // 'image' | 'video' | 'audio' | 'document' | 'other'
    /** User-assigned library category ids (JSON array), additive to the mime-derived mediaCategory. */
    customCategories: text('custom_categories', { mode: 'json' }).$type<string[]>(),
    sizeBytes: integer('size_bytes').notNull(),
    mtimeMs: integer('mtime_ms').notNull(),
    indexedAt: text('indexed_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('media_files_user_mtime_idx').on(table.userId, table.mtimeMs),
    index('media_files_user_category_mtime_idx').on(table.userId, table.mediaCategory, table.mtimeMs),
    index('media_files_user_directory_category_idx').on(table.userId, table.directoryId, table.mediaCategory),
    // Sort support for the file browser columns (Name / Type / Size), filtered and unfiltered.
    index('media_files_user_filename_idx').on(table.userId, table.filename),
    index('media_files_user_extension_idx').on(table.userId, table.extension),
    index('media_files_user_size_idx').on(table.userId, table.sizeBytes),
    index('media_files_user_category_filename_idx').on(table.userId, table.mediaCategory, table.filename),
    index('media_files_user_category_extension_idx').on(table.userId, table.mediaCategory, table.extension),
    index('media_files_user_category_size_idx').on(table.userId, table.mediaCategory, table.sizeBytes),
])

// 3b. User-defined tags (free-form, unbounded — unlike the fixed customCategories set)
export const tags = sqliteTable('tags', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // display casing, e.g. "Family Vacation"
    slug: text('slug').notNull(), // normalized lowercase/trimmed for case-insensitive uniqueness & lookups
    color: text('color'), // optional hex accent for chip rendering
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('tags_user_slug_idx').on(table.userId, table.slug),
    index('tags_user_id_idx').on(table.userId),
])

// 3c. File <-> Tag join. Composite unique index also covers "tags for file" lookups;
// the standalone tag_id index is what makes "files with tag X" filtering fast at 100k+ files.
export const fileTags = sqliteTable('file_tags', {
    fileId: text('file_id').notNull().references(() => mediaFiles.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('file_tags_file_tag_idx').on(table.fileId, table.tagId),
    index('file_tags_tag_id_idx').on(table.tagId),
])

// app_settings table for storing application-wide settings, such as ignore patterns, scan intervals, etc.
export const appSettings = sqliteTable('app_settings', {
    key: text('key').primaryKey(), // e.g., 'ignore_patterns'
    value: text('value').notNull(), // JSON string blob
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
})

// 4. eBook Reader State (per user, per file)
export const readingState = sqliteTable('reading_state', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileId: text('file_id').notNull().references(() => mediaFiles.id, { onDelete: 'cascade' }),
    cfi: text('cfi'), // epub.js Canonical Fragment Identifier for the last read position
    farthestCfi: text('farthest_cfi'), // High-water mark: the furthest CFI ever reached
    fontSize: integer('font_size').notNull().default(15),
    totalChars: integer('total_chars'), // Book text length from epub.js locations; computed once, immutable per file
    percentRead: integer('percent_read'), // Last known reading progress 0–100, computed client-side via epub.js locations
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('reading_state_user_file_idx').on(table.userId, table.fileId),
])

// 3. Example: User-bound eBook Progress
// export const ebookProgress = sqliteTable('ebook_progress', {
//     id: text('id').primaryKey(),
//     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
//     fileHash: text('file_hash').notNull(),
//     cfiLocation: text('cfi_location').notNull(), // EPUB location marker
//     percentage: integer('percentage').notNull().default(0),
//     updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
// })

// 4. Example: Custom Playlists / Albums
// export const playlists = sqliteTable('playlists', {
//     id: text('id').primaryKey(),
//     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
//     name: text('name').notNull(),
//     mediaType: text('media_type').notNull(), // 'audio' | 'video' | 'photo'
//     createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
// })