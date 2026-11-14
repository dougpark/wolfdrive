<script setup lang="ts">
import { computed } from 'vue'
import { LockKeyhole, Play, Pause, RotateCcw, Plus, ShieldCheck } from 'lucide-vue-next'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import { usePasswordLab } from '../composables/usePasswordLab'
import { compactCount, coveragePercent, dictionaryCandidates, formatDuration } from '../services/passwordLab'

const {
    method, rateInput, rate, customPassword, error, phase, locked, cards,
    addPassword, start, togglePause, reset,
} = usePasswordLab()

const validRate = computed(() => Number.isSafeInteger(rate.value) && rate.value >= 1 && rate.value <= 1_000_000_000)
const dictionarySize = computed(() => method.value === 'exhaustive' ? 0 : dictionaryCandidates(method.value).length)
const chart = computed(() => {
    if (!validRate.value) return []
    const entries = cards.value.map(card => ({
        id: card.id,
        label: card.label,
        seconds: Number(card.model.total) / (2 * rate.value),
    }))
    const maximumLog = Math.max(1, ...entries.map(entry => Math.log10(Math.max(1, entry.seconds))))
    return entries.map(entry => ({
        ...entry,
        width: Math.max(1, Math.log10(Math.max(1, entry.seconds)) / maximumLog * 100),
    }))
})

function coverage(attempts: bigint, total: bigint) {
    const percent = coveragePercent(attempts, total)
    return attempts > 0n && percent === 0 ? '< 0.0001%' : `${percent.toFixed(4)}%`
}
</script>

