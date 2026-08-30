import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm'

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

// 2. Example: User-bound eBook Progress
// export const ebookProgress = sqliteTable('ebook_progress', {
//     id: text('id').primaryKey(),
//     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
//     fileHash: text('file_hash').notNull(),
//     cfiLocation: text('cfi_location').notNull(), // EPUB location marker
//     percentage: integer('percentage').notNull().default(0),
//     updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
// })

// 3. Example: Custom Playlists / Albums
// export const playlists = sqliteTable('playlists', {
//     id: text('id').primaryKey(),
//     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
//     name: text('name').notNull(),
//     mediaType: text('media_type').notNull(), // 'audio' | 'video' | 'photo'
//     createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
// })