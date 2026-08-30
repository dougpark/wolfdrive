import { db } from './index'
import { users } from './schema'
import { eq } from 'drizzle-orm'

export async function ensureDefaultUser() {
    const existing = await db.select().from(users).where(eq(users.isDefault, true)).get()

    if (!existing) {
        await db.insert(users).values({
            id: 'usr_default',
            name: 'Primary User',
            isDefault: true,
        })
    }
}