// Прогон страниц приложения в Node с заглушками API часов: быстрое обновление (page/quick) и основная страница (page/index) записывают цвета для циферблата.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-'))
for (const d of ['page', 'shared']) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true })
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}')
for (const f of [...fs.readdirSync(path.join(tmp, 'page')).map((x) => path.join(tmp, 'page', x)), ...fs.readdirSync(path.join(tmp, 'shared')).map((x) => path.join(tmp, 'shared', x))]) {
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/from '((?:\.\.?\/)(?:shared\/)?\w+)'/g, "from '$1.js'"))
}
const mod = (name, code) => {
  const d = path.join(tmp, 'node_modules', ...name.split('/'))
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }))
  fs.writeFileSync(path.join(d, 'index.js'), code)
}
{
  const d = path.join(tmp, 'node_modules', '@zeppos', 'zml')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: '@zeppos/zml', type: 'module', exports: { './base-page': './base-page.js' } }))
  fs.writeFileSync(path.join(d, 'base-page.js'), 'export function BasePage(o) { o.request = (p) => globalThis.__request(p); return o }')
}
mod('@zos/ui', `
export const widget = { FILL_RECT: 'FILL_RECT', BUTTON: 'BUTTON', TEXT: 'TEXT', IMG: 'IMG' }
export const prop = { TEXT: 'text', MORE: 'more', VISIBLE: 'visible' }
export const align = { CENTER_H: 1, CENTER_V: 2, LEFT: 3, TOP: 4 }
export const text_style = { WRAP: 1 }
export function setStatusBarVisible() {}
export function createWidget(type, p) {
  const w = { type, p, setProperty(k, v) { if (k === 'more') Object.assign(w.p, v); else w.p[k] = v } }
  globalThis.__widgets.push(w)
  return w
}`)
mod('@zos/page', `export function setScrollLock() {}`)
mod('@zos/display', `export function setWakeUpRelaunch() {}`)
mod('@zos/storage', `export class LocalStorage { constructor() { this.m = globalThis.__ls } getItem(k, d) { return k in this.m ? this.m[k] : d } setItem(k, v) { this.m[k] = v } }`)
mod('@zos/router', `
export function back() { globalThis.__calls.push('back') }
export function home() { globalThis.__calls.push('home') }
export function exit() { globalThis.__calls.push('exit') }`)
mod('@zos/share-storage', `
export class TypedStorage {
  constructor(...a) { this.k = a.length === 2 ? a[0] + '|' + a[1] : '1061613|' + a[0]; globalThis.__sh.typed[this.k] = globalThis.__sh.typed[this.k] || {} }
  setInt(k, v) { globalThis.__sh.typed[this.k][k] = v }
  setInt64(k, v) { globalThis.__sh.typed[this.k][k] = v }
  getInt(k, d) { return !globalThis.__sh.blind && k in globalThis.__sh.typed[this.k] ? globalThis.__sh.typed[this.k][k] : d }
  getInt64(k, d) { return !globalThis.__sh.blind && k in globalThis.__sh.typed[this.k] ? globalThis.__sh.typed[this.k][k] : d }
}
export class LocalStorage {
  constructor(...a) { this.k = a.length === 2 ? a[0] + '|' + a[1] : '1061613|' + a[0]; globalThis.__sh.file[this.k] = globalThis.__sh.file[this.k] || {} }
  setItem(k, v) { globalThis.__sh.file[this.k][k] = v }
  getItem(k, d) { return !globalThis.__sh.blind && k in globalThis.__sh.file[this.k] ? globalThis.__sh.file[this.k][k] : d }
}`)

function reset() {
  globalThis.__widgets = []
  globalThis.__calls = []
  globalThis.__ls = {}
  globalThis.__sh = { typed: {}, file: {} }
  globalThis.__timeouts = []
}
globalThis.setTimeout = (f, ms) => { globalThis.__timeouts.push({ f, ms }); return globalThis.__timeouts.length }
globalThis.clearTimeout = () => {}
globalThis.setInterval = () => 1
globalThis.clearInterval = () => {}
globalThis.App = () => {}
let page = null
globalThis.Page = (o) => { page = o }

const grid = []
for (let r = 0; r < 8; r++) grid.push([0x200000 + r * 16 + 1, 0x200000 + r * 16 + 2, 0x200000 + r * 16 + 3])
const flush = () => new Promise((r) => setImmediate(r))
let n = 0
async function t(name, f) { await f(); n++; console.log('ok  ' + name) }

