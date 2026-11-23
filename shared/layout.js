/**
 * Раскладка экрана U613 Stat (чистые функции, без обращений к API часов — проверяются тестами в Node).
 *
 * Экран 432×514. Сверху две горизонтальные полоски (без подписей), под ними в одну строку шесть эмодзи 🏠 🤖 📖 🧬 💀 🩸 (слева направо),
 * под каждым эмодзи — своя ВЕРТИКАЛЬНАЯ полоска. У каждой полоски три сегмента: месяц | неделя | день
 * (у горизонтальных — слева направо, у вертикальных — сверху вниз).
 *
 * Размеры (y — «как в описании», первая полоска на y = 48):
 *  - полоски 1 и 2: x = 26…406, высота 36 px, между ними 18 px, три сегмента с зазором 3 px (125 + 125 + 124);
 *  - от низа полоски 2 до верха ряда эмодзи 14 px; эмодзи 36 px (в 1,5 раза крупнее прежних 24);
 *  - от низа эмодзи до верха вертикальных полосок 6 px;
 *  - вертикальные полоски шириной 39 px (было 58), равномерно по ширине 380 px (шаг 68,2 px), эмодзи по центру над своей;
 *    три сегмента по вертикали с зазором 3 px; низ полосок — 494 минус BOTTOM_TRIM (30) = 464.
 * Горизонтальный сдвиг SHIFT_X (-18) двигает ВСЁ (и верхние полоски тоже) влево: картинка занимает x = 8…388, как сетка приложения «Таймер» (LEFT = 8, центр CX = 198).
 * Верхние полоски по вертикали не двигаются: их y не зависит от BOTTOM_TRIM.
 * На страницу y переводятся через pageLayout(down, shiftX, trim) так же, как в «Таймере»: y страницы = y описания - (64 - down).
 */
export const FULL_LIFT = 64       // полностью поднятое положение (как в «Таймере»)
export const SCREEN_W = 432
export const X0 = 26
export const BAR_W = 380
export const SEG_GAP = 3
export const SEGS = 3
export const SPEC_TOP = 48
export const TOP_H = 36
export const TOP_GAP = 18
export const AFTER_TOP = 14       // от низа полоски 2 до верха ряда эмодзи
export const EMOJI_SIZE = 36
export const EMOJI_GAP = 6        // от низа эмодзи до верха вертикальных полосок
export const VERT_W = 39          // ширина вертикальной полоски
export const SPEC_BOTTOM = 494    // низ вертикальных полосок в описании, до обрезки
export const BARS = 8
export const LABELED = 6          // вертикальных полосок (3…8)
export const DEFAULT_SHIFT_X = -18
export const DEFAULT_TRIM = 30

/** Три сегмента длины total с зазорами SEG_GAP: [{ p, l }] (p — смещение от начала, l — длина). Лишние пиксели — первым сегментам. */
export function split3(total) {
  const free = total - SEG_GAP * (SEGS - 1)
  const base = Math.floor(free / SEGS)
  const extra = free - base * SEGS
  const out = []
  let p = 0
  for (let i = 0; i < SEGS; i++) {
    const l = base + (i < extra ? 1 : 0)
    out.push({ p: p, l: l })
    p += l + SEG_GAP
  }
  return out
}

/** Сегменты горизонтальной полоски: [{ x, w }]. Ширина 380 делится на три: 125 + 125 + 124. */
export function segments(shiftX) {
  const dx = shiftX | 0
  return split3(BAR_W).map((s) => ({ x: X0 + dx + s.p, w: s.l }))
}

/** Левые края шести вертикальных полосок: равномерно от X0 до X0 + 380 - VERT_W. */
export function vertXs(shiftX) {
  const dx = shiftX | 0
  const pitch = (BAR_W - VERT_W) / (LABELED - 1)
  const out = []
  for (let i = 0; i < LABELED; i++) out.push(X0 + dx + Math.round(i * pitch))
  return out
}

/**
 * Раскладка в координатах описания:
 *  cells[r][k] = { x, y, w, h } — сегмент k полоски r (r = 0…7, k = 0…2),
 *  emoji[i] = { x, y, size } — эмодзи над вертикальной полоской i (i = 0…5 -> полоски r = 2…7).
 */
export function specLayout(shiftX, trim) {
  const t = trim === undefined ? DEFAULT_TRIM : trim | 0
  const cells = []
  // две верхние горизонтальные полоски
  const hs = segments(shiftX)
  const y1 = SPEC_TOP
  const y2 = y1 + TOP_H + TOP_GAP
  for (const y of [y1, y2]) cells.push(hs.map((s) => ({ x: s.x, y: y, w: s.w, h: TOP_H })))
  // ряд эмодзи и вертикальные полоски
  const emojiY = y2 + TOP_H + AFTER_TOP
  const vTop = emojiY + EMOJI_SIZE + EMOJI_GAP
  const vH = SPEC_BOTTOM - t - vTop
  const vs = split3(vH)
  const xs = vertXs(shiftX)
  const emoji = []
  for (let i = 0; i < LABELED; i++) {
    cells.push(vs.map((s) => ({ x: xs[i], y: vTop + s.p, w: VERT_W, h: s.l })))
    emoji.push({ x: Math.round(xs[i] + VERT_W / 2 - EMOJI_SIZE / 2), y: emojiY, size: EMOJI_SIZE })
  }
  return { cells: cells, emoji: emoji }
}

/** Низ вертикальных полосок в координатах описания (по умолчанию 464). */
export function specBottom(trim) {
  const c = specLayout(0, trim).cells
  const last = c[c.length - 1]
  const s = last[last.length - 1]
  return s.y + s.h
}

/** Раскладка для страницы: y страницы = y описания - (64 - down). down = 33 даёт подъём на 31 px. */
export function pageLayout(down, shiftX, trim) {
  const s = specLayout(shiftX === undefined ? DEFAULT_SHIFT_X : shiftX, trim)
  const dy = -(FULL_LIFT - (down | 0))
  return {
    cells: s.cells.map((row) => row.map((c) => ({ x: c.x, y: c.y + dy, w: c.w, h: c.h }))),
    emoji: s.emoji.map((e) => ({ x: e.x, y: e.y + dy, size: e.size })),
    top: SPEC_TOP + dy,
    bottom: specBottom(trim) + dy,
  }
}
