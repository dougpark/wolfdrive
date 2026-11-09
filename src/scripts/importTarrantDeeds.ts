import { db } from '../db'
import { researchAddresses, researchDeedLookups, researchDeeds, researchSources } from '../db/schema'
import { cleanPortalReference, normalizeResearchAddress, normalizedParcelId, parsePortalDeedDate, parsePortalDeedResponse } from '../services/tarrantDeeds'

type PropertyRecord = { propertyId: string; situsAddress: string; appraisalYear: string }
type Target = { addressId: string; address: string; parcelId: string; appraisalYear: string }

const apiBase = 'https://prod-container.trueprodigyapi.com'
const propertyPath = 'data-research/tarrant_county/parkhill_property_records.jsonl'
const args = Bun.argv.slice(2)
const apply = args.includes('--apply')
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length)
const propertyArg = args.find((arg) => arg.startsWith('--property='))?.slice('--property='.length)
const limit = limitArg === undefined ? 140 : Number(limitArg)
const propertyId = propertyArg === undefined ? null : normalizedParcelId(propertyArg)

if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--limit=') && !arg.startsWith('--property='))) {
    throw new Error('Usage: bun run research:import-tad-deeds [--apply] [--limit=1..140] [--property=PARCEL_ID]')
}
if (!Number.isInteger(limit) || limit < 1 || limit > 140 || (propertyArg !== undefined && !propertyId)) {
    throw new Error('Limit must be 1-140 and property must be a numeric parcel ID.')
}
if (!(await Bun.file(propertyPath).exists())) throw new Error(`Missing property extract: ${propertyPath}`)

const addresses = await db.select().from(researchAddresses)
const addressByName = new Map(addresses.map((address) => [normalizeResearchAddress(address.address), address]))
if (addressByName.size !== addresses.length) throw new Error('Duplicate normalized research addresses require review.')
const properties = (await Bun.file(propertyPath).text()).split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as PropertyRecord)
const targetsByAddress = new Map<string, Target>()
const addressesByParcel = new Map<string, string>()
for (const property of properties) {
    const address = addressByName.get(normalizeResearchAddress(property.situsAddress))
    const parcelId = normalizedParcelId(property.propertyId)
    if (!address || !parcelId || !/^\d{4}$/.test(property.appraisalYear)) continue
    const existing = targetsByAddress.get(address.id)
    if (existing && (existing.parcelId !== parcelId || existing.appraisalYear !== property.appraisalYear)) {
        throw new Error(`Conflicting parcel records for ${address.address}.`)
    }
    const existingAddressId = addressesByParcel.get(parcelId)
    if (existingAddressId && existingAddressId !== address.id) throw new Error(`Parcel ${parcelId} matches multiple addresses.`)
    addressesByParcel.set(parcelId, address.id)
    targetsByAddress.set(address.id, { addressId: address.id, address: address.address, parcelId, appraisalYear: property.appraisalYear })
}

const completed = new Map((await db.select().from(researchDeedLookups)).map((lookup) => [lookup.addressId, lookup.parcelId]))
const targets = [...targetsByAddress.values()].sort((first, second) => first.address.localeCompare(second.address))
    .filter((target) => !propertyId || target.parcelId === propertyId)
if (propertyId && targets.length === 0) throw new Error(`Parcel ${propertyId} does not match a research address.`)
for (const target of targets) {
    const completedParcel = completed.get(target.addressId)
    if (completedParcel && completedParcel !== target.parcelId) throw new Error(`Parcel changed for ${target.address}; review its existing deed lookup.`)
}
const pending = targets.filter((target) => !completed.has(target.addressId))
const selected = pending.slice(0, limit)
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', matchingResearchProperties: targets.length, previouslyCompleted: targets.length - pending.length, pending: pending.length, selected: selected.length, perRequestDelaySeconds: 5 }, null, 2))
if (!apply || selected.length === 0) process.exit(0)

let token = ''
let tokenAcquiredAt = 0
async function publicToken() {
    if (token && Date.now() - tokenAcquiredAt < 240_000) return token
    const response = await fetch(`${apiBase}/trueprodigy/cadpublic/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ office: 'Tarrant' }),
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`TAD public session failed (HTTP ${response.status}); import stopped.`)
    const body = await response.json() as { user?: { token?: unknown } }
    if (typeof body.user?.token !== 'string' || !body.user.token) throw new Error('Unexpected public-session response; import stopped.')
    token = body.user.token
    tokenAcquiredAt = Date.now()
    return token
}

let totalDeeds = 0
for (const [index, target] of selected.entries()) {
    if (index > 0) await Bun.sleep(5_000)
    const authorization = await publicToken()
    const response = await fetch(`${apiBase}/public/property/${encodeURIComponent(target.parcelId)}/deeds`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`Deed lookup for parcel ${target.parcelId} failed (HTTP ${response.status}); import stopped. Previously completed properties are saved.`)
    const deeds = parsePortalDeedResponse(response.status, response.status === 204 ? null : await response.json())
    const sourceId = `tad_portal_${target.parcelId}_${target.appraisalYear}`
    const retrievedAt = new Date().toISOString()
    const url = `https://tarrant.prodigycad.com/property-detail/${target.parcelId}/${target.appraisalYear}`

    db.transaction((tx) => {
        tx.insert(researchSources).values({
            id: sourceId,
            sourceType: 'tad_portal_deed_history',
            name: 'Tarrant Appraisal District deed history',
            url,
            citation: `TAD property ${target.parcelId}, deed history, retrieved ${retrievedAt}.`,
            externalId: target.parcelId,
            retrievedAt,
        }).onConflictDoNothing().run()
        for (const deed of deeds) {
            tx.insert(researchDeeds).values({
                id: `tad_deed_${target.parcelId}_${deed.deedID}`,
                addressId: target.addressId,
                sourceId,
                sourceDeedId: String(deed.deedID),
                parcelId: target.parcelId,
                deedDate: parsePortalDeedDate(deed.deedDt),
                rawDeedDate: deed.deedDt,
                deedType: deed.deedType,
                description: deed.deedDescription,
                grantor: deed.seller,
                grantee: deed.buyer,
                book: cleanPortalReference(deed.book),
                volume: cleanPortalReference(deed.volume),
                page: cleanPortalReference(deed.page),
                instrumentNumber: cleanPortalReference(deed.instrumentNum),
            }).onConflictDoNothing().run()
        }
        tx.insert(researchDeedLookups).values({
            addressId: target.addressId,
            parcelId: target.parcelId,
            sourceId,
            retrievedAt,
            deedCount: deeds.length,
        }).onConflictDoNothing().run()
    })
    totalDeeds += deeds.length
    console.log(`[${index + 1}/${selected.length}] ${target.address}: ${deeds.length} deed records`)
}
console.log(`Completed ${selected.length} properties and saved ${totalDeeds} returned deed records.`)