import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, it, expect, beforeAll } from 'vitest'

// 垫片必须住在 index.html 的经典内联脚本里：打包器把依赖切成独立 chunk，
// chunk 的执行早于入口 chunk 的模块体，所以放 main.tsx 里 import 一律太晚
// （framer-motion 在 ui-vendor 模块初始化期就调用 queueMicrotask）。
// 这里直接对 index.html 里那份真身做测试，而不是另抄一份。
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const SCRIPT_ID = 'kernel-polyfills'

// Chromium 86（微信安卓 XWEB 最老一档）没有、且本项目在用的 API
const MISSING_ON_CHROME_86 = [
    'delete Array.prototype.at',
    'delete String.prototype.at',
    'delete Array.prototype.findLast',
    'delete Array.prototype.findLastIndex',
    'delete Object.hasOwn',
    'delete globalThis.structuredClone',
]

describe('index.html 内核垫片', () => {
    it('必须出现在 module 脚本之前，否则和写在 main.tsx 里一样晚', () => {
        const shimAt = html.indexOf(`id="${SCRIPT_ID}"`)
        const moduleAt = html.indexOf('type="module"')
        expect(shimAt).toBeGreaterThan(-1)
        expect(moduleAt).toBeGreaterThan(-1)
        expect(shimAt).toBeLessThan(moduleAt)
    })

    describe('在缺少这些 API 的内核上补齐行为', () => {
        let ctx: ReturnType<typeof createContext>
        beforeAll(() => {
            const m = html.match(new RegExp(`<script id="${SCRIPT_ID}">([\\s\\S]*?)</script>`))
            if (!m) throw new Error(`index.html 里找不到 id=${SCRIPT_ID} 的脚本`)
            // 独立 realm：删掉这些 API 模拟老内核，且不污染测试进程自身的内建对象
            ctx = createContext({})
            runInContext(MISSING_ON_CHROME_86.join(';'), ctx)
            runInContext(m[1], ctx)
        })

        it('Array.prototype.at 支持负数下标', () => {
            expect(runInContext('[1,2,3].at(0)', ctx)).toBe(1)
            expect(runInContext('[1,2,3].at(-1)', ctx)).toBe(3)
        })

        it('String.prototype.at 支持负数下标', () => {
            expect(runInContext("'abc'.at(-1)", ctx)).toBe('c')
        })

        it('findLast / findLastIndex 从后往前找', () => {
            expect(runInContext('[1,2,3,4].findLast(n => n % 2 === 0)', ctx)).toBe(4)
            expect(runInContext('[1,2,3,4].findLastIndex(n => n % 2 === 0)', ctx)).toBe(3)
            expect(runInContext('[1,3].findLast(n => n % 2 === 0)', ctx)).toBe(undefined)
            expect(runInContext('[1,3].findLastIndex(n => n % 2 === 0)', ctx)).toBe(-1)
        })

        it('Object.hasOwn 只认自有属性', () => {
            expect(runInContext("Object.hasOwn({ a: 1 }, 'a')", ctx)).toBe(true)
            expect(runInContext("Object.hasOwn(Object.create({ a: 1 }), 'a')", ctx)).toBe(false)
        })

        it('structuredClone 是深拷贝，不是引用共享', () => {
            const r = runInContext(
                `(() => {
                    const src = { a: { b: [1, 2] } }
                    const copy = structuredClone(src)
                    copy.a.b.push(3)
                    return JSON.stringify([src.a.b.length, copy.a.b.length])
                })()`,
                ctx,
            )
            expect(r).toBe('[2,3]')
        })
    })
})
