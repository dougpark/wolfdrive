<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ArrowUpRight,
    Building2,
    Clock3,
    Landmark,
    Newspaper,
    Search,
    Users,
    X,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

interface ResearchAddress {
    id: string
    address: string
    shortAddress: string
    importedResident1: string | null
    importedResident2: string | null
    actualYearBuilt: number | null
    yearBuiltSourceId: string | null
    ownerCount: number
    eventCount: number
}

interface ResearchSource {
    id: string | null
    name: string | null
    sourceType: string | null
    url: string | null
    citation: string | null
}

interface PropertyOwner {
    id: string
    ownerName: string
    startDate: string | null
    endDate: string | null
    recordedDeedDate: string | null
    parcelId: string | null
    deedReference: string | null
    appraisalYear: number | null
    supplementNumber: number | null
    supplementAction: string | null
    legalDescription: string | null
    verificationStatus: string
    notes: string | null
    source: ResearchSource
}

interface ResearchEvent {
    id: string
    eventDate: string | null
    eventType: string
    title: string | null
    summary: string | null
    excerpt: string | null
    verificationStatus: string
    source: ResearchSource
}

interface ResearchDeed {
    id: string
    deedDate: string | null
    deedType: string | null
    description: string | null
    grantor: string | null
    grantee: string | null
    book: string | null
    volume: string | null
    page: string | null
    instrumentNumber: string | null
    verificationStatus: string
    source: { name: string | null; url: string | null; citation: string | null } | null
}

interface AddressDetail {
    address: ResearchAddress
    owners: PropertyOwner[]
    events: ResearchEvent[]
    deeds: ResearchDeed[]
    deedLookup: { retrievedAt: string } | null
}

const router = useRouter()
const route = useRoute()
const addresses = ref<ResearchAddress[]>([])
const detail = ref<AddressDetail | null>(null)
const search = ref('')
const eventType = ref('')
const isLoading = ref(true)
const isDetailLoading = ref(false)
const error = ref('')
const detailError = ref('')
const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
let searchTimeout: ReturnType<typeof setTimeout> | undefined

const selectedAddress = computed(() =>
    addresses.value.find((address) => address.id === selectedId.value) ?? detail.value?.address ?? null,
)

async function fetchAddresses() {
    isLoading.value = true
    error.value = ''
    const params = new URLSearchParams()
    if (search.value.trim()) params.set('search', search.value.trim())
    if (eventType.value) params.set('eventType', eventType.value)

    try {
        const response = await fetch(`/api/research/addresses?${params}`)
        if (!response.ok) throw new Error('Unable to load research addresses')
        addresses.value = await response.json() as ResearchAddress[]
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'Unable to load research addresses'
    } finally {
        isLoading.value = false
    }
}

async function fetchDetail(id: string) {
    if (!id) {
        detail.value = null
        detailError.value = ''
        return
    }

    isDetailLoading.value = true
    detailError.value = ''
    try {
        const response = await fetch(`/api/research/addresses/${encodeURIComponent(id)}`)
        if (!response.ok) throw new Error(response.status === 404 ? 'Research address not found' : 'Unable to load address research')
        detail.value = await response.json() as AddressDetail
    } catch (cause) {
        detail.value = null
        detailError.value = cause instanceof Error ? cause.message : 'Unable to load address research'
    } finally {
        isDetailLoading.value = false
    }
}

function openAddress(id: string) {
    router.push(`/research/${encodeURIComponent(id)}`)
}

