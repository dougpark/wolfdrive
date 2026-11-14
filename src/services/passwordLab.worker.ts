import {
    dictionaryCandidates, exhaustiveModel, minBigInt, searchModeFor, simulatedAttempts, validatePassword,
} from './passwordLab'
import type { DemoPassword, SearchResult, WorkerCommand, WorkerResponse } from './passwordLab'

interface Search {
    password: string
    targetAttempt: bigint
    result: SearchResult
}

let searches: Search[] = []
let dictionary: string[] | null = null
let rate = 1000
let elapsedMs = 0
let startedAt = 0
let timer: ReturnType<typeof setInterval> | undefined

function send(message: WorkerResponse) {
    postMessage(message)
}

function stopTimer() {
    clearInterval(timer)
    timer = undefined
}

function tick() {
    const nowElapsed = elapsedMs + performance.now() - startedAt
    for (const search of searches) {
        const result = search.result
        if (result.status !== 'searching') continue
        result.elapsedMs = nowElapsed
        if (result.mode === 'simulated') {
            result.attempts = simulatedAttempts(nowElapsed, rate, search.targetAttempt)
            if (result.attempts === search.targetAttempt) {
                result.status = 'matched'
                result.elapsedMs = Number(search.targetAttempt) / rate * 1000
            }
            continue
        }

        // Bound real work per tick; the requested rate is a ceiling, not a hardware benchmark.
        const due = minBigInt(BigInt(Math.floor(nowElapsed * rate / 1000)), result.total)
        const end = minBigInt(result.attempts + 1000n, due)
        while (result.attempts < end) {
            result.candidate = dictionary
                ? dictionary[Number(result.attempts)]!
                : result.attempts.toString().padStart(search.password.length, '0')
            result.attempts++
            if (result.candidate === search.password) {
                result.status = 'matched'
                break
            }
        }
        if (result.status === 'searching' && result.attempts === result.total) result.status = 'exhausted'
    }
    const finished = searches.every(search => search.result.status !== 'searching')
    send({ type: 'progress', results: searches.map(search => search.result), finished })
    if (finished) stopTimer()
}

function makeSearch(password: DemoPassword): Search {
    const error = validatePassword(password.password)
    if (error) throw new Error(error)
    const model = exhaustiveModel(password.password)
    return {
        password: password.password,
        targetAttempt: model.targetAttempt,
        result: {
            id: password.id,
            mode: searchModeFor(password.password, dictionary ? 'dictionary' : 'exhaustive'),
            status: 'searching',
            attempts: 0n,
            total: dictionary ? BigInt(dictionary.length) : model.total,
            elapsedMs: 0,
            candidate: '',
        },
    }
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
    try {
        const command = event.data
        if (command.type === 'start') {
            stopTimer()
            if (!Number.isSafeInteger(command.rate) || command.rate < 1 || command.rate > 1_000_000_000) {
                throw new Error('Choose a whole-number rate from 1 to 1,000,000,000 guesses per second.')
            }
            rate = command.rate
            dictionary = command.method === 'exhaustive' ? null : dictionaryCandidates(command.method)
            searches = command.passwords.map(makeSearch)
            elapsedMs = 0
            startedAt = performance.now()
            timer = setInterval(tick, 50)
            tick()
        } else if (command.type === 'pause' && timer !== undefined) {
            tick()
            elapsedMs += performance.now() - startedAt
            stopTimer()
        } else if (command.type === 'resume' && timer === undefined && searches.some(search => search.result.status === 'searching')) {
            startedAt = performance.now()
            timer = setInterval(tick, 50)
        }
    } catch (error) {
        stopTimer()
        send({ type: 'error', message: error instanceof Error ? error.message : 'The demonstration could not run.' })
    }
}
