import { describe, expect, test } from 'bun:test'
import { cleanPortalReference, normalizeResearchAddress, normalizedParcelId, parsePortalDeedDate, parsePortalDeeds, parsePortalDeedResponse } from './tarrantDeeds'

describe('Tarrant deed data', () => {
    test('normalizes TAD addresses and parcel identifiers', () => {
        expect(normalizeResearchAddress('2345 Lofton Terrace')).toBe(normalizeResearchAddress('2345  LOFTON TERR'))
        expect(normalizedParcelId('000002126729')).toBe('2126729')
        expect(normalizedParcelId('invalid')).toBe('')
    })

    test('retains valid deed dates and excludes placeholders', () => {
        expect(parsePortalDeedDate('2005-06-01 00:00:20')).toBe('2005-06-01')
        expect(parsePortalDeedDate('1900-12-31 00:00:00')).toBeNull()
        expect(parsePortalDeedDate('2026-02-31 00:00:00')).toBeNull()
        expect(cleanPortalReference('0000000')).toBeNull()
        expect(cleanPortalReference('D205222165')).toBe('D205222165')
    })

    test('accepts empty results and rejects malformed or duplicate deeds', () => {
        const deed = { deedID: 1, deedType: 'WD', deedDescription: 'Warranty Deed', deedDt: null, seller: null, buyer: 'Buyer', volume: null, book: null, page: null, instrumentNum: null }
        expect(parsePortalDeeds({ results: [] })).toEqual([])
        expect(parsePortalDeedResponse(204, null)).toEqual([])
        expect(() => parsePortalDeedResponse(200, null)).toThrow()
        expect(parsePortalDeeds({ results: [deed] })).toHaveLength(1)
        expect(() => parsePortalDeeds({ results: [deed, deed] })).toThrow()
        expect(() => parsePortalDeeds({ results: [{ ...deed, buyer: 12 }] })).toThrow()
        expect(() => parsePortalDeeds({})).toThrow()
    })
})