import assert from 'node:assert/strict'
import * as shr from '../shared/share.js'

let n = 0
function t(name, f) { f(); n++; console.log('ok  ' + name) }

// те же имена, что читает циферблат (Face shared/top.js)
t('имена как у циферблата', () => {
  assert.equal(shr.STAT_APP_ID, 1061613)
  assert.equal(shr.SCOPE, 'u613stat')
  assert.equal(shr.FILE, 'u613stat.json')
})

const grid = []
for (let r = 0; r < 8; r++) grid.push([0x100000 + r * 16 + 1, 0x100000 + r * 16 + 2, 0x100000 + r * 16 + 3])

t('topSix берёт полоски 0 и 1: месяц, неделя, день', () => {
  assert.deepEqual(shr.topSix(grid), [...grid[0], ...grid[1]])
  assert.equal(shr.topSix(null), null)
  assert.equal(shr.topSix([grid[0]]), null)
  assert.equal(shr.topSix([[1, 2, 3], [4, 'x', 6]]), null)
})

// заглушка общего хранилища: пишется и читается по ключу (appId|scope); «свой» вариант вызова без appId пишет в тот же ключ
function makeApi(opts = {}) {
  const store = { typed: {}, file: {} }
  const key = (a) => (a.length === 2 ? String(a[0]) + '|' + a[1] : String(shr.STAT_APP_ID) + '|' + a[0])
  class TypedStorage {
    constructor(...a) { if (opts.throwTyped) throw new Error('нет API'); this.k = key(a); store.typed[this.k] = store.typed[this.k] || {} }
    setInt(k, v) { store.typed[this.k][k] = v }
    setInt64(k, v) { store.typed[this.k][k] = v }
    getInt(k, d) { return k in store.typed[this.k] ? store.typed[this.k][k] : d }
    getInt64(k, d) { return k in store.typed[this.k] ? store.typed[this.k][k] : d }
  }
  class LocalStorage {
    constructor(...a) { if (opts.throwFile) throw new Error('нет файла'); this.k = key(a); store.file[this.k] = store.file[this.k] || {} }
    setItem(k, v) { store.file[this.k][k] = v }
    getItem(k, d) { return k in store.file[this.k] ? store.file[this.k][k] : d }
  }
  return { api: { TypedStorage, LocalStorage }, store }
}

t('запись читается так, как читает циферблат', () => {
  const { api, store } = makeApi()
  const six = shr.topSix(grid)
  const r = shr.writeTop({ ss: api }, six, 1700000000123)
  assert.equal(r.ok, true)
  assert.equal(r.verified, true)
  const k = shr.STAT_APP_ID + '|' + shr.SCOPE
  assert.equal(store.typed[k].at, 1700000000123)
  six.forEach((c, i) => assert.equal(store.typed[k]['c' + i], c))
  const fk = shr.STAT_APP_ID + '|' + shr.FILE
  assert.deepEqual(store.file[fk].top, six)
  assert.equal(store.file[fk].at, 1700000000123)
  assert.match(shr.describe(r), /перечитано/)
})

t('если одно из хранилищ не открывается — пишется другое', () => {
  const { api } = makeApi({ throwTyped: true })
  const r = shr.writeTop({ ss: api }, shr.topSix(grid), 5)
  assert.equal(r.ok, true)
  assert.equal(r.verified, true)
  assert.match(r.errs, /typed/)
})

t('если не открывается ничего — ok=false и понятная причина', () => {
  const { api } = makeApi({ throwTyped: true, throwFile: true })
  const r = shr.writeTop({ ss: api }, shr.topSix(grid), 5)
  assert.equal(r.ok, false)
  assert.match(shr.describe(r), /ОШИБКА/)
})

t('нечего писать — не падает', () => {
  const { api } = makeApi()
  assert.equal(shr.writeTop({ ss: api }, null, 1).ok, false)
  assert.equal(shr.writeTop(null, shr.topSix(grid), 1).ok, false)
  assert.equal(shr.describe(null), 'ещё не писали')
})

t('пишущий класс может оказаться в другом модуле и называться ShareTypedStorage — он тоже пробуется; чтение как у циферблата не совпало — это видно', () => {
  const { api, store } = makeApi()
  // в «@zos/share-storage» классы только читают (запись бросает), пишет ShareTypedStorage из «@zos/storage»
  class ReadOnlyTyped extends api.TypedStorage { setInt() { throw new Error('read only') } setInt64() { throw new Error('read only') } }
  class ReadOnlyFile extends api.LocalStorage { setItem() { throw new Error('read only') } }
  const ss = { TypedStorage: ReadOnlyTyped, LocalStorage: ReadOnlyFile }
  const st = { ShareTypedStorage: api.TypedStorage }
  const r = shr.writeTop({ ss, st }, shr.topSix(grid), 42)
  assert.equal(r.ok, true)
  assert.ok(r.wrote >= 1)
  assert.match(r.errs, /ss\.TypedStorage0: Error: read only/)
  assert.match(r.exp, /ss:TypedStorage,LocalStorage st:ShareTypedStorage/)
  // ShareTypedStorage без appId пишет в ключ с «своим» appId — читается и циферблатом
  assert.equal(r.verified, true)
})

t('всё пишется, но читается не то (запись ушла «не туда») — verified=false, в описании есть список имён', () => {
  const { api } = makeApi()
  class Blind extends api.TypedStorage { getInt64() { return 0 } getInt(k, d) { return d } }
  class BlindFile extends api.LocalStorage { getItem(k, d) { return d } }
  const r = shr.writeTop({ ss: { TypedStorage: Blind, LocalStorage: BlindFile } }, shr.topSix(grid), 42)
  assert.equal(r.ok, true)
  assert.equal(r.verified, false)
  assert.match(shr.describe(r), /не совпало/)
  assert.match(shr.describe(r), /есть: ss:TypedStorage,LocalStorage/)
})
console.log(n + ' проверок пройдено')
