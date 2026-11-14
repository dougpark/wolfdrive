export type AttackMethod = 'exhaustive' | 'dictionary' | 'substitutions'
export type SearchStatus = 'searching' | 'matched' | 'exhausted'

export interface DemoPassword {
    id: number
    label: string
    password: string
}

export interface SearchResult {
    id: number
    mode: 'live' | 'simulated'
    status: SearchStatus
    attempts: bigint
    total: bigint
    elapsedMs: number
    candidate: string
}

export type WorkerCommand =
    | { type: 'start'; passwords: DemoPassword[]; method: AttackMethod; rate: number }
    | { type: 'pause' | 'resume' }

export type WorkerResponse =
    | { type: 'progress'; results: SearchResult[]; finished: boolean }
    | { type: 'error'; message: string }

const DIGITS = '0123456789'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SYMBOLS = ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
const WORDS = ['password', '123456', '12345678', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'monkey', 'dragon', 'football', 'iloveyou']

export function validatePassword(password: string): string | null {
    if (!password.length) return 'Enter a made-up password.'
    if (password.length > 64) return 'Use at most 64 characters for this demonstration.'
    if (/[^\x20-\x7e]/.test(password)) return 'This demonstration supports printable ASCII characters only (including spaces).'
    return null
}

export function alphabetFor(password: string): string {
    const error = validatePassword(password)
    if (error) throw new Error(error)
    return (/[0-9]/.test(password) ? DIGITS : '')
        + (/[a-z]/.test(password) ? LOWER : '')
        + (/[A-Z]/.test(password) ? UPPER : '')
        + (/[^a-zA-Z0-9]/.test(password) ? SYMBOLS : '')
}

export function exhaustiveModel(password: string) {
    const alphabet = alphabetFor(password)
    const base = BigInt(alphabet.length)
    let rank = 0n
    for (const character of password) rank = rank * base + BigInt(alphabet.indexOf(character))
    return { alphabet, total: base ** BigInt(password.length), targetAttempt: rank + 1n }
}

export function dictionaryCandidates(method: 'dictionary' | 'substitutions'): string[] {
    if (method === 'dictionary') return [...WORDS]
    const candidates = new Set<string>()
    for (const word of WORDS) {
        const capitalized = word[0]!.toUpperCase() + word.slice(1)
        const leet = word.replaceAll('a', '@').replaceAll('o', '0').replaceAll('i', '1').replaceAll('e', '3').replaceAll('s', '$')
        for (const stem of [word, capitalized, word.toUpperCase(), leet, leet[0]!.toUpperCase() + leet.slice(1)]) {
            for (const suffix of ['', '1', '123', '!', '123!', '2026', '2026!']) candidates.add(stem + suffix)
        }
    }
    return [...candidates]
}

export function searchModeFor(password: string, method: AttackMethod): SearchResult['mode'] {
    return method !== 'exhaustive' || /^\d{1,6}$/.test(password) ? 'live' : 'simulated'
}

export function patternsFor(password: string): string[] {
    const patterns: string[] = []
    const lower = password.toLowerCase()
    if (WORDS.some(word => lower.includes(word))) patterns.push('Common demo dictionary word')
    if (/(.)\1{2,}/.test(password)) patterns.push('Repeated characters')
    if (['0123', '1234', '2345', '3456', '4567', '5678', '6789', 'abcd', 'qwerty', 'asdf'].some(sequence => lower.includes(sequence))) patterns.push('Sequence or keyboard pattern')
    if (/[a-z]{2,}[0-9!]{2,}$/i.test(password)) patterns.push('Predictable number / symbol suffix')
    if (password.includes(' ')) patterns.push('Contains words / spaces: character-space estimates may overstate strength')
    return patterns
}

export function simulatedAttempts(elapsedMs: number, rate: number, targetAttempt: bigint): bigint {
    return minBigInt(BigInt(Math.floor(elapsedMs)) * BigInt(rate) / 1000n, targetAttempt)
}

export function minBigInt(a: bigint, b: bigint): bigint {
    return a < b ? a : b
}

export function coveragePercent(attempts: bigint, total: bigint): number {
    return Number(attempts * 1_000_000n / total) / 10_000
}

export function compactCount(value: bigint): string {
    if (value < 1_000_000n) return value.toLocaleString('en-US')
    const digits = value.toString()
    return `${digits[0]}.${digits.slice(1, 3)} × 10^${digits.length - 1}`
}

export function formatDuration(seconds: number): string {
    if (seconds < 1) return '< 1 second'
    if (seconds < 60) return `${seconds.toFixed(1)} seconds`
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`
    if (seconds < 31557600) return `${(seconds / 86400).toFixed(1)} days`
    const years = seconds / 31557600
    return `${years < 1_000_000 ? years.toLocaleString('en-US', { maximumFractionDigits: 1 }) : years.toExponential(2)} years`
}