// ---------- быстрое обновление ----------
await t('quick: две полоски, ответ телефона красит их, пишет для циферблата и закрывается', async () => {
  reset()
  globalThis.__request = async (p) => { assert.deepEqual(p, { method: 'u613.send', params: { t: 'stat' } }); return { ok: true, reply: { t: 'stat', c: grid, ts: 7 } } }
  await import(pathToFileURL(path.join(tmp, 'page', 'quick.js')).href)
  page.onInit(); page.build()
  const rects = globalThis.__widgets.filter((w) => w.type === 'FILL_RECT')
  assert.equal(rects.length, 1 + 6, 'фон + 6 сегментов (две полоски)')
  assert.deepEqual(rects.slice(1, 4).map((r) => r.p.w), [125, 125, 124])
  assert.equal(rects[1].p.h, 36)
  assert.equal(rects[4].p.y - rects[1].p.y, 36 + 18)
  assert.equal(globalThis.__widgets.filter((w) => w.type === 'BUTTON' || w.type === 'IMG' || w.type === 'TEXT').length, 0, 'ни кнопок, ни текста')
  await flush(); await flush()
  assert.deepEqual(rects.slice(1).map((r) => r.p.color), [...grid[0], ...grid[1]])
  const typed = globalThis.__sh.typed['1061613|u613stat']
  assert.ok(typed && typed.at > 0)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => typed['c' + i]), [...grid[0], ...grid[1]])
  assert.deepEqual(globalThis.__sh.file['1061613|u613stat.json'].top, [...grid[0], ...grid[1]])
  // закрытие: через 250 мс — back; запасные home и exit — позже
  const closer = globalThis.__timeouts.find((x) => x.ms === 250)
  assert.ok(closer, 'закрытие запланировано')
  closer.f()
  assert.deepEqual(globalThis.__calls, ['back'])
  globalThis.__timeouts.find((x) => x.ms === 700).f()
  globalThis.__timeouts.find((x) => x.ms === 1400).f()
  assert.deepEqual(globalThis.__calls, ['back', 'home', 'exit'])
  // цвета сохранены и для основной страницы
  assert.ok(JSON.parse(globalThis.__ls.c3).length === 8)
})

await t('quick: телефон не ответил — один повтор, потом причина на экране и закрытие', async () => {
  reset()
  let calls = 0
  globalThis.__request = async () => { calls++; return { ok: false, error: 'нет связи' } }
  page.onInit(); page.build()
  await flush(); await flush()
  const retry = globalThis.__timeouts.find((x) => x.ms === 1500)
  assert.ok(retry)
  retry.f(); await flush(); await flush()
  assert.equal(calls, 2)
  globalThis.__timeouts.find((x) => x.ms === 5000).f()
  assert.equal(globalThis.__widgets.filter((w) => w.type === 'TEXT').length, 1)
  assert.ok(globalThis.__timeouts.find((x) => x.ms === 2500))
  assert.equal(Object.keys(globalThis.__sh.typed).length, 0, 'нечего писать — общее хранилище не тронуто')
})

await t('quick: запись для циферблата не подтвердилась — причина на экране 20 секунд, закрытие не раньше', async () => {
  reset()
  globalThis.__sh.blind = true
  globalThis.__request = async () => ({ ok: true, reply: { t: 'stat', c: grid, ts: 7 } })
  page.onInit(); page.build()
  await flush(); await flush()
  const txt = globalThis.__widgets.filter((w) => w.type === 'TEXT')
  assert.equal(txt.length, 1)
  assert.match(txt[0].p.text, /не совпало|ОШИБКА/)
  assert.equal(globalThis.__timeouts.find((x) => x.ms === 250), undefined, 'быстрого закрытия нет')
  assert.ok(globalThis.__timeouts.find((x) => x.ms === 20000))
})

// ---------- основная страница ----------
await t('index: успешный ответ телефона пишет цвета двух верхних полосок для циферблата', async () => {
  reset()
  globalThis.__request = async () => ({ ok: true, reply: { t: 'stat', c: grid, ts: 9 } })
  await import(pathToFileURL(path.join(tmp, 'page', 'index.js')).href)
  page.onInit(); page.build()
  await flush(); await flush()
  const typed = globalThis.__sh.typed['1061613|u613stat']
  assert.ok(typed && typed.at > 0)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => typed['c' + i]), [...grid[0], ...grid[1]])
  assert.deepEqual(globalThis.__sh.file['1061613|u613stat.json'].top, [...grid[0], ...grid[1]])
})

console.log(n + ' проверок пройдено (страницы)')
