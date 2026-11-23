import assert from 'node:assert'
import * as lay from '../shared/layout.js'

let n = 0
function t(name, f) { f(); n++; console.log('ok  ' + name) }

const S = lay.specLayout(0, 0)        // без сдвига и без обрезки: как в описании
const D = lay.specLayout(-18, 30)     // как в приложении: влево на 18 (x = 8…388, как в «Таймере»), низ выше на 30

t('верхние две полоски: y = 48 и 102, высота 36, три сегмента 125/125/124 с зазором 3 от x = 26 до 406', () => {
  assert.deepEqual(S.cells[0].map((c) => c.y), [48, 48, 48])
  assert.deepEqual(S.cells[1].map((c) => c.y), [102, 102, 102])
  assert.deepEqual(S.cells[0].map((c) => c.h), [36, 36, 36])
  assert.deepEqual(S.cells[0].map((c) => c.w), [125, 125, 124])
  assert.equal(S.cells[0][0].x, 26)
  assert.equal(S.cells[0][2].x + S.cells[0][2].w, 406)
  assert.equal(S.cells[0][1].x - (S.cells[0][0].x + S.cells[0][0].w), 3)
})

t('верхние полоски не двигаются по вертикали от обрезки низа, а по горизонтали уходят на 18 влево', () => {
  assert.deepEqual(D.cells[0].map((c) => c.y), [48, 48, 48])
  assert.deepEqual(D.cells[1].map((c) => c.y), [102, 102, 102])
  assert.equal(D.cells[0][0].x, 8)
  assert.equal(D.cells[0][2].x + D.cells[0][2].w, 388)
})

t('эмодзи: шесть штук, 36 px, в одной строке: верх на 14 px ниже полоски 2', () => {
  assert.equal(S.emoji.length, 6)
  for (const e of S.emoji) {
    assert.equal(e.size, 36)
    assert.equal(e.y, 138 + 14)
  }
})

t('вертикальные полоски: ширина 39, верх на 6 px ниже эмодзи, три сегмента сверху вниз с зазором 3', () => {
  assert.equal(S.cells.length, 8)
  for (let r = 2; r < 8; r++) {
    const row = S.cells[r]
    assert.equal(row.length, 3)
    for (const c of row) assert.equal(c.w, 39)
    assert.equal(row[0].y, 152 + 36 + 6)
    assert.equal(row[1].y - (row[0].y + row[0].h), 3)
    assert.equal(row[2].y - (row[1].y + row[1].h), 3)
  }
})

t('без обрезки низ вертикальных полосок 494 (снизу 20 px); с обрезкой 30 — 464, сегменты по 88', () => {
  assert.equal(lay.specBottom(0), 494)
  assert.equal(lay.specBottom(30), 464)
  assert.equal(lay.specBottom(), 464)
  assert.deepEqual(D.cells[2].map((c) => c.h), [88, 88, 88])
  assert.equal(D.cells[2][0].y, 194)
})

t('вертикальные полоски равномерно: первая у левого края, последняя у правого края полосок 1 и 2; эмодзи по центру над своей', () => {
  assert.equal(S.cells[2][0].x, 26)
  assert.equal(S.cells[7][0].x + S.cells[7][0].w, 406)
  for (let i = 0; i < 6; i++) {
    const c = S.cells[2 + i][0]
    assert.ok(Math.abs(S.emoji[i].x + 18 - (c.x + c.w / 2)) <= 0.5)
  }
  const xs = S.cells.slice(2).map((r) => r[0].x)
  for (let i = 1; i < 6; i++) assert.ok(xs[i] - xs[i - 1] >= 68 && xs[i] - xs[i - 1] <= 69)
})

t('сдвиг на 18 влево: вся картинка x от 8 до 388 (как сетка «Таймера») вместо 26…406, вертикальные полоски сдвинуты так же', () => {
  for (let r = 0; r < 8; r++) for (let k = 0; k < 3; k++) assert.equal(S.cells[r][k].x - D.cells[r][k].x, 18)
  for (let i = 0; i < 6; i++) assert.equal(S.emoji[i].x - D.emoji[i].x, 18)
})

t('на странице: тот же сдвиг по вертикали, что в «Таймере» (DOWN = 33, подъём на 31 px)', () => {
  const p = lay.pageLayout(33, -18, 30)
  assert.equal(p.top, 17)
  assert.deepEqual(p.cells[0].map((c) => c.y), [17, 17, 17])
  assert.deepEqual(p.cells[1].map((c) => c.y), [71, 71, 71])
  assert.equal(p.emoji[0].y, 121)
  assert.equal(p.cells[2][0].y, 163)
  assert.equal(p.bottom, 433)
})

t('DOWN = 64 — без подъёма (как в описании), DOWN = 16 — максимальный подъём без ухода выше страницы', () => {
  assert.equal(lay.pageLayout(64).cells[0][0].y, 48)
  assert.equal(lay.pageLayout(16).cells[0][0].y, 0)
})

console.log(n + ' проверок пройдено')
