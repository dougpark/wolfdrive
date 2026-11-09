import { basename } from 'node:path'
import { db } from '../db'
import { researchAddresses, researchPropertyOwners, researchSources } from '../db/schema'

interface TADRecord {
    sourceFile: string
    propertyId: string
    appraisalYear: string
    supplementNumber: string
    supplementAction: string
    ownerId: string
    ownerName: string
    situsAddress: string
    legalDescription: string
    deedBook: string
    deedPage: string
    deedDate: string
}

const args = Bun.argv.slice(2)
const apply = args.includes('--apply')
const inputPath = args.find((arg) => !arg.startsWith('--')) ?? 'data-research/tarrant_county/parkhill_property_records.jsonl'

function normalizeAddress(value: string) {
    const aliases: Record<string, string> = {
        AVE: 'AVENUE',
        BLVD: 'BOULEVARD',
        CT: 'COURT',
        DR: 'DRIVE',
        E: 'EAST',
        LN: 'LANE',
        N: 'NORTH',
        PKWY: 'PARKWAY',
        PL: 'PLACE',
        RD: 'ROAD',
        S: 'SOUTH',
        ST: 'STREET',
        TERR: 'TERRACE',
        W: 'WEST',
    }

    return value.toUpperCase()
        .replace(/[.,]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => aliases[part] ?? part)
        .join(' ')
}

function parseTadDate(value: string) {
    const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
    if (!match) return null

    const [, month, day, year] = match
    if (!month || !day || !year || year === '1900') return null

    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
        return null
    }
    return `${year}-${month}-${day}`
}

function meaningfulReference(value: string) {
    const normalized = value.trim()
    return normalized && !/^0+$/.test(normalized) ? normalized : null
}

if (!(await Bun.file(inputPath).exists())) {
    throw new Error(`TAD extraction file not found: ${inputPath}`)
}

const addresses = await db.select().from(researchAddresses)
const addressByNormalized = new Map(addresses.map((address) => [normalizeAddress(address.address), address]))
if (addressByNormalized.size !== addresses.length) {
    throw new Error('Research addresses contain duplicate normalized address keys; resolve them before importing TAD owners.')
}

const records = (await Bun.file(inputPath).text()).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
        return JSON.parse(line) as TADRecord
    } catch {
        throw new Error(`Invalid JSON on line ${index + 1} of ${inputPath}`)
    }
})
const sourceFile = records[0]?.sourceFile ?? basename(inputPath)
const exportDate = sourceFile.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
const sourceId = `tad_${sourceFile.replace(/[^a-zA-Z0-9_-]/g, '_')}`

const ownersToImport: Array<typeof researchPropertyOwners.$inferInsert> = []
const representedAddressIds = new Set<string>()
const certifiedAddressIds = new Set<string>()
const supplementalAddressIds = new Set<string>()
let supplementalForReview = 0
let unmatchedRecords = 0
let missingDeedDates = 0

for (const record of records) {
    const address = addressByNormalized.get(normalizeAddress(record.situsAddress))
    if (address) representedAddressIds.add(address.id)

    if (Number(record.supplementNumber) !== 0) {
        supplementalForReview += 1
        if (address) supplementalAddressIds.add(address.id)
        continue
    }

    if (!address) {
        unmatchedRecords += 1
        continue
    }
    if (!record.ownerName.trim()) continue

    certifiedAddressIds.add(address.id)
    const deedBook = meaningfulReference(record.deedBook)
    const deedPage = meaningfulReference(record.deedPage)
    const deedReference = deedBook || deedPage
        ? [deedBook && `Book ${deedBook}`, deedPage && `Page ${deedPage}`].filter(Boolean).join(', ')
        : null
    const recordedDeedDate = parseTadDate(record.deedDate)
    if (!recordedDeedDate) missingDeedDates += 1

    ownersToImport.push({
        id: `tad_${record.appraisalYear}_${record.propertyId}_${record.supplementNumber}_${record.ownerId}`,
        addressId: address.id,
        sourceId,
        ownerName: record.ownerName.trim(),
        recordedDeedDate,
        parcelId: record.propertyId,
        deedReference,
        appraisalYear: Number(record.appraisalYear) || null,
        supplementNumber: 0,
        supplementAction: record.supplementAction.trim() || null,
        legalDescription: record.legalDescription.trim() || null,
        verificationStatus: 'unverified',
        notes: `TAD appraisal-roll owner record from ${exportDate ?? sourceFile}; this does not establish a complete ownership period.`,
    })
}

const report = {
    mode: apply ? 'apply' : 'dry-run',
    sourceFile,
    exportDate,
    extractedRows: records.length,
    researchAddresses: addresses.length,
    certifiedOwnerRowsMatched: ownersToImport.length,
    targetAddressesRepresentedByAnyRow: representedAddressIds.size,
    targetAddressesWithCertifiedRows: certifiedAddressIds.size,
    targetAddressesWithSupplementOnlyRows: [...supplementalAddressIds].filter((id) => !certifiedAddressIds.has(id)).length,
    targetAddressesWithoutAnyTadRow: addresses.length - representedAddressIds.size,
    supplementalRowsForManualReview: supplementalForReview,
    supplementalRowsForTargetAddresses: supplementalAddressIds.size,
    recordsOutsideResearchAddressList: unmatchedRecords,
    rowsWithoutUsableDeedDate: missingDeedDates,
}

if (apply && ownersToImport.length) {
    db.transaction((tx) => {
        tx.insert(researchSources).values({
            id: sourceId,
            sourceType: 'tad_appraisal_roll',
            name: `Tarrant Appraisal District ${exportDate ?? 'appraisal roll'}`,
            citation: `${sourceFile}, subdivision code 31620, Property records.`,
            externalId: sourceFile,
            retrievedAt: exportDate,
        }).onConflictDoNothing().run()

        for (const owner of ownersToImport) {
            tx.insert(researchPropertyOwners).values(owner).onConflictDoNothing().run()
        }
    })
}

console.log(JSON.stringify(report, null, 2))
