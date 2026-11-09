export type PortalDeed = {
    deedID: number
    deedType: string | null
    deedDescription: string | null
    deedDt: string | null
    seller: string | null
    buyer: string | null
    volume: string | null
    book: string | null
    page: string | null
    instrumentNum: string | null
}

export function normalizeResearchAddress(value: string) {
    const aliases: Record<string, string> = {
        AVE: 'AVENUE', BLVD: 'BOULEVARD', CT: 'COURT', DR: 'DRIVE',
        E: 'EAST', LN: 'LANE', N: 'NORTH', PKWY: 'PARKWAY', PL: 'PLACE',
        RD: 'ROAD', S: 'SOUTH', ST: 'STREET', TERR: 'TERRACE', W: 'WEST',
    }
    return value.toUpperCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
        .map((part) => aliases[part] ?? part).join(' ')
}

export function normalizedParcelId(value: string) {
    const trimmed = value.trim()
    return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, '') : ''
}

export function cleanPortalReference(value: string | null) {
    const trimmed = value?.trim()
    return trimmed && !/^0+$/.test(trimmed) ? trimmed : null
}

export function parsePortalDeedDate(value: string | null) {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|T|$)/)
    if (!match) return null
    const [, year, month, day] = match
    if (!year || !month || !day || Number(year) <= 1900) return null
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null
    return `${year}-${month}-${day}`
}

export function parsePortalDeeds(value: unknown): PortalDeed[] {
    if (!value || typeof value !== 'object' || !('results' in value) || !Array.isArray(value.results)) {
        throw new Error('Unexpected deed-history response: results array is missing.')
    }
    const ids = new Set<number>()
    return value.results.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new Error('Invalid deed-history record.')
        const record = item as Record<string, unknown>
        if (!Number.isSafeInteger(record.deedID) || (record.deedID as number) <= 0 || ids.has(record.deedID as number)) {
            throw new Error('Invalid or duplicate deed ID in response.')
        }
        ids.add(record.deedID as number)
        const fields = ['deedType', 'deedDescription', 'deedDt', 'seller', 'buyer', 'volume', 'book', 'page', 'instrumentNum'] as const
        for (const field of fields) {
            if (record[field] !== null && typeof record[field] !== 'string') {
                throw new Error(`Invalid deed-history field: ${field}`)
            }
        }
        return record as PortalDeed
    })
}

export function parsePortalDeedResponse(status: number, value: unknown): PortalDeed[] {
    return status === 204 ? [] : parsePortalDeeds(value)
}