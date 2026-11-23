/**
 * U613 Stat — статистика приложения LuvU613 на часах: восемь цветных полосок, в каждой три сегмента (месяц | неделя | день),
 * как в виджете статистики на телефоне. Верхняя — слова (из четырёх сегментов телефона «всего» здесь нет), вторая — все занятия вместе,
 * дальше с подписями 🏠 🤖 📖 🧬 💀 🩸 (слева направо; нижнее поле виджета телефона — самое левое). Текста на экране нет. Цвета считает телефон (LuvU613 5.13), часы только рисуют.
 *
 *  - Цвета приходят с телефона: при открытии приложения, потом раз в минуту, пока оно открыто. Последние цвета хранятся на часах,
 *    поэтому при открытии сразу видна прошлая картина, а новая появляется, когда телефон ответит (обычно за секунду).
 *    Нет связи — остаются прошлые цвета (если их ещё не было — серые, как в виджете, когда данных нет).
 *  - Нажатие на пустое (чёрное) место — обновить сейчас. ДОЛГОЕ нажатие на пустое место — на несколько секунд показать, когда
 *    обновлялось в последний раз и почему не вышло (для проверки связи; обычно экран без текста).
 *  - Свайп вправо — выход из приложения, как у обычных приложений.
 */
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { setScrollLock } from '@zos/page'
import { setWakeUpRelaunch } from '@zos/display'
import { LocalStorage } from '@zos/storage'
import * as share from '@zos/share-storage'
import * as stor from '@zos/storage'
import * as lay from '../shared/layout'
import * as col from '../shared/colors'
import * as shr from '../shared/share'
import { DOWN, SHIFT_X, BOTTOM_TRIM } from '../shared/config'

// Положение на экране (DOWN, SHIFT_X, BOTTOM_TRIM) теперь в shared/config.js — общее с page/quick.js. Правила те же: DOWN сверху обрезано — БОЛЬШЕ, снизу — МЕНЬШЕ.
const WAKE_RELAUNCH = true     // true — при включении экрана приложение открывается заново и сразу обновляет цвета (как «Таймер»)
const REFRESH_MS = 60000       // как часто обновлять, пока приложение открыто
const RETRY_MS = [3000, 8000, 20000]   // если телефон не ответил: повторы через столько миллисекунд, потом ждём обычную минуту
const DIAG_MS = 15000          // сколько миллисекунд держится диагностика после долгого нажатия
const AUTO_DIAG = true         // true — если телефон не ответил, диагностика сама появляется на экране (один раз за открытие приложения)

const VERSION = '1.0.10'
const BLACK = 0x000000
const WHITE = 0xffffff

let ls = null
const mem = {}
function sget(k, d) {
  try { if (ls) { const v = ls.getItem(k, d); return v === undefined || v === null ? d : v } } catch (e) { /* работаем в памяти */ }
  return k in mem ? mem[k] : d
}
function sset(k, v) {
  mem[k] = v
  try { if (ls) ls.setItem(k, v) } catch (e) { /* не критично */ }
}

// Ошибка при построении экрана показывается на экране (а не чёрный экран): иначе на часах её не увидеть
let failed = 0
function fail(msg) {
  failed++
  if (failed > 3) return
  try {
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: 432, h: 514, color: 0x300000 })
    createWidget(widget.TEXT, {
      x: 12, y: 12 + (failed - 1) * 150, w: 408, h: 140, color: WHITE, text_size: 22,
      align_h: align.LEFT, align_v: align.TOP, text_style: text_style.WRAP, text: 'Ошибка ' + failed + ': ' + String(msg).slice(0, 160)
    })
  } catch (e) { /* больше показать нечем */ }
}
function guard(name, f) {
  try { return f() } catch (e) { fail(name + ': ' + e); return undefined }
}

function two(n) { return n < 10 ? '0' + n : '' + n }
function clock(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds())
}

let colors = col.emptyColors()   // что сейчас показано
let rects = []                   // rects[r][k] — сегмент k полоски r
let L = null                     // раскладка страницы
let diagBg = null
let diagTx = null
let diagTimer = null
let timer = null
let retryTimer = null
let busy = false
let busyAt = 0
let retryN = 0
let asked = 0                    // сколько раз спрашивали телефон
let okCount = 0
let okAt = 0                     // когда телефон ответил в последний раз (часы)
let phoneTs = 0                  // когда телефон посчитал цвета
let lastErr = ''
let pingOk = 0                   // 1 — телефон ответил на проверку связи (ping), -1 — не ответил, 0 — ещё не проверяли
let pingErr = ''
let pinging = false
let autoShown = false
let shareRes = null             // что вышло с записью цветов в общее хранилище для циферблата

