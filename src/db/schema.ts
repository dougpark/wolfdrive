import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const files = sqliteTable('files', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull().unique(),
    size: integer('size').notNull(),
    mimeType: text('mime_type'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});