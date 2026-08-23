import raizinUrl from '../assets/raizin.png'
import { TITLES, CATEGORY_LABEL } from './titles.js'
import { listAll, unlockedCount, resetAll, storageAvailable } from './collection.js'

const TABS = [
  { key: 'ALL', label: 'すべて' },
  { key: 'ROOKIE', label: '初心者' },
  { key: 'STEADY', label: '安定' },
  { key: 'FOG', label: '霧' },
  { key: 'WIND', label: '風' },
  { key: 'STORM', label: '嵐' },
  { key: 'ROULETTE', label: 'ルーレット' },
  { key: 'MASTER', label: '高スコア' },
]

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 獲得`
}

/** 称号図鑑の画面。ゲーム本体とは独立していて、開いている間はゲームは動かない */
export class Book {
  constructor(onBack) {
    this.root = document.getElementById('book')
    this.grid = document.getElementById('book-grid')
    this.tabsEl = document.getElementById('book-tabs')
    this.countEl = document.getElementById('book-count')
    this.pctEl = document.getElementById('book-pct')
    this.completeEl = document.getElementById('book-complete')
    this.noteEl = document.getElementById('book-note')
    this.bubbleText = document.getElementById('book-bubble-text')
    this.confirm = document.getElementById('book-confirm')
    this.filter = 'ALL'
    this.opened = false
    /** 今回のプレイで獲得した称号（図鑑で目立たせる） */
    this.justEarnedId = null
    this.replayBtn = document.getElementById('book-replay')

    document.getElementById('book-img').src = raizinUrl
    document.getElementById('book-back').addEventListener('click', onBack)
    document.getElementById('book-reset').addEventListener('click', () => {
      this.confirm.classList.add('show')
    })
    document.getElementById('bc-cancel').addEventListener('click', () => {
      this.confirm.classList.remove('show')
    })
    document.getElementById('bc-ok').addEventListener('click', () => {
      resetAll()
      this.confirm.classList.remove('show')
      this.render()
    })

    this.buildTabs()
  }

  buildTabs() {
    this.tabsEl.innerHTML = ''
    for (const t of TABS) {
      const b = document.createElement('button')
      b.className = 'book-tab' + (t.key === this.filter ? ' on' : '')
      b.textContent = t.label
      b.addEventListener('click', () => {
        this.filter = t.key
        this.buildTabs()
        this.render()
      })
      this.tabsEl.appendChild(b)
    }
  }

  /**
   * @param {object} opts
   *   justEarnedId … 今回獲得した称号。カードを強調して自動スクロールする
   *   showReplay   … GAME OVER から来たときは「もう一度遊ぶ」も出す
   */
  show(opts = {}) {
    this.justEarnedId = opts.justEarnedId || null
    this.replayBtn.classList.toggle('show', !!opts.showReplay)
    // 今回の称号が別カテゴリだと見つからないので、一覧に戻しておく
    if (this.justEarnedId) {
      this.filter = 'ALL'
      this.buildTabs()
    }
    this.root.classList.add('show')
    this.render()
    this.opened = true

    if (this.justEarnedId) {
      const card = this.grid.querySelector('.just-earned')
      if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  onReplay(cb) { this.replayBtn.addEventListener('click', cb) }

  hide() {
    this.root.classList.remove('show')
    this.confirm.classList.remove('show')
  }

  /** 集まり具合で雷神のひとことを変える */
  mascotLine(n, total) {
    if (this.justEarnedId) return '新しいの、増えた〜！'
    if (n >= total) return '全部そろった〜！すごい！'
    if (n >= 45) return 'あとちょっと…！'
    if (n >= total / 2) return 'おお…たくさん集まってきた！'
    if (!this.opened) return '集めた称号、ここで見られるよ〜'
    return 'まだまだ、いっぱいありそう！'
  }

  render() {
    const all = listAll()
    const n = unlockedCount()
    const total = TITLES.length
    const pct = Math.round((n / total) * 100)

    this.countEl.textContent = `獲得 ${n} / ${total}`
    this.pctEl.textContent = `${pct}% COMPLETE`
    this.completeEl.classList.toggle('show', n >= total)
    this.bubbleText.textContent = this.mascotLine(n, total)
    this.noteEl.textContent = storageAvailable()
      ? ''
      : '※ このブラウザでは保存できないので、閉じると記録が消えます'

    const rows = all.filter((r) => this.filter === 'ALL' || r.title.category === this.filter)
    this.grid.innerHTML = ''
    for (const r of rows) this.grid.appendChild(this.card(r))
  }

  card({ title, unlocked, unlockedAt, count }) {
    const justEarned = unlocked && title.id === this.justEarnedId
    const el = document.createElement('div')
    el.className = 'tcard' + (unlocked ? '' : ' locked') + (justEarned ? ' just-earned' : '')
    el.dataset.rarity = title.rarity.key

    const name = unlocked ? title.name : title.hiddenName
    const body = unlocked ? title.description : `ヒント：${title.hint}`
    const legend = title.rarity.key === 'LEGENDARY' ? '⚡ ' : ''

    el.innerHTML = `
      <div class="tcard-top">
        <span class="tcard-no">No.${String(title.number).padStart(2, '0')}</span>
        <span class="tcard-rarity">${title.rarity.label}</span>
      </div>
      <div class="tcard-name">${legend}${name}${justEarned ? '<span class="tcard-new">NEW</span>' : ''}</div>
      <div class="tcard-cat">カテゴリ：${CATEGORY_LABEL[title.category] || title.category}</div>
      <div class="tcard-body">${body}</div>
      ${unlocked && unlockedAt ? `<div class="tcard-date">${formatDate(unlockedAt)}${count > 1 ? `（${count}回）` : ''}</div>` : ''}
    `
    return el
  }
}
