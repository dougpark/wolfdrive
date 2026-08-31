import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = './data/wolfdrive.db';

// Ensure the ./data folder exists before SQLite tries to open the file
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

console.log('Running database migrations...');
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Database schema is now up to date.');