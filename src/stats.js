import { LEVELS } from './tower.js'

/**
 * 称号判定に使うプレイ統計。
 * ゲーム中に少しずつ積んでいき、GAME OVER のときにまとめて評価する。
 */
export function createStats() {
  return {
    startedAt: 0,
    durationSec: 0,

    turns: 0,          // 成功したターン数
    score: 0,
    blocksPlaced: 0,   // 積み直したブロック数
    maxLevel: LEVELS,  // 最高到達段数

    spins: 0,          // ルーレットを回した回数

    // 天候：遭遇した回数と、そのターンを成功した回数
    weatherSeen: { CLEAR: 0, FOG: 0, WIND: 0, STORM: 0 },
    weatherTurns: { CLEAR: 0, FOG: 0, WIND: 0, STORM: 0 },
    denseFogTurns: 0,  // 濃い霧のまま成功した回数

    // ルーレット：引いた回数と、そのターンを成功した回数
    slotSeen: { RED: 0, BLUE: 0, YELLOW: 0, GREEN: 0, PURPLE: 0, RAIZIN: 0, RAINBOW: 0, DANGER: 0 },
    slotCleared: { RED: 0, BLUE: 0, YELLOW: 0, GREEN: 0, PURPLE: 0, RAIZIN: 0, RAINBOW: 0, DANGER: 0 },
    colorHistory: [],  // 通常色の結果履歴

    dangerShakes: 0,   // 危険な揺れが発生した回数
    recoveries: 0,     // 大きく揺れた状態から立て直した回数
    finalShake: 0,     // 最後にどれくらい派手に崩れたか
  }
}

/* ---------- 判定でよく使う派生値 ---------- */

export const fogTurns = (s) => s.weatherTurns.FOG
export const windTurns = (s) => s.weatherTurns.WIND
export const stormTurns = (s) => s.weatherTurns.STORM
export const hardTurns = (s) => s.weatherTurns.FOG + s.weatherTurns.WIND + s.weatherTurns.STORM
export const roughSeen = (s) => s.weatherSeen.FOG + s.weatherSeen.WIND + s.weatherSeen.STORM
export const specialSeen = (s) => s.slotSeen.RAIZIN + s.slotSeen.RAINBOW
/** 何色ぶんクリアしたか（0〜5） */
export const distinctColors = (s) =>
  ['RED', 'BLUE', 'YELLOW', 'GREEN', 'PURPLE'].filter((k) => s.slotCleared[k] > 0).length
/** 全ターンのうち、その天候が占めた割合 */
export const ratio = (n, s) => (s.turns > 0 ? n / s.turns : 0)
