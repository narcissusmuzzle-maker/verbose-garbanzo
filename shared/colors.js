/**
 * Цвета полосок: приходят с телефона, хранятся на часах (чтобы при открытии приложения сразу было что показать).
 * Формат ответа телефона: { t: 'stat', c: [[месяц, неделя, день] × 8], ts: <мс> } — цвета числами 0xRRGGBB:
 *   строка 0 — слова, строка 1 — все занятия вместе, строки 2…7 — 🩸 💀 🧬 📖 [🏠] 🤖 (сверху вниз, как в виджете статистики; строка 6 — бывшее место 🧭:
 *   LuvU613 до этой версии присылает её серой, патч WatchStat.kt из архива 1.0.8 кладёт туда 🏠).
 * На часах вертикальные полоски идут слева направо 🏠 🤖 📖 🧬 💀 🩸, то есть строки телефона 6, 7, 5, 4, 3, 2 (SCREEN_ORDER).
 * Поэтому ответ телефона сразу переставляется в порядок экрана (mirror): всё остальное в приложении (рисование, хранение) работает уже с ним.
 */
export const ROWS = 8
export const COLS = 3
export const GRAY = 0x3a3a3a      // нет данных — серый, как в виджете на телефоне

export function emptyColors() {
  const c = []
  for (let r = 0; r < ROWS; r++) c.push([GRAY, GRAY, GRAY])
  return c
}

function okColor(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 0xffffff && Math.floor(v) === v
}

/** Какие строки телефона (2…7) стоят на экране слева направо: 🏠 (строка 6), 🤖 (7), 📖 (5), 🧬 (4), 💀 (3), 🩸 (2). */
export const SCREEN_ORDER = [6, 7, 5, 4, 3, 2]

/** Переставить строки 2…7 из порядка телефона (сверху вниз) в порядок экрана часов (слева направо). Строки 0 и 1 остаются. Возвращает новый массив. */
export function mirror(c) {
  const out = c.slice(0, 2)
  for (let k = 0; k < SCREEN_ORDER.length; k++) out.push(c[SCREEN_ORDER[k]])
  return out
}

/** Проверить массив цветов 8×3. Возвращает чистую копию или null. */
export function cleanColors(c) {
  if (!c || c.length !== ROWS) return null
  const out = []
  for (let r = 0; r < ROWS; r++) {
    const row = c[r]
    if (!row || row.length !== COLS) return null
    const o = []
    for (let k = 0; k < COLS; k++) {
      if (!okColor(row[k])) return null
      o.push(row[k])
    }
    out.push(o)
  }
  return out
}

/** Разобрать ответ телефона на «stat»: { colors, ts, err } — colors равно null, если ответ не годится (err — понятная причина). */
export function parseReply(r) {
  if (!r || typeof r !== 'object') return { colors: null, ts: 0, err: 'пустой ответ телефона' }
  if (r.t === 'err') return { colors: null, ts: 0, err: 'телефон ответил «' + String(r.m || 'ошибка') + '»: LuvU613 старее 5.13 или не смог посчитать статистику' }
  if (r.t !== 'stat') return { colors: null, ts: 0, err: 'ответ не «stat»: ' + String(r.t) }
  const c = cleanColors(r.c)
  if (!c) return { colors: null, ts: 0, err: 'цвета в ответе неверные' }
  return { colors: mirror(c), ts: +r.ts || 0, err: '' }
}

/** Прочитать сохранённые цвета (строка JSON из хранилища); при любой беде — серые. */
export function loadColors(text) {
  if (!text) return emptyColors()
  try {
    return cleanColors(JSON.parse(text)) || emptyColors()
  } catch (e) {
    return emptyColors()
  }
}

/** Одинаковы ли два набора цветов (чтобы не перерисовывать то, что не изменилось). */
export function sameColors(a, b) {
  if (!a || !b) return false
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) if (a[r][k] !== b[r][k]) return false
  return true
}
