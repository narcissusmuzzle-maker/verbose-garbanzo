/**
 * U613 Stat — страница БЫСТРОГО ОБНОВЛЕНИЯ. Её открывает циферблат обычным нажатием на две верхние полоски: страница на долю секунды показывает те же
 * две полоски, спрашивает у телефона цвета, записывает их в общее хранилище (откуда их читает циферблат) и сама закрывается — часы возвращаются на циферблат.
 * Чёрный экран, только две верхние полоски на тех же местах, что в приложении; никаких кнопок и текста (текст — только если телефон не ответил).
 * Долгое нажатие на полоски открывает обычное приложение (page/index.js).
 */
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { setScrollLock } from '@zos/page'
import { LocalStorage } from '@zos/storage'
import * as share from '@zos/share-storage'
import * as stor from '@zos/storage'
import * as router from '@zos/router'
import * as lay from '../shared/layout'
import * as col from '../shared/colors'
import * as shr from '../shared/share'
import * as cfg from '../shared/config'

const LINGER_MS = 250        // сколько после новой картины держать экран, прежде чем закрыться
const RETRY_MS = 1500        // если телефон не ответил — один повтор через столько
const GIVE_UP_MS = 5000      // если за столько ответа так и нет — показать причину
const FAIL_MS = 20000        // сколько держится причина, если запись для циферблата не подтвердилась
const ERR_MS = 2500          // сколько держится причина перед закрытием
const HARD_CLOSE_MS = 30000  // в любом случае закрыться не позже чем через столько

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

let rects = []       // шесть сегментов: сначала полоска 0, потом полоска 1
let cells = []
let shown = []
let me = null
let done = false
let asked = 0
let retried = false
let closing = false

function paintSix(six) {
  for (let i = 0; i < 6; i++) {
    if (shown[i] === six[i]) continue
    const c = cells[i]
    try { rects[i].setProperty(prop.MORE, { x: c.x, y: c.y, w: c.w, h: c.h, color: six[i] }) } catch (e) { /* не критично */ }
  }
  shown = six.slice()
}

/** Закрыть приложение: назад (возврат на циферблат); если не закрылось — на главный экран; потом выход. Если приложение уже закрылось, таймеры не сработают. */
function closeApp() {
  if (closing) return
  closing = true
  try { if (typeof router.back === 'function') router.back() } catch (e) { /* дальше запасные */ }
  try { setTimeout(() => { try { if (typeof router.home === 'function') router.home() } catch (e) { /* ок */ } }, 700) } catch (e) { /* ок */ }
  try { setTimeout(() => { try { if (typeof router.exit === 'function') router.exit() } catch (e) { /* ок */ } }, 1400) } catch (e) { /* ок */ }
}

function showError(msg, size, len) {
  try {
    createWidget(widget.TEXT, {
      x: 8, y: cells[5].y + cells[5].h + 12, w: 380, h: 330, color: 0xff4517, text_size: size || 20,
      align_h: align.LEFT, align_v: align.TOP, text_style: text_style.WRAP, text: String(msg).slice(0, len || 90)
    })
  } catch (e) { /* показать нечем */ }
}

Page(
  BasePage({
    onInit() {
      try { ls = new LocalStorage() } catch (e) { /* без хранилища — серые */ }
      try { setStatusBarVisible(false) } catch (e) { /* ок */ }
    },

    build() {
      me = this
      done = false; retried = false; closing = false; asked = 0   // новое открытие — всё с нуля
      try { setScrollLock({ lock: true }) } catch (e) { /* ок */ }
      const L = lay.pageLayout(cfg.DOWN, cfg.SHIFT_X, cfg.BOTTOM_TRIM)
      createWidget(widget.FILL_RECT, { x: 0, y: 0, w: lay.SCREEN_W, h: 514, color: 0x000000 })
      cells = L.cells[0].concat(L.cells[1])
      const saved = col.loadColors(sget('c3', ''))
      const six = shr.topSix(saved) || col.emptyColors().slice(0, 2).reduce((a, r) => a.concat(r), [])
      rects = cells.map((c, i) => createWidget(widget.FILL_RECT, { x: c.x, y: c.y, w: c.w, h: c.h, color: six[i] }))
      shown = six.slice()
      try { setTimeout(() => { if (!done) { showError('телефон не ответил'); setTimeout(closeApp, ERR_MS) } }, GIVE_UP_MS) } catch (e) { /* ок */ }
      try { setTimeout(closeApp, HARD_CLOSE_MS) } catch (e) { /* ок */ }
      this.ask()
    },

    ask() {
      asked++
      this.request({ method: 'u613.send', params: { t: 'stat' } })
        .then((res) => {
          if (done) return
          const r = res && res.ok ? col.parseReply(res.reply) : null
          if (!r || !r.colors) { this.retry(); return }
          done = true
          sset('c3', JSON.stringify(r.colors))
          sset('okAt', String(Date.now()))
          sset('pTs', String(r.ts))
          const six = shr.topSix(r.colors)
          paintSix(six)
          const w = shr.writeTop({ ss: share, st: stor }, six, Date.now())
          sset('shr', shr.describe(w))
          if (w.verified) { try { setTimeout(closeApp, LINGER_MS) } catch (e) { closeApp() } }
          else {
            // запись для циферблата не подтвердилась: показать причину на экране подольше (иначе циферблат после возврата покажет старое и непонятно почему)
            showError(shr.describe(w), 18, 380)
            try { setTimeout(closeApp, FAIL_MS) } catch (e) { closeApp() }
          }
        })
        .catch(() => { if (!done) this.retry() })
    },

    retry() {
      if (retried) return
      retried = true
      try { setTimeout(() => { if (!done) me.ask() }, RETRY_MS) } catch (e) { /* дождёмся GIVE_UP_MS */ }
    },

    onDestroy() {}
  })
)
