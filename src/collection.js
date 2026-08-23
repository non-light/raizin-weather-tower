import { TITLES } from './titles.js'

const KEY = 'raizin-weather-tower.titles.v1'

/**
 * 称号の獲得履歴。
 * マスターデータ（titles.js）とは分けて、ここだけが localStorage を触る。
 * localStorage が使えない環境でも、メモリ上の記録でゲームは動き続ける。
 */
let cache = null
let storageOk = true

function load() {
  if (cache) return cache
  cache = {}
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') cache = parsed
    }
  } catch {
    storageOk = false
  }
  return cache
}

function save() {
  if (!storageOk) return
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // 保存できなくてもゲームは続ける
    storageOk = false
  }
}

/** 称号を獲得済みにする。初獲得なら true を返す */
export function unlock(id) {
  const data = load()
  const entry = data[id]
  if (entry && entry.unlocked) {
    entry.count = (entry.count || 1) + 1
    save()
    return false
  }
  data[id] = { id, unlocked: true, unlockedAt: new Date().toISOString(), count: 1 }
  save()
  return true
}

export function getEntry(id) {
  return load()[id] || null
}

export function isUnlocked(id) {
  const e = load()[id]
  return !!(e && e.unlocked)
}

export function unlockedCount() {
  return TITLES.filter((t) => isUnlocked(t.id)).length
}

export function resetAll() {
  cache = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    storageOk = false
  }
}

/** 図鑑に並べるための一覧（マスターデータ + 獲得状態） */
export function listAll() {
  return TITLES.map((t) => {
    const e = getEntry(t.id)
    return {
      title: t,
      unlocked: !!(e && e.unlocked),
      unlockedAt: e ? e.unlockedAt : null,
      count: e ? e.count : 0,
    }
  })
}

/** 保存できているかどうか（図鑑での注意表示に使う） */
export const storageAvailable = () => storageOk
