export function formatLocalScheduleTime(timestamp: number): string {
    const date = new Date(timestamp)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseLocalScheduleTime(value: string, originalTimestamp: number | null = null): number {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) {
        throw new Error('Enter a valid local date and time.')
    }
    if (originalTimestamp !== null && value === formatLocalScheduleTime(originalTimestamp)) {
        return originalTimestamp
    }
    const timestamp = new Date(value).getTime()
    if (!Number.isFinite(timestamp) || formatLocalScheduleTime(timestamp) !== value) {
        throw new Error('This local date and time is invalid or does not exist because of a daylight-saving change.')
    }
    return timestamp
}
