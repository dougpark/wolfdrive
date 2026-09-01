import { readdir, rename } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'

// Configuration
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate'
const MODEL_NAME = 'gemma4:e4b'

// Parse CLI flags
const args = process.argv.slice(2)
const isDryRun = !args.includes('--execute')
const isRecursive = args.includes('--recursive') || args.includes('-r')
const targetFolder = args.find((arg) => !arg.startsWith('-'))

if (!targetFolder) {
    console.error('❌ Error: Please provide a target folder path.')
    console.log('\nUsage:')
    console.log('  Preview (Single folder):    bun run src/scripts/ai-rename.ts <folder_path>')
    console.log('  Preview (With subfolders):  bun run src/scripts/ai-rename.ts <folder_path> --recursive')
    console.log('  Execute (With subfolders):  bun run src/scripts/ai-rename.ts <folder_path> -r --execute')
    process.exit(1)
}

function buildPrompt(rawFilename: string): string {
    return `You are a strict string sanitizer. Respond ONLY with a valid JSON object. Do not provide explanations, notes, or commentary.

Task: Extract and format the book/file title into a clean Title Case name.
- Remove noise like "pg76-images-3", hashes, random IDs, or chapter image tags.
- Add missing spaces and apply clean Title Case casing.
- Do NOT output file extensions.

Raw Input: "${rawFilename}"

JSON Format: {"name": "Clean Title Here"}`
}

async function getCleanFilenameFromOllama(rawNameWithoutExt: string): Promise<string> {
    try {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: buildPrompt(rawNameWithoutExt),
                stream: false,
                options: {
                    temperature: 0.1,
                },
            }),
        })

        if (!response.ok) {
            throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`)
        }

        const data = (await response.json()) as { response: string }
        let rawOutput = data.response.trim()

        // 1. Strip markdown code fences (```json ... ```)
        rawOutput = rawOutput.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

        // 2. Attempt JSON parsing
        try {
            const parsed = JSON.parse(rawOutput)
            if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
                return parsed.name.trim().replace(/[\/\\:*?"<>|]/g, '')
            }
        } catch {
            // Regex fallback to grab {"name": "..."}
            const jsonMatch = rawOutput.match(/"name"\s*:\s*"([^"]+)"/)
            if (jsonMatch && jsonMatch[1]) {
                return jsonMatch[1].trim().replace(/[\/\\:*?"<>|]/g, '')
            }
        }

        // 3. Fallback to first non-empty line
        const lines = rawOutput.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
        let cleaned = lines[0] || rawNameWithoutExt

        // 4. Clean echo headers and invalid OS characters
        cleaned = cleaned.replace(/^(cleaned name|clean name|cleaned|title|filename):\s*/i, '')
        cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').replace(/[\/\\:*?"<>|]/g, '').trim()

        return cleaned || rawNameWithoutExt
    } catch (err) {
        console.error(`⚠️  Ollama error for "${rawNameWithoutExt}":`, err)
        return rawNameWithoutExt
    }
}

async function processDirectory(dirPath: string) {
    console.log(`\n🤖 Starting AI Filename Cleanup`)
    console.log(`📁 Target Directory: ${dirPath}`)
    console.log(`🔄 Recursion: ${isRecursive ? 'ENABLED (Processing subfolders)' : 'DISABLED (Top-level folder only)'}`)
    console.log(`⚙️  Mode: ${isDryRun ? 'DRY RUN (Previewing changes only)' : 'LIVE EXECUTION'}\n`)

    try {
        // Enable recursive directory traversal if flag is set
        const entries = await readdir(dirPath, { withFileTypes: true, recursive: isRecursive })
        let processedCount = 0
        let skippedCount = 0

        for (const entry of entries) {
            if (!entry.isFile() || entry.name.startsWith('.')) continue

            const ext = extname(entry.name)
            const nameWithoutExt = basename(entry.name, ext)
            const parentDir = entry.parentPath ?? (entry as any).path ?? dirPath

            if (nameWithoutExt.length < 3) continue

            const relSubPath = join(parentDir.replace(dirPath, ''), entry.name)
            console.log(`Processing: "${relSubPath}"...`)

            const cleanedBase = await getCleanFilenameFromOllama(nameWithoutExt)
            const candidateName = `${cleanedBase}${ext}`

            if (candidateName === entry.name) {
                console.log(`  └─ ⏩ Unchanged`)
                skippedCount++
                continue
            }

            // Handle collisions safely
            let finalTargetName = candidateName
            let currentPath = join(parentDir, entry.name)
            let targetPath = join(parentDir, finalTargetName)
            let counter = 1

            while (targetPath !== currentPath && (await Bun.file(targetPath).exists())) {
                finalTargetName = `${cleanedBase} (${counter})${ext}`
                targetPath = join(parentDir, finalTargetName)
                counter++
            }

            console.log(`  └─ ✏️  ${entry.name} -> ${finalTargetName}`)

            if (!isDryRun) {
                await rename(currentPath, targetPath)
            }

            processedCount++
        }

        console.log('\n--- AI Cleanup Summary ---')
        console.log(`Processed/Renamed: ${processedCount}`)
        console.log(`Unchanged/Skipped: ${skippedCount}`)

        if (isDryRun && processedCount > 0) {
            console.log('\n💡 To apply these renames to disk, add the --execute flag:')
            console.log(`   bun run src/scripts/ai-rename.ts "${dirPath}" ${isRecursive ? '-r ' : ''}--execute`)
        }
    } catch (err) {
        console.error('❌ Failed to process folder:', err)
    }
}

processDirectory(targetFolder)

/**
 * August 31, 2026
 * Usage:
 * bun run src/scripts/ai-rename.ts /mnt/world/Production/reference -r
 * 
 * Example:
 * bun run src/scripts/ai-rename.ts /mnt/world/Production/reference/ebook_library/Finance --execute
 */