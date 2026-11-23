/**
 * Запись цветов двух верхних полосок в ОБЩЕЕ хранилище Zepp OS (API_LEVEL 3.0+), откуда их читает циферблат Luv Face (его shared/top.js).
 * Циферблат читает так: TypedStorage(1061613, 'u613stat') — ints c0…c5 и int64 at; LocalStorage(1061613, 'u613stat.json') — { top: [6 цветов], at }.
 * Имена обязаны совпадать с циферблатом (STAT_APP_ID, SCOPE, FILE там и здесь одинаковые).
 *
 * Классы хранилища передаются снаружи (api = { TypedStorage, LocalStorage } из '@zos/share-storage'; в тестах — заглушки), поэтому здесь нет обращений к API часов.
 * Как именно у конкретной прошивки пишется в общее хранилище, заранее не известно (ни одной проверки на живых часах у нас нет), поэтому запись пробует
 * несколько вариантов вызова (с номером приложения и без) и после записи перечитывает так же, как читает циферблат. Что вышло — в результате (и в диагностике приложения).
 */
export const STAT_APP_ID = 1061613   // appId этого приложения (app.json)
export const SCOPE = 'u613stat'      // группа TypedStorage
export const FILE = 'u613stat.json'  // файл LocalStorage
export const COUNT = 6

/** Шесть цветов для циферблата из 8 × 3 цветов приложения: полоска 0 (слова) и полоска 1 (все занятия): месяц, неделя, день. Нет данных — null. */
export function topSix(colors) {
  if (!colors || colors.length < 2 || !colors[0] || !colors[1]) return null
  const out = [].concat(colors[0].slice(0, 3), colors[1].slice(0, 3))
  if (out.length !== COUNT) return null
  for (let i = 0; i < COUNT; i++) if (typeof out[i] !== 'number') return null
  return out
}

function call(f) { try { f() } catch (e) { /* не критично */ } }

/** Имена, названия которых похожи на классы общего хранилища: в каком из модулей что есть (для диагностики). */
function exportsOf(ns) {
  const out = []
  try { for (const k of Object.keys(ns || {})) out.push(k) } catch (e) { /* не перечислить */ }
  return out
}

/**
 * Записать шесть цветов и время записи at (мс).
 * mods = { ss: модуль '@zos/share-storage', st: модуль '@zos/storage' } (в тестах — заглушки). Пробуются ВСЕ подходящие классы обоих модулей
 * (TypedStorage / ShareTypedStorage и LocalStorage / ShareLocalStorage) с разными вариантами аргументов; ошибки не прерывают перебор.
 * Возвращает { ok, verified, wrote, errs, exp }: ok — хоть одна запись прошла без ошибки; verified — перечитанное так, как читает циферблат, совпало;
 * wrote — сколько записей прошло; errs — что не вышло; exp — какие имена есть в модулях (чтобы понять, как писать, если ничего не вышло).
 */
export function writeTop(mods, six, at) {
  const res = { ok: false, verified: false, wrote: 0, errs: '', exp: '' }
  if (!mods || !six || six.length !== COUNT) { res.errs = 'нечего писать'; return res }
  const mm = [['ss', mods.ss], ['st', mods.st]]
  res.exp = mm.map((m) => m[0] + ':' + exportsOf(m[1]).join(',')).join(' ')
  const typedArgs = [[SCOPE], [STAT_APP_ID, SCOPE]]
  const fileArgs = [[FILE], [STAT_APP_ID, FILE]]
  for (const pair of mm) {
    const tag = pair[0]
    const ns = pair[1]
    if (!ns) continue
    for (const name of ['TypedStorage', 'ShareTypedStorage']) {
      if (!ns[name]) continue
      if (tag === 'st' && name === 'TypedStorage') continue    // свой, не общий
      for (let v = 0; v < typedArgs.length; v++) {
        try {
          const o = new ns[name](...typedArgs[v])
          for (let i = 0; i < COUNT; i++) o.setInt('c' + i, six[i])
          o.setInt64('at', at)
          call(() => { if (typeof o.flush === 'function') o.flush() })
          call(() => { if (typeof o.save === 'function') o.save() })
          res.wrote++
        } catch (e) { res.errs += tag + '.' + name + v + ': ' + String(e).slice(0, 36) + '; ' }
      }
    }
    for (const name of ['LocalStorage', 'ShareLocalStorage']) {
      if (!ns[name]) continue
      if (tag === 'st' && name === 'LocalStorage') continue
      for (let v = 0; v < fileArgs.length; v++) {
        try {
          const o = new ns[name](...fileArgs[v])
          o.setItem('top', six)
          o.setItem('at', at)
          call(() => { if (typeof o.flush === 'function') o.flush() })
          call(() => { if (typeof o.save === 'function') o.save() })
          res.wrote++
        } catch (e) { res.errs += tag + '.' + name + v + ': ' + String(e).slice(0, 36) + '; ' }
      }
    }
  }
  res.ok = res.wrote > 0
  // проверка: читаем ровно так, как читает циферблат (классы TypedStorage / LocalStorage из '@zos/share-storage' с номером приложения)
  const ss = mods.ss
  try {
    const t = new ss.TypedStorage(STAT_APP_ID, SCOPE)
    if (+t.getInt64('at', 0) === at && t.getInt('c0', -1) === six[0]) res.verified = true
  } catch (e) { res.errs += 'чтение typed: ' + String(e).slice(0, 36) + '; ' }
  if (!res.verified) {
    try {
      const f = new ss.LocalStorage(STAT_APP_ID, FILE)
      if (+f.getItem('at', 0) === at) res.verified = true
    } catch (e) { res.errs += 'чтение file: ' + String(e).slice(0, 36) + '; ' }
  }
  return res
}

/** Короткая строка для диагностики. */
export function describe(res) {
  if (!res) return 'ещё не писали'
  const base = !res.ok ? 'ОШИБКА, записей 0' : res.verified ? 'записано, перечитано' : 'записано (' + res.wrote + '), но чтение как у циферблата не совпало'
  return base + (res.errs ? ' | ' + res.errs.trim() : '') + (res.verified ? '' : ' | есть: ' + res.exp)
}