function setVisible(w, v) {
  try { if (w) w.setProperty(prop.VISIBLE, v) } catch (e) { /* не критично */ }
}

function paint(next) {
  if (!rects.length) return
  for (let r = 0; r < col.ROWS; r++) {
    for (let k = 0; k < col.COLS; k++) {
      if (colors && colors[r][k] === next[r][k]) continue
      const c = L.cells[r][k]
      try { rects[r][k].setProperty(prop.MORE, { x: c.x, y: c.y, w: c.w, h: c.h, color: next[r][k] }) } catch (e) { /* не критично */ }
    }
  }
  colors = next
}

/** Положить цвета двух верхних полосок в общее хранилище — их читает циферблат. Не критично: ошибки только в диагностике. */
function publish(colors, at) {
  try { shareRes = shr.writeTop({ ss: share, st: stor }, shr.topSix(colors), at) } catch (e) { shareRes = { ok: false, verified: false, wrote: 0, errs: String(e).slice(0, 60) } }
}

function showDiag() {
  if (!diagBg) return
  const lines = [
    'U613 Stat ' + VERSION,
    'связь с LuvU613 (ping): ' + (pingOk > 0 ? 'есть' : pingOk < 0 ? 'НЕТ — ' + pingErr : 'не проверялась'),
    'ответ на «stat»: ' + (okAt ? clock(okAt) + ' (' + Math.max(0, Math.round((Date.now() - okAt) / 1000)) + ' с назад)' : 'ещё не было'),
    'цвета посчитаны: ' + clock(phoneTs),
    'запросов ' + asked + ', удачных ' + okCount,
    'для циферблата: ' + shr.describe(shareRes),
    lastErr ? 'ошибка: ' + lastErr : 'ошибок нет'
  ]
  try { diagTx.setProperty(prop.MORE, { x: 28, y: 130, w: 376, h: 330, text: lines.join('\n') }) } catch (e) { /* не критично */ }
  setVisible(diagBg, true)
  setVisible(diagTx, true)
  try { if (diagTimer) clearTimeout(diagTimer) } catch (e) { /* ок */ }
  try {
    diagTimer = setTimeout(() => { setVisible(diagBg, false); setVisible(diagTx, false); diagTimer = null }, DIAG_MS)
  } catch (e) { /* скроется при следующем нажатии */ }
}

let me = null