<template>
    <main class="lab mx-auto min-h-screen max-w-7xl space-y-8 p-8 text-gemini-text">
        <header class="space-y-4">
            <div class="flex items-center gap-3 text-gemini-blue">
                <LockKeyhole :size="28" aria-hidden="true" />
                <span class="text-sm font-medium uppercase tracking-wide">A browser-only security demonstration</span>
            </div>
            <h1 class="text-4xl font-semibold tracking-tight">Password Guessing Lab</h1>
            <p class="max-w-3xl text-lg leading-relaxed text-gemini-subtext">
                Watch small search spaces fall quickly. Then see how length and unpredictability multiply the work.
                A predictable password can lose even when it looks complex.
            </p>
            <div class="flex gap-3 rounded-3xl border border-gemini-border bg-gemini-surface p-6">
                <ShieldCheck class="shrink-0 text-gemini-blue" :size="24" aria-hidden="true" />
                <p class="text-sm leading-relaxed">
                    <strong class="font-semibold">Use made-up passwords only.</strong>
                    Examples are visible on screen. Nothing is uploaded, saved, logged, or put in the URL.
                    Reset clears custom examples. This page does not attack accounts or files.
                </p>
            </div>
        </header>

        <section aria-labelledby="controls-heading" class="space-y-6 rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <h2 id="controls-heading" class="text-xl font-semibold tracking-tight">Set up the experiment</h2>
                <span class="rounded-full bg-gemini-surface px-4 py-2 text-sm font-medium">
                    {{ phase === 'ready' ? 'Ready' : phase === 'running' ? 'Running' : phase === 'paused' ? 'Paused' : 'Finished' }}
                </span>
            </div>
            <div class="grid gap-6 md:grid-cols-2">
                <div class="space-y-2">
                    <label for="attack-method" class="block text-sm font-medium">Guessing method</label>
                    <select id="attack-method" v-model="method" :disabled="locked"
                        class="w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none disabled:opacity-50">
                        <option value="exhaustive">Exhaustive search: fixed length, inferred alphabet</option>
                        <option value="dictionary">Small demonstration dictionary</option>
                        <option value="substitutions">Dictionary + capitalization, substitutions &amp; suffixes</option>
                    </select>
                    <p class="text-sm leading-relaxed text-gemini-subtext">
                        {{ method === 'exhaustive'
                            ? 'PINs of up to 6 digits are really searched. Larger spaces are simulated using the known target position.'
                            : `${dictionarySize} real candidates, bundled locally. No match means only that this list was exhausted.` }}
                    </p>
                </div>
                <div class="space-y-2">
                    <label for="guess-rate" class="block text-sm font-medium">Requested guesses per second, per example</label>
                    <BaseInput id="guess-rate" v-model="rateInput" type="number" min="1" max="1000000000" step="1" :disabled="locked" />
                    <div class="flex flex-wrap gap-2">
                        <BaseButton :disabled="locked" @click="rateInput = '10'">10 / second</BaseButton>
                        <BaseButton :disabled="locked" @click="rateInput = '1000'">1,000 / second</BaseButton>
                        <BaseButton :disabled="locked" @click="rateInput = '1000000'">1 million / second</BaseButton>
                        <BaseButton :disabled="locked" @click="rateInput = '1000000000'">1 billion / second</BaseButton>
                    </div>
                </div>
            </div>
            <p class="text-sm leading-relaxed text-gemini-subtext">
                Low rates illustrate a rate-limited online login; high rates illustrate hypothetical offline guessing.
                These are assumptions, not hardware benchmarks. Real searches are capped at 1,000 candidates per 50 ms tick per example
                to keep the browser responsive, and may run slower. Simulations follow the requested rate.
            </p>
            <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="addPassword">
                <div class="flex-1 space-y-2">
                    <label for="custom-password" class="block text-sm font-medium">Add a made-up example (up to 64 printable ASCII characters)</label>
                    <BaseInput id="custom-password" v-model="customPassword" placeholder="Not a password you actually use"
                        autocomplete="off" spellcheck="false" :disabled="locked" aria-describedby="custom-help" />
                    <p id="custom-help" class="text-sm text-gemini-subtext">Up to eight comparisons. Inputs are intentionally visible for your presentation.</p>
                </div>
                <BaseButton type="submit" :disabled="locked"><Plus :size="16" aria-hidden="true" /> Add example</BaseButton>
            </form>
            <p v-if="error" role="alert" class="rounded-xl border border-gemini-border bg-gemini-surface p-4 font-medium">{{ error }}</p>
            <div class="flex flex-wrap gap-3">
                <BaseButton variant="primary" :disabled="locked" @click="start"><Play :size="18" aria-hidden="true" /> Start comparison</BaseButton>
                <BaseButton :disabled="phase !== 'running' && phase !== 'paused'" @click="togglePause">
                    <Pause v-if="phase !== 'paused'" :size="18" aria-hidden="true" />
                    <Play v-else :size="18" aria-hidden="true" />
                    {{ phase === 'paused' ? 'Resume' : 'Pause' }}
                </BaseButton>
                <BaseButton @click="reset"><RotateCcw :size="18" aria-hidden="true" /> Reset &amp; clear</BaseButton>
            </div>
            <p class="sr-only" role="status">{{ phase === 'finished' ? 'All searches finished.' : phase === 'paused' ? 'Comparison paused.' : phase === 'running' ? 'Comparison running.' : 'Ready to start.' }}</p>
        </section>

        <section aria-labelledby="comparison-heading" class="space-y-4">
            <h2 id="comparison-heading" class="text-2xl font-semibold tracking-tight">Side-by-side search progress</h2>
            <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <article v-for="card in cards" :key="card.id" class="space-y-4 rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 class="font-semibold tracking-tight">{{ card.label }}</h3>
                        <span class="rounded-full bg-gemini-surface px-3 py-1 text-xs font-medium text-gemini-blue">
                            {{ card.mode === 'live' ? 'Live search' : 'Simulated' }}
                        </span>
                    </div>
                    <p class="break-all rounded-xl bg-gemini-surface p-4 font-mono text-lg whitespace-pre-wrap">{{ card.password }}</p>
                    <p class="text-sm text-gemini-subtext">{{ card.password.length }} characters · {{ card.model.alphabet.length }}-character inferred alphabet</p>
                    <ul v-if="card.patterns.length" class="space-y-1 text-sm text-gemini-purple">
                        <li v-for="pattern in card.patterns" :key="pattern">{{ pattern }}</li>
                    </ul>
                    <p v-else class="text-sm text-gemini-subtext">No pattern detected by our small heuristic list. This is not a strength guarantee.</p>
                    <dl class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt class="text-gemini-subtext">Elapsed {{ card.mode === 'simulated' ? '(modeled)' : '(active)' }}</dt>
                            <dd class="mt-1 font-medium tabular-nums">{{ ((card.result?.elapsedMs ?? 0) / 1000).toFixed(2) }} s</dd>
                        </div>
                        <div>
                            <dt class="text-gemini-subtext">Attempts {{ card.mode === 'simulated' ? '(modeled)' : '(actual)' }}</dt>
                            <dd class="mt-1 break-all font-medium tabular-nums">{{ compactCount(card.result?.attempts ?? 0n) }}</dd>
                        </div>
                        <div class="col-span-2">
                            <dt class="text-gemini-subtext">{{ method === 'exhaustive' ? 'Character-space combinations' : 'Dictionary candidates' }}</dt>
                            <dd class="mt-1 font-medium">{{ compactCount(card.result?.total ?? (method === 'exhaustive' ? card.model.total : BigInt(dictionarySize))) }}</dd>
                        </div>
                    </dl>
                    <div class="space-y-2">
                        <div class="flex justify-between gap-2 text-xs text-gemini-subtext">
                            <span>{{ method === 'exhaustive' ? 'Search space covered' : 'Dictionary covered' }}</span>
                            <span>{{ coverage(card.result?.attempts ?? 0n, card.result?.total ?? (method === 'exhaustive' ? card.model.total : BigInt(dictionarySize))) }}</span>
                        </div>
                        <progress class="h-2 w-full accent-gemini-blue" max="100"
                            :value="coveragePercent(card.result?.attempts ?? 0n, card.result?.total ?? (method === 'exhaustive' ? card.model.total : BigInt(dictionarySize)))"
                            :aria-label="`${card.label}: candidates covered`" />
                    </div>
                    <p class="text-sm font-medium" :class="card.result?.status === 'matched' ? 'text-gemini-blue' : 'text-gemini-subtext'">
                        {{ !card.result ? 'Waiting to start'
                            : card.result.status === 'matched' ? (card.result.mode === 'simulated' ? 'Modeled target reached — not actually cracked' : 'Matched by real comparison')
                            : card.result.status === 'exhausted' ? 'Not found in this dictionary — not proof of safety'
                            : phase === 'paused' ? 'Paused' : 'Searching…' }}
                    </p>
                    <p v-if="card.result?.mode === 'live'" class="break-all text-xs leading-relaxed text-gemini-subtext">
                        Last candidate: <span class="font-mono">{{ card.result.candidate || '—' }}</span><br />
                        Observed: {{ card.result.elapsedMs > 0 ? Math.round(Number(card.result.attempts) / (card.result.elapsedMs / 1000)).toLocaleString('en-US') : 0 }} guesses / second
                    </p>
                    <p v-else-if="card.result" class="text-xs leading-relaxed text-gemini-subtext">
                        Target position: {{ compactCount(card.model.targetAttempt) }}.
                        We know this position because you supplied the example; an attacker would not.
                    </p>
                </article>
            </div>
            <p class="text-sm leading-relaxed text-gemini-subtext">
                Coverage is not "percent cracked." With a uniformly random target and distinct exhaustive guesses,
                this percentage is also the chance of success so far. Human-chosen passwords do not follow that model.
                A match can occur long before the bar is full.
            </p>
        </section>

        <section aria-labelledby="chart-heading" class="space-y-6 rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm">
            <div class="space-y-2">
                <h2 id="chart-heading" class="text-2xl font-semibold tracking-tight">What length buys you</h2>
                <p class="text-sm leading-relaxed text-gemini-subtext">
                    Hypothetical average exhaustive-search time at your requested rate, assuming each example were selected
                    uniformly at random from its inferred alphabet. This chart does not estimate dictionary resistance.
                    In particular, the tall bar for Password123! does not make it strong.
                </p>
            </div>
            <p v-if="!validRate" role="status">Enter a valid guessing rate to see the time comparison.</p>
            <div v-for="entry in chart" :key="entry.id" class="space-y-2">
                <div class="flex flex-wrap justify-between gap-2 text-sm">
                    <span class="font-medium">{{ entry.label }}</span>
                    <span class="text-gemini-subtext">{{ formatDuration(entry.seconds) }}</span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-gemini-surface" aria-hidden="true">
                    <div class="h-full rounded-full bg-gemini-blue" :style="{ width: `${entry.width}%` }" />
                </div>
            </div>
            <p class="text-xs leading-relaxed text-gemini-subtext">
                Logarithmic scale: each equal increase represents a multiplication in time, not a fixed number of seconds.
                Times below one second use the minimum visible bar.
            </p>
        </section>

        <footer class="grid gap-6 border-t border-gemini-border pt-8 text-sm leading-relaxed text-gemini-subtext md:grid-cols-3">
            <div>
                <h2 class="mb-2 font-semibold text-gemini-text">The mathematics</h2>
                <p>Combinations = alphabet size raised to password length. Expected guesses for a uniformly random target = (combinations + 1) / 2; the chart uses the close approximation combinations / 2.</p>
            </div>
            <div>
                <h2 class="mb-2 font-semibold text-gemini-text">The limits</h2>
                <p>We assume the attacker knows the length and character classes. Ordering is fixed: digits, lowercase, uppercase, symbols. The dictionary is deliberately tiny; real guessing tools use much richer patterns. Length alone does not prove randomness.</p>
            </div>
            <div>
                <h2 class="mb-2 font-semibold text-gemini-text">The real-world lesson</h2>
                <p>Use unique, randomly generated passwords or randomly selected word passphrases, a password manager, and MFA or passkeys. Real services should store salted, slow password hashes, not plaintext or reversible encryption. Hash settings and login defenses change guessing speed.</p>
            </div>
        </footer>
    </main>
</template>

<style scoped>
.lab {
    font-family: Inter, Roboto, sans-serif;
}
</style>