function formatDate(date: string | null) {
    if (!date) return 'Date unknown'
    const parsedDate = new Date(`${date.slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(parsedDate.getTime())
        ? date
        : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsedDate)
}

function formatEventType(value: string) {
    return value.replaceAll('_', ' ')
}

watch([search, eventType], () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(fetchAddresses, 250)
})

watch(selectedId, (id) => fetchDetail(id), { immediate: true })

onMounted(fetchAddresses)
onBeforeUnmount(() => clearTimeout(searchTimeout))
</script>

<template>
    <main class="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header class="mb-6 flex items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                <Landmark class="h-5 w-5 text-gemini-blue" />
            </span>
            <div class="min-w-0">
                <h1 class="text-xl font-semibold tracking-tight text-gemini-text">Park Hill Research</h1>
                <p class="text-sm text-gemini-subtext">Property records, residents, and historical mentions</p>
            </div>
        </header>

        <section class="mb-4 flex flex-col gap-3 sm:flex-row">
            <label class="relative min-w-0 flex-1">
                <Search
                    class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gemini-subtext" />
                <BaseInput v-model="search" type="search" placeholder="Search address, resident, or event"
                    aria-label="Search research addresses, residents, or events" class="pl-10 pr-10" />
                <BaseButton v-if="search" type="button" aria-label="Clear search" title="Clear search"
                    class="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 border-0 p-0! text-gemini-subtext"
                    @click="search = ''">
                    <X class="h-4 w-4" />
                </BaseButton>
            </label>
            <label class="sr-only" for="research-event-type">Filter by event type</label>
            <select id="research-event-type" v-model="eventType"
                class="rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm text-gemini-text focus:border-gemini-blue focus:outline-none">
                <option value="">All event types</option>
                <option value="social">Social</option>
                <option value="real_estate">Real estate</option>
                <option value="obituary">Obituary</option>
                <option value="general">General</option>
            </select>
        </section>

        <div class="grid min-h-[65vh] gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
            <section class="min-w-0 overflow-hidden rounded-2xl border border-gemini-border bg-gemini-card">
                <div class="flex items-center justify-between border-b border-gemini-border px-4 py-3">
                    <h2 class="text-sm font-semibold text-gemini-text">Properties</h2>
                    <span class="text-xs text-gemini-subtext">{{ addresses.length }}</span>
                </div>
                <div v-if="isLoading && !addresses.length" class="space-y-2 p-3">
                    <div v-for="n in 6" :key="n" class="h-16 animate-pulse rounded-xl bg-gemini-surface" />
                </div>
                <div v-else-if="error" class="p-5 text-sm text-gemini-subtext">{{ error }}</div>
                <div v-else-if="!addresses.length" class="p-8 text-center">
                    <Search class="mx-auto mb-2 h-6 w-6 text-gemini-subtext" />
                    <p class="text-sm font-medium text-gemini-text">No matching properties</p>
                    <p class="mt-1 text-xs text-gemini-subtext">Try another address or resident name.</p>
                </div>
                <nav v-else class="max-h-[calc(65vh-49px)] overflow-y-auto" aria-label="Research properties">
                    <RouterLink v-for="address in addresses" :key="address.id"
                        :to="`/research/${encodeURIComponent(address.id)}`"
                        class="block border-b border-gemini-border px-4 py-3 last:border-0 hover:bg-gemini-surface"
                        :class="selectedId === address.id ? 'bg-gemini-surface' : ''">
                        <span class="flex min-w-0 items-center justify-between gap-3">
                            <span class="truncate text-sm font-medium text-gemini-text">{{ address.address }}</span>
                            <span class="shrink-0 font-mono text-[11px] text-gemini-subtext">{{ address.shortAddress
                                }}</span>
                        </span>
                        <span class="mt-1 block truncate text-xs text-gemini-subtext">
                            {{ [address.importedResident1, address.importedResident2].filter(Boolean).join(' · ') || 'No
                            imported names' }}
                        </span>
                        <span class="mt-2 flex gap-3 text-[11px] text-gemini-subtext">
                            <span>{{ address.ownerCount }} ownership records</span>
                            <span>{{ address.eventCount }} mentions</span>
                        </span>
                    </RouterLink>
                </nav>
            </section>

            <section class="min-w-0 rounded-2xl border border-gemini-border bg-gemini-card">
                <div v-if="isDetailLoading" class="space-y-4 p-6">
                    <div class="h-6 w-2/3 animate-pulse rounded bg-gemini-surface" />
                    <div class="h-24 animate-pulse rounded-xl bg-gemini-surface" />
                    <div class="h-32 animate-pulse rounded-xl bg-gemini-surface" />
                </div>
                <div v-else-if="detailError" class="p-8 text-sm text-gemini-subtext">{{ detailError }}</div>
                <div v-else-if="!detail || !selectedAddress"
                    class="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                    <Building2 class="mb-3 h-8 w-8 text-gemini-subtext" />
                    <h2 class="text-base font-semibold text-gemini-text">Select a property</h2>
                    <p class="mt-1 max-w-sm text-sm text-gemini-subtext">Address research and cited records will appear
                        here.</p>
                </div>
                <template v-else>
                    <header class="border-b border-gemini-border px-5 py-5 sm:px-6">
                        <p class="font-mono text-xs text-gemini-subtext">{{ detail.address.shortAddress }}</p>
                        <h2 class="mt-1 text-lg font-semibold tracking-tight text-gemini-text">{{ detail.address.address
                            }}</h2>
                        <p class="mt-1 text-sm text-gemini-subtext">
                            Year built: {{ detail.address.actualYearBuilt ?? 'Unknown' }}<template
                                v-if="detail.address.actualYearBuilt && detail.address.yearBuiltSourceId?.startsWith('tad_')">
                                (TAD)</template>
                        </p>
                    </header>

                    <div class="grid gap-6 p-5 sm:p-6">
                        <section aria-labelledby="imported-names-heading">
                            <div class="mb-3 flex items-center gap-2">
                                <Users class="h-4 w-4 text-gemini-blue" />
                                <h3 id="imported-names-heading" class="text-sm font-semibold text-gemini-text">Names
                                    from address export
                                </h3>
                                <span class="text-xs text-gemini-subtext">Unverified</span>
                            </div>
                            <p v-if="!detail.address.importedResident1 && !detail.address.importedResident2"
                                class="text-sm text-gemini-subtext">No names were included in the CSV.</p>
                            <div v-else class="flex flex-wrap gap-2">
                                <span
                                    v-for="name in [detail.address.importedResident1, detail.address.importedResident2].filter((value): value is string => Boolean(value))"
                                    :key="name"
                                    class="rounded-lg bg-gemini-surface px-3 py-1.5 text-sm text-gemini-text">{{ name
                                    }}</span>
                            </div>
                        </section>

                        <section aria-labelledby="ownership-heading">
                            <div class="mb-3 flex items-center gap-2">
                                <Landmark class="h-4 w-4 text-gemini-blue" />
                                <h3 id="ownership-heading" class="text-sm font-semibold text-gemini-text">Tarrant County
                                    ownership</h3>
                                <span class="text-xs text-gemini-subtext">{{ detail.owners.length }}</span>
                            </div>
                            <div v-if="!detail.owners.length"
                                class="rounded-xl border border-dashed border-gemini-border p-4 text-sm text-gemini-subtext">
                                No sourced ownership records have been imported for this property.
                            </div>
                            <div v-else class="divide-y divide-gemini-border rounded-xl border border-gemini-border">
                                <article v-for="owner in detail.owners" :key="owner.id" class="px-4 py-3">
                                    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                        <h4 class="text-sm font-medium text-gemini-text">{{ owner.ownerName }}</h4>
                                        <span class="text-xs capitalize text-gemini-subtext">{{ owner.verificationStatus
                                            }}</span>
                                    </div>
                                    <p v-if="owner.startDate || owner.endDate" class="mt-1 text-xs text-gemini-subtext">
                                        {{ owner.startDate ? formatDate(owner.startDate) : 'Start date unknown' }} – {{
                                            owner.endDate ?
                                        formatDate(owner.endDate) : 'End date unknown' }}
                                    </p>
                                    <p v-else class="mt-1 text-xs text-gemini-subtext">Ownership period not established
                                        by this source.</p>
                                    <p v-if="owner.recordedDeedDate" class="mt-1 text-xs text-gemini-subtext">TAD deed
                                        date: {{
                                        formatDate(owner.recordedDeedDate) }}</p>
                                    <p v-if="owner.appraisalYear" class="mt-1 text-xs text-gemini-subtext">
                                        {{ owner.supplementNumber ? `Supplement ${owner.supplementNumber}` : 'Certified
                                        appraisal roll' }} ·
                                        {{ owner.appraisalYear }}
                                    </p>
                                    <p v-if="owner.parcelId || owner.deedReference"
                                        class="mt-1 text-xs text-gemini-subtext">
                                        {{ [owner.parcelId && `Parcel ${owner.parcelId}`, owner.deedReference && `Deed
                                        ${owner.deedReference}`].filter(Boolean).join(' · ') }}
                                    </p>
                                    <p v-if="owner.legalDescription" class="mt-2 text-sm text-gemini-subtext">{{
                                        owner.legalDescription }}
                                    </p>
                                    <a v-if="owner.source?.url" :href="owner.source.url" target="_blank"
                                        rel="noopener noreferrer"
                                        class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gemini-blue hover:underline">
                                        {{ owner.source.name || owner.source.citation || 'View source' }}
                                        <ArrowUpRight class="h-3 w-3" />
                                    </a>
                                    <p v-else-if="owner.source?.citation || owner.source?.name"
                                        class="mt-2 text-xs text-gemini-subtext">{{
                                            owner.source.citation || owner.source.name }}</p>
                                    <p v-if="owner.notes" class="mt-2 text-sm text-gemini-subtext">{{ owner.notes }}</p>
                                </article>
                            </div>
                        </section>

                        <section aria-labelledby="deeds-heading">
                            <div class="mb-3 flex items-center gap-2">
                                <Landmark class="h-4 w-4 text-gemini-blue" />
                                <h3 id="deeds-heading" class="text-sm font-semibold text-gemini-text">Deed history</h3>
                                <span class="text-xs text-gemini-subtext">{{ detail.deeds.length }}</span>
                            </div>
                            <div v-if="!detail.deeds.length"
                                class="rounded-xl border border-dashed border-gemini-border p-4 text-sm text-gemini-subtext">
                                {{ detail.deedLookup ? 'No deeds were returned by TAD.' : 'Deed history has not been
                                retrieved yet.' }}
                            </div>
                            <div v-else class="divide-y divide-gemini-border rounded-xl border border-gemini-border">
                                <article v-for="deed in detail.deeds" :key="deed.id" class="px-4 py-3">
                                    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                        <h4 class="text-sm font-medium text-gemini-text">{{ deed.description ||
                                            deed.deedType || 'Deed' }}
                                        </h4>
                                        <span class="text-xs capitalize text-gemini-subtext">{{ deed.verificationStatus
                                            }}</span>
                                    </div>
                                    <p class="mt-1 text-xs text-gemini-subtext">{{ formatDate(deed.deedDate) }}</p>
                                    <p class="mt-2 text-sm text-gemini-subtext">Seller: {{ deed.grantor || 'Unknown' }}
                                    </p>
                                    <p class="mt-1 text-sm text-gemini-subtext">Buyer: {{ deed.grantee || 'Unknown' }}
                                    </p>
                                    <p v-if="deed.instrumentNumber || deed.book || deed.volume || deed.page"
                                        class="mt-2 text-xs text-gemini-subtext">
                                        {{ [deed.instrumentNumber && `Instrument ${deed.instrumentNumber}`, deed.book &&
                                            `Book
                                        ${deed.book}`, deed.volume && deed.volume !== deed.book && `Volume
                                        ${deed.volume}`, deed.page &&
                                        `Page ${deed.page}`].filter(Boolean).join(' · ') }}
                                    </p>
                                    <a v-if="deed.source?.url" :href="deed.source.url" target="_blank"
                                        rel="noopener noreferrer"
                                        class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gemini-blue hover:underline">
                                        View TAD source
                                        <ArrowUpRight class="h-3 w-3" />
                                    </a>
                                </article>
                            </div>
                        </section>

                        <section aria-labelledby="mentions-heading">
                            <div class="mb-3 flex items-center gap-2">
                                <Newspaper class="h-4 w-4 text-gemini-blue" />
                                <h3 id="mentions-heading" class="text-sm font-semibold text-gemini-text">Historical
                                    mentions</h3>
                                <span class="text-xs text-gemini-subtext">{{ detail.events.length }}</span>
                            </div>
                            <div v-if="!detail.events.length"
                                class="rounded-xl border border-dashed border-gemini-border p-4 text-sm text-gemini-subtext">
                                No newspaper or historical events have been added yet.
                            </div>
                            <div v-else class="divide-y divide-gemini-border rounded-xl border border-gemini-border">
                                <article v-for="event in detail.events" :key="event.id" class="px-4 py-3">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        <h4 class="text-sm font-medium text-gemini-text">{{ event.title ||
                                            formatEventType(event.eventType)
                                            }}</h4>
                                        <span class="text-xs capitalize text-gemini-subtext">{{ event.verificationStatus
                                            }}</span>
                                    </div>
                                    <p class="mt-1 flex items-center gap-1 text-xs capitalize text-gemini-subtext">
                                        <Clock3 class="h-3 w-3" />{{ formatDate(event.eventDate) }} · {{
                                        formatEventType(event.eventType) }}
                                    </p>
                                    <p v-if="event.summary" class="mt-2 text-sm leading-relaxed text-gemini-subtext">{{
                                        event.summary }}</p>
                                    <blockquote v-if="event.excerpt"
                                        class="mt-2 border-l-2 border-gemini-border pl-3 text-sm text-gemini-subtext">{{
                                        event.excerpt }}
                                    </blockquote>
                                    <a v-if="event.source?.url" :href="event.source.url" target="_blank"
                                        rel="noopener noreferrer"
                                        class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gemini-blue hover:underline">
                                        {{ event.source.name || event.source.citation || 'View source' }}
                                        <ArrowUpRight class="h-3 w-3" />
                                    </a>
                                    <p v-else-if="event.source?.citation || event.source?.name"
                                        class="mt-2 text-xs text-gemini-subtext">{{
                                            event.source.citation || event.source.name }}</p>
                                </article>
                            </div>
                        </section>
                    </div>
                </template>
            </section>
        </div>
    </main>
</template>
