import { parse } from 'csv-parse/sync'
import { db } from '../db'
import { researchAddresses } from '../db/schema'

const inputPath = Bun.argv[2] ?? 'data-prod/research_export.csv'
const csvText = await Bun.file(inputPath).text()
const records = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
}) as Array<Record<string, string>>

const requiredColumns = [
    'household_street_address',
    'household_street_short_address',
    'resident_name_1',
    'resident_name_2',
]

function deriveShortAddress(address: string) {
    const loftonMatch = address.match(/^(\d+)\s+Lofton Terrace$/i)
    if (loftonMatch) return `LT${loftonMatch[1]}`

    const match = address.match(/^(\d+)\s+(Winton Terrace|Medford Court)\s+(East|West)$/i)
    if (!match) return null

    const [, number, street, direction] = match
    if (!number || !street || !direction) return null

    const streetCode = street.toLowerCase() === 'winton terrace' ? 'WT' : 'MC'
    const directionCode = direction.toLowerCase() === 'east' ? 'E' : 'W'
    return `${streetCode}${directionCode}${number}`
}

const firstRecord = records[0]
if (!firstRecord || requiredColumns.some((column) => !(column in firstRecord))) {
    throw new Error(`CSV must include: ${requiredColumns.join(', ')}`)
}

const seenShortAddresses = new Set<string>()
let derivedAddressCount = 0
const addresses = records.map((record, index) => {
    const address = record.household_street_address?.trim()
    const providedShortAddress = record.household_street_short_address?.trim()
    const shortAddress = providedShortAddress || (address ? deriveShortAddress(address) : null)

    if (!address || !shortAddress) {
        throw new Error(`CSV row ${index + 2} is missing an address or short address`)
    }
    if (!providedShortAddress) derivedAddressCount += 1
    if (seenShortAddresses.has(shortAddress)) {
        throw new Error(`CSV contains duplicate short address: ${shortAddress}`)
    }
    seenShortAddresses.add(shortAddress)

    return {
        id: `research_${shortAddress.toLowerCase()}`,
        address,
        shortAddress,
        importedResident1: record.resident_name_1?.trim() || null,
        importedResident2: record.resident_name_2?.trim() || null,
        importSource: inputPath,
        importedAt: new Date().toISOString(),
    }
})

db.transaction((tx) => {
    for (const address of addresses) {
        tx.insert(researchAddresses)
            .values(address)
            .onConflictDoUpdate({
                target: researchAddresses.shortAddress,
                set: {
                    address: address.address,
                    importedResident1: address.importedResident1,
                    importedResident2: address.importedResident2,
                    importSource: address.importSource,
                    importedAt: address.importedAt,
                },
            })
            .run()
    }
})

console.log(`Imported ${addresses.length} research addresses from ${inputPath}; derived ${derivedAddressCount} missing short address(es).`)
