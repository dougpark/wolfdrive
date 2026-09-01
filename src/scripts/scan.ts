import { scanAllUserDirectories } from '../services/scanner'

console.log('🔍 Starting local media scan...')
const startTime = performance.now()

scanAllUserDirectories('usr_default')
    .then(({ totalIndexed, totalSkipped }) => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
        console.log(`✅ Scan completed in ${elapsed}s: ${totalIndexed} files indexed/updated, ${totalSkipped} unchanged.`)
        process.exit(0)
    })
    .catch((err) => {
        console.error('❌ Scan failed:', err)
        process.exit(1)
    })

// Run with `bun run src/scripts/scan.ts` to scan all user directories and index media files.

/*
Aug 31, 2026
bun run src/scripts/scan.ts
🔍 Starting local media scan...
✅ Scan completed in 50.94s: 12767 files indexed/updated, 10882 unchanged.

*/