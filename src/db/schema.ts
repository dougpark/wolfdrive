import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
})

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
    sizeBytes: integer('size_bytes').notNull(),
    mtimeMs: integer('mtime_ms').notNull(),
    indexedAt: text('indexed_at').default(sql`CURRENT_TIMESTAMP`),
})

// app_settings table for storing application-wide settings, such as ignore patterns, scan intervals, etc.
export const appSettings = sqliteTable('app_settings', {
    key: text('key').primaryKey(), // e.g., 'ignore_patterns'
    value: text('value').notNull(), // JSON string blob
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
})

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