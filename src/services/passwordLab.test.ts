import { describe, expect, test } from 'bun:test'
import {
    alphabetFor, coveragePercent, dictionaryCandidates, exhaustiveModel, patternsFor, searchModeFor, simulatedAttempts, validatePassword,
} from './passwordLab'

describe('password demonstration models', () => {
    test('preserves leading zeroes and uses one-based exhaustive target positions', () => {
        expect(exhaustiveModel('0000')).toMatchObject({ total: 10_000n, targetAttempt: 1n })
        expect(exhaustiveModel('0427').targetAttempt).toBe(428n)
        expect(exhaustiveModel('9999').targetAttempt).toBe(10_000n)
        expect(exhaustiveModel('000000').total).toBe(1_000_000n)
    })

    test('accounts for mixed alphabets and spaces without overflowing large spaces', () => {
        expect(exhaustiveModel('a7B2q9').total).toBe(62n ** 6n)
        expect(exhaustiveModel('Z8m4Q2r7').total).toBe(62n ** 8n)
        expect(alphabetFor('aA1! ')).toHaveLength(95)
        expect(exhaustiveModel('aA1!' + 'a'.repeat(60)).total).toBe(95n ** 64n)
    })

    test('rejects unsupported inputs rather than computing misleading estimates', () => {
        for (const password of ['', 'a'.repeat(65), 'hello\n', 'café', '🔐']) {
            expect(validatePassword(password)).not.toBeNull()
            expect(() => exhaustiveModel(password)).toThrow()
        }
        expect(validatePassword(' a real space ')).toBeNull()
    })

    test('distinguishes dictionary exhaustion from common substitution matches', () => {
        expect(dictionaryCandidates('dictionary')).not.toContain('Password123!')
        const variants = dictionaryCandidates('substitutions')
        expect(variants).toContain('Password123!')
        expect(variants).toContain('p@$$w0rd')
        expect(variants).not.toContain('y$R9!kV2@wL6')
        expect(new Set(variants).size).toBe(variants.length)
        expect(patternsFor('Password123!')).toContain('Common demo dictionary word')
        expect(patternsFor('Password123!')).toContain('Predictable number / symbol suffix')
        expect(patternsFor('a7B2q9')).toEqual([])
        expect(patternsFor('y$R9!kV2@wL6')).toEqual([])
    })

    test('only chooses real exhaustive search for short numeric targets', () => {
        expect(searchModeFor('000000', 'exhaustive')).toBe('live')
        expect(searchModeFor('12345678', 'exhaustive')).toBe('simulated')
        expect(searchModeFor('a7B2q9', 'exhaustive')).toBe('simulated')
        expect(searchModeFor('a7B2q9', 'substitutions')).toBe('live')
    })

    test('caps modeled attempts at the actual target and keeps tiny coverage honest', () => {
        expect(simulatedAttempts(427, 1000, 428n)).toBe(427n)
        expect(simulatedAttempts(500, 1000, 428n)).toBe(428n)
        expect(simulatedAttempts(1, 1, 10_000n)).toBe(0n)
        expect(coveragePercent(428n, 10_000n)).toBe(4.28)
        expect(coveragePercent(1n, 95n ** 64n)).toBe(0)
        expect(coveragePercent(10_000n, 10_000n)).toBe(100)
    })
})
