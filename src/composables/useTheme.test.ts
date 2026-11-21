import { afterEach, beforeEach, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { useTheme } from './useTheme'

const names = ['localStorage', 'window', 'document'] as const
const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
let stored: Map<string, string>
let darkClass: boolean

beforeEach(() => {
    stored = new Map()
    darkClass = false
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
    })
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { matchMedia: () => ({ matches: false }), location: { pathname: '/dashboard' } },
    })
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { documentElement: {
            classList: {
                toggle: (_name: string, enabled: boolean) => { darkClass = enabled },
                add: () => { darkClass = true },
                remove: () => { darkClass = false },
            },
            style: { backgroundColor: '' },
        } },
    })
})
afterEach(() => {
    for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original)
        else Reflect.deleteProperty(globalThis, name)
    }
})

test('dashboard dark override does not overwrite saved light preference and restores it on exit', () => {
    stored.set('wolfdrive-theme', 'light')
    const theme = useTheme()
    theme.initTheme('dark')
    expect(theme.isDark.value).toBe(true)
    expect(darkClass).toBe(true)
    expect(stored.get('wolfdrive-theme')).toBe('light')
    theme.initTheme()
    expect(theme.isDark.value).toBe(false)
    expect(darkClass).toBe(false)
})

test('a fresh kiosk gets dark mode without saving a global dark preference', () => {
    const theme = useTheme()
    theme.initTheme('dark')
    expect(darkClass).toBe(true)
    expect(stored.has('wolfdrive-theme')).toBe(false)
    theme.initTheme()
    expect(theme.selectedTheme.value).toBe('system')
    expect(theme.isDark.value).toBe(false)
})

test('normal theme selections still persist', () => {
    const theme = useTheme()
    theme.applyTheme('dark')
    expect(stored.get('wolfdrive-theme')).toBe('dark')
    theme.applyTheme('light')
    expect(stored.get('wolfdrive-theme')).toBe('light')
})

test('initial dashboard paint is dark even with saved light mode, while other pages remain light', async () => {
    stored.set('wolfdrive-theme', 'light')
    const html = await Bun.file(new URL('../../index.html', import.meta.url)).text()
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    if (!script) throw new Error('Initial theme script not found')
    const context = { window, document, localStorage }
    runInNewContext(script, context)
    expect(darkClass).toBe(true)
    expect(stored.get('wolfdrive-theme')).toBe('light')
    window.location.pathname = '/files'
    runInNewContext(script, context)
    expect(darkClass).toBe(false)
})
