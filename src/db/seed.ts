import { db } from './index'
import { users } from './schema'
import { eq } from 'drizzle-orm'

export async function seedDefaultUser() {
    console.log('👤 Checking for default user profile...')

    const existingDefaultUser = await db
        .select()
        .from(users)
        .where(eq(users.isDefault, true))
        .get()

    if (!existingDefaultUser) {
        await db.insert(users).values({
            id: 'usr_default',
            name: 'Primary User',
            isDefault: true,
        })
        console.log('✅ Default user created (id: usr_default).')
    } else {
        console.log('ℹ️ Default user already exists.')
    }
}

// Execute immediately when called from CLI
seedDefaultUser().catch((err) => {
    console.error('❌ Seeding failed:', err)
    process.exit(1)
})