Page(
  BasePage({
    onInit() {
      try { if (!ls) ls = new LocalStorage() } catch (e) { /* ошибка покажется в build */ }
      try { setStatusBarVisible(false) } catch (e) { /* полоски нет */ }
    },

    build() {
      me = this
      guard('старт', () => { ls = new LocalStorage() })
      guard('полоска', () => setStatusBarVisible(false))
      guard('прокрутка', () => setScrollLock({ lock: true }))
      if (WAKE_RELAUNCH) guard('открытие', () => setWakeUpRelaunch({ relaunch: true }))
      L = guard('раскладка', () => lay.pageLayout(DOWN, SHIFT_X, BOTTOM_TRIM))
      if (!L) return
      const saved = col.loadColors(sget('c3', ''))   // 'c3': цвета в новом (зеркальном) порядке; прежний ключ 'c' не читается
      okAt = +sget('okAt', 0) || 0
      phoneTs = +sget('pTs', 0) || 0

      // чёрный фон на весь экран: нажатие — обновить, долгое нажатие — диагностика
      guard('фон', () => {
        createWidget(widget.BUTTON, {
          x: 0, y: 0, w: lay.SCREEN_W, h: 514, text: '', normal_color: BLACK, press_color: BLACK, radius: 0,
          click_func: () => { guard('обновить', () => me.refresh(true)) },
          longpress_func: () => { guard('диагностика', showDiag) }
        })
      })

      // восемь полосок по три сегмента: две горизонтальные и шесть вертикальных (сначала серые, ниже сразу красятся сохранёнными цветами)
      rects = []
      for (let r = 0; r < col.ROWS; r++) {
        const row = []
        for (let k = 0; k < col.COLS; k++) {
          const c = L.cells[r][k]
          const w = guard('полоска ' + r + '/' + k, () => createWidget(widget.FILL_RECT, { x: c.x, y: c.y, w: c.w, h: c.h, color: col.GRAY }))
          row.push(w)
        }
        rects.push(row)
      }
      // подписи — эмодзи 36 px над вертикальными полосками слева направо: 🏠 🤖 📖 🧬 💀 🩸 (картинки e0..e5)
      for (let k = 0; k < lay.LABELED; k++) {
        const e = L.emoji[k]
        guard('эмодзи ' + k, () => createWidget(widget.IMG, { x: e.x, y: e.y, w: e.size, h: e.size, src: 'e' + k + '.png' }))
      }
      // диагностика (скрыта)
      guard('диагностика', () => {
        diagBg = createWidget(widget.FILL_RECT, { x: 16, y: 120, w: 400, h: 350, color: 0x202020 })
        diagTx = createWidget(widget.TEXT, {
          x: 28, y: 130, w: 376, h: 330, color: WHITE, text_size: 18,
          align_h: align.LEFT, align_v: align.TOP, text_style: text_style.WRAP, text: ''
        })
        setVisible(diagBg, false)
        setVisible(diagTx, false)
      })

      colors = null
      paint(saved)
      if (okAt) publish(saved, okAt)   // что было сохранено — сразу и циферблату (на случай, если он давно ничего не получал)
      this.refresh(true)
      try { timer = setInterval(() => { guard('обновление', () => me.refresh(false)) }, REFRESH_MS) } catch (e) { /* только при открытии */ }
    },

    onDestroy() {
      try { if (timer) { clearInterval(timer); timer = null } } catch (e) { /* ок */ }
      try { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null } } catch (e) { /* ок */ }
      try { if (diagTimer) { clearTimeout(diagTimer); diagTimer = null } } catch (e) { /* ок */ }
    },

    /** Спросить у телефона цвета. force — повторять, даже если прошлый запрос ещё в пути, но не чаще чем раз в 3 секунды. */
    refresh(force) {
      const now = Date.now()
      if (busy && now - busyAt < (force ? 3000 : 20000)) return
      busy = true
      busyAt = now
      asked++
      this.request({ method: 'u613.send', params: { t: 'stat' } })
        .then((res) => {
          busy = false
          if (!res || !res.ok) { this.failed(res && res.error ? 'нет связи: ' + String(res.error).slice(0, 80) : 'нет связи с телефоном'); return }
          const r = col.parseReply(res.reply)
          if (!r.colors) { this.failed(r.err); return }
          okCount++
          pingOk = 1
          pingErr = ''
          okAt = Date.now()
          phoneTs = r.ts
          lastErr = ''
          retryN = 0
          paint(r.colors)
          publish(r.colors, okAt)
          sset('c3', JSON.stringify(r.colors))
          sset('okAt', String(okAt))
          sset('pTs', String(phoneTs))
        })
        .catch((e) => { busy = false; this.failed('запрос не вышел: ' + String(e).slice(0, 80)) })
    },

    /** Запрос не удался: запомнить причину, проверить связь с LuvU613 (ping), повторить через несколько секунд (потом — по обычному расписанию). */
    failed(msg) {
      lastErr = msg
      this.probe()
      if (AUTO_DIAG && !autoShown) { autoShown = true; guard('диагностика', showDiag) }
      if (retryN >= RETRY_MS.length) return
      const wait = RETRY_MS[retryN++]
      try { if (retryTimer) clearTimeout(retryTimer) } catch (e) { /* ок */ }
      try { retryTimer = setTimeout(() => { retryTimer = null; guard('повтор', () => me.refresh(false)) }, wait) } catch (e) { /* без повтора */ }
    },

    /** Проверка связи: ping обязан отвечать любая версия LuvU613 (ответ pong). Различает «нет связи вообще» и «связь есть, но «stat» не работает». */
    probe() {
      if (pinging) return
      pinging = true
      this.request({ method: 'u613.send', params: { t: 'ping' } })
        .then((res) => {
          pinging = false
          if (res && res.ok && res.reply && res.reply.t === 'pong') { pingOk = 1; pingErr = ''; if (diagTimer) guard('диагностика', showDiag); return }
          pingOk = -1
          pingErr = res && res.error ? String(res.error).slice(0, 80) : 'ответ не pong: ' + String(res && res.reply ? JSON.stringify(res.reply).slice(0, 60) : 'пусто')
          if (diagTimer) guard('диагностика', showDiag)
        })
        .catch((e) => { pinging = false; pingOk = -1; pingErr = 'запрос не вышел: ' + String(e).slice(0, 60); if (diagTimer) guard('диагностика', showDiag) })
    }
  })
)
