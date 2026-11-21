export type MonitoringMode = 'manual' | 'scheduled' | 'heartbeat'
export type RunOutcome = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
export type StatusCondition = 'unknown' | 'late' | 'stale' | 'overdue' | 'reported_unhealthy' | 'paused'
export type ServiceHealth = 'healthy' | 'degraded' | 'unhealthy'
export type StatusProgress = { current: number; total?: number; unit?: string }
export type StatusMetrics = Record<string, { value: number; unit?: string }>

export interface StatusEventInput {
    eventId: string
    runId?: string
    sequence?: number
    type: 'started' | 'progress' | 'log' | 'heartbeat' | 'completed'
    occurredAt?: string
    scheduledFor?: string
    source?: string
    message?: string
    log?: string
    severity?: 'debug' | 'info' | 'warning' | 'error'
    outcome?: Exclude<RunOutcome, 'running'>
    exitCode?: number
    rawStatus?: string
    health?: ServiceHealth
    progress?: StatusProgress
    metrics?: StatusMetrics
    metadata?: Record<string, unknown>
}

export interface StatusJobConfig {
    name: string
    description: string
    tags: string[]
    mode: MonitoringMode
    intervalSeconds: number | null
    anchorAt: number | null
    graceSeconds: number
    maxRuntimeSeconds: number | null
    heartbeatSeconds: number | null
}

export interface StatusRun {
    id: string
    jobId: string
    firstReceivedAt: number
    startedAt: number | null
    finishedAt: number | null
    lastHeartbeatAt: number | null
    source: string | null
    outcome: RunOutcome
    exitCode: number | null
    rawStatus: string | null
    lastSequence: number
    terminalSequence: number | null
    startSequence: number | null
    scheduleEpoch: number
    scheduleIndex: number | null
    message: string | null
    progress: StatusProgress | null
    metrics: StatusMetrics | null
    durationMs?: number | null
}

export interface StatusJobSummary extends StatusJobConfig {
    id: string
    paused: boolean
    archived: boolean
    createdAt: number
    lastSeenAt: number | null
    serviceHealth: ServiceHealth | null
    conditions: StatusCondition[]
    activeRuns: StatusRun[]
    lastRun: StatusRun | null
    lastSuccessAt: number | null
    nextExpectedAt: number | null
    missedStarts: number
    needsAttention: boolean
    lastHeartbeat: StatusEventRecord | null
}

export interface StatusEventRecord {
    eventId: string
    runId: string | null
    sequence: number | null
    type: StatusEventInput['type']
    receivedAt: number
    occurredAt: number | null
    clockSkewMs: number | null
    payload: StatusEventInput | null
}

export interface StatusPage<T> { items: T[]; total: number; offset: number; limit: number }
export interface StatusJobPage extends StatusPage<StatusJobSummary> {
    evaluatedAt: number
    canManage: boolean
    ingestion: { rejectedEvents: number; storageErrors: number; lastAcceptedAt: number | null; lastSweepAt: number | null }
}
