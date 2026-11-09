import { createReadStream, createWriteStream } from 'node:fs'
import { basename, resolve } from 'node:path'
import { once } from 'node:events'
import { createInterface } from 'node:readline'

const inputPath = Bun.argv[2] ?? 'data-research/tarrant_county/000_Tarrant_All_Taxing_Units/2026-11-06_2026_APPRAISAL_INFO.TXT'
const outputPath = Bun.argv[3] ?? 'data-research/tarrant_county/parkhill_property_records.jsonl'
const subdivisionCode = Bun.argv[4] ?? '31620'
const minimumRecordLength = 4474
const legacyDecoder = new TextDecoder('windows-1252')

if (!(await Bun.file(inputPath).exists())) {
    throw new Error(`TAD property export not found: ${inputPath}`)
}
if (!/^\d{1,10}$/.test(subdivisionCode)) {
    throw new Error(`Invalid subdivision code: ${subdivisionCode}`)
}
if (resolve(inputPath) === resolve(outputPath)) {
    throw new Error('Input and output paths must be different')
}

function field(record: string, start: number, end: number) {
    const bytes = Uint8Array.from(record.slice(start - 1, end), (character) => character.charCodeAt(0))
    return legacyDecoder.decode(bytes).trim()
}

const lines = createInterface({ input: createReadStream(inputPath, { encoding: 'latin1' }), crlfDelay: Infinity })
const output = createWriteStream(outputPath, { encoding: 'utf8' })
let scanned = 0
let matched = 0

try {
    for await (const line of lines) {
        if (!line) continue
        scanned += 1

        if (line.length < minimumRecordLength) {
            throw new Error(`Record ${scanned} is only ${line.length} characters; expected at least ${minimumRecordLength}. Check the export layout version.`)
        }

        if (line.slice(1675, 1685).trim() !== subdivisionCode) continue

        const streetPrefix = field(line, 1040, 1049)
        const street = field(line, 1050, 1099)
        const streetSuffix = field(line, 1100, 1109)
        const streetNumber = field(line, 4460, 4474)
        const record = {
            sourceFile: basename(inputPath),
            subdivisionCode,
            propertyId: field(line, 1, 12),
            propertyType: field(line, 13, 17),
            appraisalYear: String(Number(field(line, 18, 22))),
            supplementNumber: String(Number(field(line, 23, 34))),
            supplementAction: field(line, 35, 36),
            ownerId: field(line, 597, 608),
            ownerName: field(line, 609, 678),
            partialOwner: field(line, 679, 679) === 'T',
            udiGroup: field(line, 680, 691),
            situsAddress: [streetNumber, streetPrefix, street, streetSuffix].filter(Boolean).join(' '),
            situsCity: field(line, 1110, 1139),
            situsZip: field(line, 1140, 1149),
            legalDescription: field(line, 1150, 1404),
            additionalLegalDescription: field(line, 1405, 1659),
            block: field(line, 1696, 1745),
            tractOrLot: field(line, 1746, 1795),
            deedBook: field(line, 1994, 2013),
            deedPage: field(line, 2014, 2033),
            deedDate: field(line, 2034, 2058),
            january1OwnerId: field(line, 2191, 2202),
            january1OwnerName: field(line, 2203, 2272),
        }

        if (!output.write(`${JSON.stringify(record)}\n`)) {
            await once(output, 'drain')
        }
        matched += 1

        if (scanned % 500_000 === 0) {
            console.error(`Scanned ${scanned.toLocaleString()} records; matched ${matched.toLocaleString()}.`)
        }
    }

    output.end()
    await once(output, 'finish')
} catch (error) {
    lines.close()
    output.destroy()
    throw error
}

console.log(`Scanned ${scanned.toLocaleString()} records; wrote ${matched.toLocaleString()} records for subdivision ${subdivisionCode} to ${outputPath}.`)
