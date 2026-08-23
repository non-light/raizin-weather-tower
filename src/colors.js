import * as THREE from 'three'

/** ブロックの木の地色。各色はこれと混ぜて「色付きの木製ブロック」にする */
const WOOD = 0xc99a52
/** 0 = 完全に色そのまま / 1 = 完全に木の色 */
const WOOD_MIX = 0.28

export const COLORS = [
  { key: 'RED',    label: '赤', emoji: '🔴', hex: 0xd94a3d, css: '#d94a3d', line: '赤を抜くんだぞ！' },
  { key: 'BLUE',   label: '青', emoji: '🔵', hex: 0x3f8cf0, css: '#3f8cf0', line: '青だ！ いけるか？' },
  { key: 'YELLOW', label: '黄', emoji: '🟡', hex: 0xe8c13c, css: '#e8c13c', line: '黄色を探せ〜！' },
  { key: 'GREEN',  label: '緑', emoji: '🟢', hex: 0x4cba63, css: '#4cba63', line: 'みどり！ そーっとな！' },
  { key: 'PURPLE', label: '紫', emoji: '🟣', hex: 0xa661e8, css: '#a661e8', line: 'むらさきだ！ どこかな？' },
]

/** その色のブロックが実際に使うマテリアル色（木と混ぜたもの） */
export function woodTint(color, shade = 1) {
  return new THREE.Color(color.hex)
    .lerp(new THREE.Color(WOOD), WOOD_MIX)
    .multiplyScalar(shade)
}

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
