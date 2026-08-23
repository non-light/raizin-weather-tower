import * as THREE from 'three'

/** ブロックの木の地色。各色はこれと混ぜて「色付きの木製ブロック」にする */
const WOOD = 0xc99a52
/** 0 = 完全に色そのまま / 1 = 完全に木の色 */
const WOOD_MIX = 0.28

export const COLORS = [
  { key: 'RED',    label: '赤', emoji: '🔴', hex: 0xd94a3d, css: '#d94a3d', line: '赤だ〜！' },
  { key: 'BLUE',   label: '青', emoji: '🔵', hex: 0x3f8cf0, css: '#3f8cf0', line: '青みたい！' },
  { key: 'YELLOW', label: '黄', emoji: '🟡', hex: 0xe8c13c, css: '#e8c13c', line: '黄色、みつけられるかな？' },
  { key: 'GREEN',  label: '緑', emoji: '🟢', hex: 0x4cba63, css: '#4cba63', line: '今日は緑！' },
  { key: 'PURPLE', label: '紫', emoji: '🟣', hex: 0xa661e8, css: '#a661e8', line: '紫だよ〜' },
]

/** その色のブロックが実際に使うマテリアル色（木と混ぜたもの） */
export function woodTint(color, shade = 1) {
  return new THREE.Color(color.hex)
    .lerp(new THREE.Color(WOOD), WOOD_MIX)
    .multiplyScalar(shade)
}

/* ------------------------------------------------------------------
 * ルーレットのマス
 * 通常の5色 + 特殊マス3種
 * ------------------------------------------------------------------ */
export const SLOT_TYPE = {
  COLOR: 'COLOR',
  RAIZIN: 'RAIZIN',
  RAINBOW: 'RAINBOW',
  DANGER: 'DANGER',
}

export const SPECIALS = [
  {
    type: SLOT_TYPE.RAIZIN,
    key: 'RAIZIN',
    emoji: '⚡',
    label: '雷神',
    wheelLabel: '雷神',
    css: '#ffd23f',
    textCss: '#241b00',
    title: '⚡ RAIZIN CHANCE！',
    subtitle: '好きな色をえらべる',
    lines: ['お、雷神だ！', '好きな色、えらんでいいよ〜'],
  },
  {
    type: SLOT_TYPE.RAINBOW,
    key: 'RAINBOW',
    emoji: '🌈',
    label: '虹',
    wheelLabel: '虹',
    css: '#ff8ad4',
    textCss: '#20122b',
    title: '🌈 RAINBOW！',
    subtitle: 'どの色でもOK',
    lines: ['わあ、虹だ！', '今日は、どれでも大丈夫みたい！'],
  },
  {
    type: SLOT_TYPE.DANGER,
    key: 'DANGER',
    emoji: '⬛',
    label: '黒',
    wheelLabel: '黒',
    css: '#15151d',
    textCss: '#ff5252',
    title: '⬛ DANGER',
    subtitle: '下3段しか抜けない',
    lines: ['むむ…黒だ…', '下のほうから、そーっといってみよう…'],
  },
]

/** ルーレットのマス（この順に円周へ並ぶ） */
export const SLOTS = [
  ...COLORS.map((c) => ({ ...c, type: SLOT_TYPE.COLOR, wheelLabel: c.label, textCss: '#0d1026' })),
  ...SPECIALS,
]

/* ------------------------------------------------------------------
 * 出現確率。調整はここだけ書き換えればよい。
 * 数字は「重み」で、合計に対する比率がそのまま出現確率になる。
 * 扇の角度も重みに比例するので、見た目と確率が一致する。
 * ------------------------------------------------------------------ */
export const SLOT_WEIGHTS = {
  RED: 1,
  BLUE: 1,
  YELLOW: 1,
  GREEN: 1,
  PURPLE: 1,
  RAIZIN: 1,
  RAINBOW: 1,
  DANGER: 1,
}

export const slotWeight = (slot) => SLOT_WEIGHTS[slot.key] ?? 1

/** ⬛ で抜けるのは下から何段までか */
export const DANGER_LEVELS = 3

/**
 * count 個ぶんの色を、各色の数が偏らないように配って混ぜる。
 * 36本なら 8,7,7,7,7 になる。
 */
export function balancedPalette(count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(COLORS[i % COLORS.length])
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
