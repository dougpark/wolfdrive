import { computed, onUnmounted, ref } from 'vue'
import {
    exhaustiveModel, patternsFor, searchModeFor, validatePassword,
} from '../services/passwordLab'
import type { AttackMethod, DemoPassword, SearchResult, WorkerCommand, WorkerResponse } from '../services/passwordLab'

const EXAMPLES: DemoPassword[] = [
    { id: 1, label: '4-digit PIN', password: '0427' },
    { id: 2, label: '6-digit PIN', password: '739182' },
    { id: 3, label: '6-character alphanumeric', password: 'a7B2q9' },
    { id: 4, label: '8-character alphanumeric', password: 'Z8m4Q2r7' },
    { id: 5, label: 'Looks complex, but predictable', password: 'Password123!' },
    { id: 6, label: '12-character mixed example', password: 'y$R9!kV2@wL6' },
]

export function usePasswordLab() {
    const passwords = ref(EXAMPLES.map(example => ({ ...example })))
    const method = ref<AttackMethod>('exhaustive')
    const rateInput = ref('1000')
    const customPassword = ref('')
    const error = ref('')
    const phase = ref<'ready' | 'running' | 'paused' | 'finished'>('ready')
    const results = ref<SearchResult[]>([])
    let worker: Worker | undefined
    let nextId = 7

    const rate = computed(() => Number(rateInput.value))
    const locked = computed(() => phase.value !== 'ready')
    const cards = computed(() => passwords.value.map(password => ({
        ...password,
        model: exhaustiveModel(password.password),
        mode: searchModeFor(password.password, method.value),
        patterns: patternsFor(password.password),
        result: results.value.find(result => result.id === password.id),
    })))

    function dispose() {
        worker?.terminate()
        worker = undefined
    }

    function fail(message: string) {
        error.value = message
        phase.value = 'ready'
        dispose()
    }

    function send(command: WorkerCommand) {
        worker?.postMessage(command)
    }

    function addPassword() {
        if (locked.value) return
        error.value = validatePassword(customPassword.value) ?? ''
        if (passwords.value.length >= 8) error.value = 'Compare at most eight examples. Reset to clear custom examples.'
        if (error.value) return
        passwords.value.push({ id: nextId++, label: 'Your made-up example', password: customPassword.value })
        customPassword.value = ''
    }

    function start() {
        if (locked.value) return
        error.value = ''
        if (!Number.isSafeInteger(rate.value) || rate.value < 1 || rate.value > 1_000_000_000) {
            error.value = 'Choose a whole-number rate from 1 to 1,000,000,000 guesses per second.'
            return
        }
        dispose()
        results.value = []
        try {
            worker = new Worker(new URL('../services/passwordLab.worker.ts', import.meta.url), { type: 'module' })
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                if (event.data.type === 'error') {
                    fail(event.data.message)
                    return
                }
                results.value = event.data.results
                if (event.data.finished) {
                    phase.value = 'finished'
                    dispose()
                }
            }
            worker.onerror = () => fail('The browser could not run the search worker. Reset and try again in a browser that supports Web Workers.')
            worker.onmessageerror = () => fail('The browser could not read search progress. Reset and try again.')
            phase.value = 'running'
            send({ type: 'start', passwords: passwords.value.map(password => ({ ...password })), method: method.value, rate: rate.value })
        } catch (cause) {
            fail(cause instanceof Error ? cause.message : 'The browser could not start the demonstration.')
        }
    }

    function togglePause() {
        if (phase.value === 'running') {
            phase.value = 'paused'
            send({ type: 'pause' })
        } else if (phase.value === 'paused') {
            phase.value = 'running'
            send({ type: 'resume' })
        }
    }

    function reset() {
        dispose()
        results.value = []
        passwords.value = EXAMPLES.map(example => ({ ...example }))
        customPassword.value = ''
        error.value = ''
        phase.value = 'ready'
        nextId = 7
    }

    onUnmounted(dispose)
    return { passwords, method, rateInput, rate, customPassword, error, phase, locked, cards, addPassword, start, togglePause, reset }
}
