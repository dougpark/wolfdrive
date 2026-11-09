import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'
import { parse } from 'csv-parse'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { researchAddresses, researchSources } from '../db/schema'

type PropertyRecord = {
    propertyId: string
    situsAddress: string
    appraisalYear: string
}

type ResidentialRecord = {
    Account_Num: string
    Situs_Address: string
    Appraisal_Year: string
    Year_Built: string
}

const args = Bun.argv.slice(2)
const apply = args.includes('--apply')
const inputPath = args.find((arg) => !arg.startsWith('--')) ?? 'data-research/tarrant_county/PropertyData(Delimited)_R.txt'
const propertyPath = 'data-research/tarrant_county/parkhill_property_records.jsonl'
const sourceId = 'tad_residential_property_data_r'
const detailPath = 'data-research/tarrant_county/000_Tarrant_All_Taxing_Units/2026-11-06_2026_APPRAISAL_IMPROVEMENT_DETAIL.TXT'
const detailSourceId = 'tad_2026-11-06_improvement_detail'

function normalizeAddress(value: string) {
    const aliases: Record<string, string> = {
        AVE: 'AVENUE', BLVD: 'BOULEVARD', CT: 'COURT', DR: 'DRIVE',
        E: 'EAST', LN: 'LANE', N: 'NORTH', PKWY: 'PARKWAY', PL: 'PLACE',
        RD: 'ROAD', S: 'SOUTH', ST: 'STREET', TERR: 'TERRACE', W: 'WEST',
    }
    return value.toUpperCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
        .map((part) => aliases[part] ?? part).join(' ')
}

function normalizeId(value: string) {
    const trimmed = value.trim()
    return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, '') : ''
}

if (!(await Bun.file(inputPath).exists()) || !(await Bun.file(propertyPath).exists())) {
    throw new Error('TAD residential data or extracted Park Hill property records are missing.')
}

const addresses = await db.select().from(researchAddresses)
const addressByName = new Map(addresses.map((address) => [normalizeAddress(address.address), address]))
if (addressByName.size !== addresses.length) throw new Error('Duplicate normalized research addresses require review.')

const properties = (await Bun.file(propertyPath).text()).split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as PropertyRecord)
const propertyById = new Map<string, { addressId: string; address: string; appraisalYear: string }>()
for (const property of properties) {
    const address = addressByName.get(normalizeAddress(property.situsAddress))
    const id = normalizeId(property.propertyId)
    if (!address || !id) continue
    const existing = propertyById.get(id)
    if (existing && (existing.addressId !== address.id || existing.appraisalYear !== property.appraisalYear)) {
        throw new Error(`Parcel ${id} has conflicting property records.`)
    }
    propertyById.set(id, { addressId: address.id, address: normalizeAddress(address.address), appraisalYear: property.appraisalYear })
}

const candidates = new Map<string, Set<number>>()
const invalidAddresses = new Set<string>()
const matchedAddresses = new Set<string>()
let matchingRows = 0
const parser = createReadStream(inputPath).pipe(parse({ columns: true, delimiter: '|', bom: true }))
for await (const row of parser as AsyncIterable<ResidentialRecord>) {
    const property = propertyById.get(normalizeId(row.Account_Num))
    if (!property) continue
    matchingRows += 1
    if (normalizeAddress(row.Situs_Address) !== property.address || row.Appraisal_Year.trim() !== property.appraisalYear) {
        invalidAddresses.add(property.addressId)
        continue
    }
    matchedAddresses.add(property.addressId)
    const rawYear = row.Year_Built.trim()
    const year = Number(rawYear)
    if (!/^\d{4}$/.test(rawYear) || year < 1800 || year > Number(property.appraisalYear)) continue
    const values = candidates.get(property.addressId) ?? new Set<number>()
    values.add(year)
    candidates.set(property.addressId, values)
}

const detailCandidates = new Map<string, { years: Set<number>; improvements: Set<string>; invalid: boolean }>()
const detailAvailable = await Bun.file(detailPath).exists()
if (detailAvailable) {
    const lines = createInterface({ input: createReadStream(detailPath, { encoding: 'latin1' }), crlfDelay: Infinity })
    for await (const line of lines) {
        const property = propertyById.get(normalizeId(line.slice(0, 12)))
        if (!property || candidates.has(property.addressId) || invalidAddresses.has(property.addressId)) continue
        if (line.slice(40, 50).trim() !== 'ResMain' || line.slice(12, 16).trim() !== property.appraisalYear) continue
        const candidate = detailCandidates.get(property.addressId) ?? { years: new Set<number>(), improvements: new Set<string>(), invalid: false }
        const rawYear = line.slice(85, 89).trim()
        const year = Number(rawYear)
        const improvementId = normalizeId(line.slice(16, 28))
        if (!improvementId || !/^\d{4}$/.test(rawYear) || year < 1800 || year > Number(property.appraisalYear)) {
            candidate.invalid = true
        } else {
            candidate.years.add(year)
            candidate.improvements.add(improvementId)
        }
        detailCandidates.set(property.addressId, candidate)
    }
}

const updates: Array<{ id: string; year: number; source: string }> = []
let conflicts = 0
let protectedValues = 0
for (const address of addresses) {
    let values = candidates.get(address.id)
    let source = sourceId
    if (!values?.size) {
        const detail = detailCandidates.get(address.id)
        if (detail && (detail.invalid || detail.improvements.size !== 1 || detail.years.size !== 1)) {
            conflicts += 1
            continue
        }
        values = detail?.years
        source = detailSourceId
    }
    if (!values?.size || invalidAddresses.has(address.id)) continue
    if (values.size !== 1) {
        conflicts += 1
        continue
    }
    if (address.actualYearBuilt !== null && address.yearBuiltSourceId !== source) {
        protectedValues += 1
        continue
    }
    updates.push({ id: address.id, year: [...values][0]!, source })
}

if (apply && updates.length) {
    db.transaction((tx) => {
        tx.insert(researchSources).values({
            id: sourceId,
            sourceType: 'tad_residential_property_data',
            name: 'Tarrant Appraisal District residential property data',
            citation: `${basename(inputPath)}, Year_Built; matched by account number and situs address.`,
            externalId: basename(inputPath),
        }).onConflictDoNothing().run()
        if (updates.some((update) => update.source === detailSourceId)) {
            tx.insert(researchSources).values({
                id: detailSourceId,
                sourceType: 'tad_improvement_detail',
                name: 'Tarrant Appraisal District improvement detail',
                citation: `${basename(detailPath)}, ResMain yr_built; matched by property ID and appraisal year.`,
                externalId: basename(detailPath),
            }).onConflictDoNothing().run()
        }
        for (const update of updates) {
            tx.update(researchAddresses).set({ actualYearBuilt: update.year, yearBuiltSourceId: update.source })
                .where(eq(researchAddresses.id, update.id)).run()
        }
    })
}

console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    source: basename(inputPath),
    researchAddresses: addresses.length,
    targetParcels: propertyById.size,
    matchingRows,
    matchedAddresses: matchedAddresses.size,
    validYearUpdates: updates.length,
    residentialYearUpdates: updates.filter((update) => update.source === sourceId).length,
    improvementDetailYearUpdates: updates.filter((update) => update.source === detailSourceId).length,
    improvementDetailAvailable: detailAvailable,
    missingOrInvalidYears: [...matchedAddresses].filter((id) => !candidates.has(id)).length,
    conflictingYears: conflicts,
    mismatchedAddressOrYear: invalidAddresses.size,
    protectedExistingValues: protectedValues,
}, null, 2))