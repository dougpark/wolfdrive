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

// Project metadata extends a tag without changing the file membership model.
export const projects = sqliteTable('projects', {
    tagId: text('tag_id').primaryKey().references(() => tags.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    description: text('description'),
    status: text('status').notNull().default('active'),
    dueDate: text('due_date'),
    customMetadata: text('custom_metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('projects_user_status_idx').on(table.userId, table.status),
    index('projects_user_due_date_idx').on(table.userId, table.dueDate),
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

// Research targets are imported independently of later claims and source records.
export const researchAddresses = sqliteTable('research_addresses', {
    id: text('id').primaryKey(),
    address: text('address').notNull(),
    shortAddress: text('short_address').notNull(),
    importedResident1: text('imported_resident_1'),
    importedResident2: text('imported_resident_2'),
    importSource: text('import_source').notNull().default('research_export.csv'),
    importedAt: text('imported_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('research_addresses_short_address_idx').on(table.shortAddress),
    index('research_addresses_address_idx').on(table.address),
])

// Sources retain citation details so later OCR, owner, and event claims stay traceable.
export const researchSources = sqliteTable('research_sources', {
    id: text('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    citation: text('citation'),
    externalId: text('external_id'),
    retrievedAt: text('retrieved_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('research_sources_type_idx').on(table.sourceType),
])

export const researchPropertyOwners = sqliteTable('research_property_owners', {
    id: text('id').primaryKey(),
    addressId: text('address_id').notNull().references(() => researchAddresses.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').references(() => researchSources.id, { onDelete: 'set null' }),
    ownerName: text('owner_name').notNull(),
    startDate: text('start_date'),
    endDate: text('end_date'),
    recordedDeedDate: text('recorded_deed_date'),
    parcelId: text('parcel_id'),
    deedReference: text('deed_reference'),
    appraisalYear: integer('appraisal_year'),
    supplementNumber: integer('supplement_number'),
    supplementAction: text('supplement_action'),
    legalDescription: text('legal_description'),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('research_property_owners_address_idx').on(table.addressId),
    index('research_property_owners_name_idx').on(table.ownerName),
])

export const researchEvents = sqliteTable('research_events', {
    id: text('id').primaryKey(),
    addressId: text('address_id').notNull().references(() => researchAddresses.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').references(() => researchSources.id, { onDelete: 'set null' }),
    eventDate: text('event_date'),
    eventType: text('event_type').notNull().default('general'),
    title: text('title'),
    summary: text('summary'),
    excerpt: text('excerpt'),
    rawText: text('raw_text'),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    extractionData: text('extraction_data', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
    index('research_events_address_idx').on(table.addressId),
    index('research_events_type_idx').on(table.eventType),
    index('research_events_date_idx').on(table.eventDate),
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