// マスコット画像。差し替えるときは assets/raizin.png を置き換えるだけでよい
import raizinUrl from '../assets/raizin.png'
import { COLORS } from './colors.js'

/** 成功したときに雷神が言うセリフ */
/** 吹き出しの最低表示時間。これより短い指定でも必ずこれだけは出す */
const MIN_BUBBLE_MS = 1800

export const SUCCESS_LINES = [
  'いい感じ！',
  'やった〜！',
  'いい調子…！',
  'うまくいった〜',
]

export class UI {
  constructor() {
    this.score = document.getElementById('score')
    this.badge = document.getElementById('weather-badge')
    this.colorBadge = document.getElementById('color-badge')
    this.flash = document.getElementById('weather-flash')
    this.flashMain = document.getElementById('weather-flash-main')
    this.flashSub = document.getElementById('weather-flash-sub')
    this.prompt = document.getElementById('prompt')
    this.bubble = document.getElementById('bubble')
    this.bubbleText = document.getElementById('bubble-text')
    this.mascotArt = document.getElementById('mascot-art')
    this.titleScreen = document.getElementById('title-screen')
    this.tsBubble = document.getElementById('ts-bubble')
    this.tsBubbleText = document.getElementById('ts-bubble-text')
    this.tsStart = document.getElementById('ts-start')

    // サイトのトップ（ゲーム一覧）は、このページの1つ上の階層。
    // 公開時は /raizin-tower/ の下にいるので、戻り先は / になる
    const base = import.meta.env.BASE_URL || '/'
    document.getElementById('ts-home').href = base.replace(/[^/]+\/$/, '') || '/'
    this.specialFlash = document.getElementById('special-flash')
    this.sfMain = document.getElementById('sf-main')
    this.sfSub = document.getElementById('sf-sub')
    this.fxFlash = document.getElementById('fx-flash')
    this.fxSparkles = document.getElementById('fx-sparkles')
    this.scene = document.getElementById('scene')
    this.colorChoice = document.getElementById('color-choice')
    this.ccButtons = document.getElementById('cc-buttons')
    this.gameover = document.getElementById('gameover')
    this.finalScore = document.getElementById('final-score')
    this.finalBlocks = document.getElementById('final-blocks')
    this.finalWeather = document.getElementById('final-weather')
    this.finalStorms = document.getElementById('final-storms')
    this.titleReveal = document.getElementById('title-reveal')
    this.trNew = document.getElementById('tr-new')
    this.trName = document.getElementById('tr-name')
    this.trRarity = document.getElementById('tr-rarity')
    this.trNewHint = document.getElementById('tr-newhint')
    this.goBook = document.getElementById('go-book')
    this.tsBook = document.getElementById('ts-book')
    this.retryBtn = document.getElementById('retry')

    const img = document.getElementById('raizin-img')
    const fallback = document.getElementById('raizin-fallback')
    img.addEventListener('error', () => {
      img.style.display = 'none'
      fallback.style.display = 'flex'
    })
    img.src = raizinUrl

    const tsImg = document.getElementById('ts-img')
    const tsFallback = document.getElementById('ts-fallback')
    tsImg.addEventListener('error', () => {
      tsImg.style.display = 'none'
      tsFallback.style.display = 'flex'
    })
    tsImg.src = raizinUrl

    this._bubbleTimer = null
    this._flashTimer = null
    this._badgeTimer = null
  }

  /* ---------------- タイトル画面 ---------------- */

  /** 雷神が2言しゃべってからボタンを見せる */
  showTitle() {
    document.body.classList.add('title-mode')
    this.titleScreen.classList.remove('hiding', 'gone')
    this.tsBubble.classList.remove('show')

    clearTimeout(this._tsTimer1)
    clearTimeout(this._tsTimer2)
    clearTimeout(this._tsTimer3)
    const lines = [
      '雷神のタワーへ、ようこそ！',
      '今日は、どんな天気になるかな…',
      'そーっと抜いて、上にのせてみよう！',
    ]
    this._tsTimer1 = setTimeout(() => {
      this.tsBubbleText.textContent = lines[0]
      this.tsBubble.classList.add('show')
    }, 350)
    this._tsTimer2 = setTimeout(() => { this.tsBubbleText.textContent = lines[1] }, 2400)
    this._tsTimer3 = setTimeout(() => { this.tsBubbleText.textContent = lines[2] }, 4600)
  }

  hideTitle() {
    clearTimeout(this._tsTimer1)
    clearTimeout(this._tsTimer2)
    clearTimeout(this._tsTimer3)
    this.titleScreen.classList.add('hiding')
    document.body.classList.remove('title-mode')
    clearTimeout(this._tsHideTimer)
    this._tsHideTimer = setTimeout(() => this.titleScreen.classList.add('gone'), 600)
  }

  onStart(cb) { this.tsStart.addEventListener('click', cb) }

  setScore(n) {
    this.score.textContent = 'SCORE: ' + String(n).padStart(4, '0')
  }

  setWeather(w) {
    this.badge.textContent = `天候：${w.icon} ${w.label}`
    this.badge.dataset.weather = w.key
    // 切り替わったことが分かるように、小さい表示も一度跳ねさせる
    this.badge.classList.remove('pop')
    void this.badge.offsetWidth
    this.badge.classList.add('pop')
    clearTimeout(this._badgeTimer)
    this._badgeTimer = setTimeout(() => this.badge.classList.remove('pop'), 900)
  }

  /**
   * このターンの条件表示。次のターンまで出しっぱなしにする。
   *   指定：🔴 赤 / 指定：⚡ 🔴 赤 / 指定：🌈 FREE / 指定：⬛ 下3段
   */
  setRule(text, css) {
    this.colorBadge.textContent = `指定：${text}`
    this.colorBadge.style.borderColor = css || ''
    this.colorBadge.style.color = css || ''
    if (text === '—') return
    this.colorBadge.classList.remove('pop')
    void this.colorBadge.offsetWidth
    this.colorBadge.classList.add('pop')
    clearTimeout(this._colorTimer)
    this._colorTimer = setTimeout(() => this.colorBadge.classList.remove('pop'), 900)
  }

  /* ---------------- 特殊マスの演出 ---------------- */

  /** 中央に大きく表示。kind は RAIZIN / RAINBOW / DANGER */
  flashSpecial(slot, ms = 1900) {
    this.sfMain.textContent = slot.title
    this.sfSub.textContent = slot.subtitle
    this.specialFlash.dataset.kind = slot.key
    this.specialFlash.classList.remove('show')
    void this.specialFlash.offsetWidth
    this.specialFlash.classList.add('show')
    clearTimeout(this._sfTimer)
    this._sfTimer = setTimeout(() => this.specialFlash.classList.remove('show'), ms)
  }

  /** 画面のフラッシュ・粒子・ゆれ */
  playEffect(kind) {
    this.fxFlash.className = ''
    this.scene.classList.remove('shake-soft', 'shake-dark')
    void this.fxFlash.offsetWidth

    if (kind === 'RAIZIN') {
      this.fxFlash.classList.add('raizin')
      this.scene.classList.add('shake-soft')
    } else if (kind === 'RAINBOW') {
      this.fxFlash.classList.add('rainbow')
      this.spawnSparkles()
    } else if (kind === 'DANGER') {
      this.fxFlash.classList.add('danger')
      this.scene.classList.add('shake-dark')
    }

    clearTimeout(this._fxTimer)
    this._fxTimer = setTimeout(() => {
      this.fxFlash.className = ''
      this.scene.classList.remove('shake-soft', 'shake-dark')
    }, 1000)
  }

  spawnSparkles(count = 26) {
    this.fxSparkles.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div')
      s.className = 'sparkle'
      s.style.left = `${8 + Math.random() * 84}%`
      s.style.top = `${25 + Math.random() * 55}%`
      s.style.background = COLORS[i % COLORS.length].css
      s.style.animationDelay = `${Math.random() * 0.35}s`
      this.fxSparkles.appendChild(s)
    }
    clearTimeout(this._sparkTimer)
    this._sparkTimer = setTimeout(() => { this.fxSparkles.innerHTML = '' }, 1500)
  }

  /* ---------------- ⚡ の色えらび ---------------- */

  /**
   * 5色のボタンを出す。enabledKeys に無い色は押せない
   * （その色のブロックが1本も抜けないとゲームが詰まるため）
   */
  showColorChoice(enabledKeys, onPick) {
    this.ccButtons.innerHTML = ''
    for (const c of COLORS) {
      const btn = document.createElement('button')
      btn.className = 'cc-btn'
      btn.textContent = c.label
      btn.style.background = c.css
      btn.disabled = !enabledKeys.includes(c.key)
      btn.addEventListener('click', () => {
        this.hideColorChoice()
        onPick(c)
      })
      this.ccButtons.appendChild(btn)
    }
    this.colorChoice.classList.add('show')
  }

  hideColorChoice() { this.colorChoice.classList.remove('show') }

  /** 天候切り替え時に画面中央へ大きく表示 → 1.8秒後に消えて小さい表示だけ残る */
  flashWeather(w) {
    this.flashMain.textContent = `${w.icon} ${w.key}`
    this.flashSub.textContent = w.label
    this.flash.dataset.weather = w.key
    this.flash.classList.remove('show')
    void this.flash.offsetWidth
    this.flash.classList.add('show')
    clearTimeout(this._flashTimer)
    this._flashTimer = setTimeout(() => this.flash.classList.remove('show'), 1800)
  }

  /** 画面下中央の操作ガイド */
  setPrompt(text) {
    this.prompt.textContent = text || ''
    this.prompt.classList.toggle('show', !!text)
  }

  /** 雷神のふきだし。短いセリフでも読めるよう最低表示時間を確保する */
  say(text, ms = 2600) {
    ms = Math.max(ms, MIN_BUBBLE_MS)
    clearTimeout(this._bubbleTimer)
    clearTimeout(this._seqTimer)
    this.bubbleText.textContent = text
    this.bubble.classList.add('show')
    this._bubbleTimer = setTimeout(() => this.bubble.classList.remove('show'), ms)
  }

  /** 続けて何回かしゃべる（「お、雷神だ！」→「好きな色、えらんでいいよ〜」など） */
  saySequence(lines, hold = 1800) {
    hold = Math.max(hold, MIN_BUBBLE_MS)
    clearTimeout(this._bubbleTimer)
    clearTimeout(this._seqTimer)
    const step = (i) => {
      if (i >= lines.length) {
        this.bubble.classList.remove('show')
        return
      }
      this.bubbleText.textContent = lines[i]
      this.bubble.classList.add('show')
      this._seqTimer = setTimeout(() => step(i + 1), hold)
    }
    step(0)
  }

  /** 風のあいだ、雷神をゆらゆらさせる */
  setWindy(on) {
    this.mascotArt.classList.toggle('windy', !!on)
  }

  showGameOver({ score, blocks, weather, storms }) {
    this.finalScore.textContent = 'SCORE：' + String(score).padStart(4, '0')
    this.finalBlocks.textContent = `${blocks}本`
    this.finalWeather.textContent = `${weather.icon} ${weather.label}`
    this.finalStorms.textContent = `${storms}回`
    // 崩れたタワーを残したまま、ゆっくり浮かび上がらせる
    this.gameover.classList.add('show')
    void this.gameover.offsetWidth
    this.gameover.classList.add('visible')
  }

  /**
   * 「今回の称号は…」→ 少し間をあけて称号名。
   * レア度が高いほど演出を足す（読みにくくならない範囲で）
   */
  revealTitle(title, isNew, onRevealed) {
    this.titleReveal.classList.remove('revealed')
    this.trNewHint.classList.toggle('show', !!isNew)
    this.goBook.classList.toggle('has-new', !!isNew)
    this.titleReveal.dataset.rarity = title.rarity.key
    this.trName.textContent = title.name
    this.trRarity.textContent = title.rarity.key === 'LEGENDARY'
      ? '⚡ LEGENDARY ⚡'
      : title.rarity.label
    this.trNew.classList.toggle('show', !!isNew)

    clearTimeout(this._trTimer)
    this._trTimer = setTimeout(() => {
      this.titleReveal.classList.add('revealed')
      if (title.rarity.rank >= 4) this.playEffect('RAIZIN')
      else if (title.rarity.rank === 3) this.playEffect('RAIZIN')
      else if (title.rarity.rank === 2) this.spawnSparkles(14)
      if (onRevealed) onRevealed()
    }, 1100)
  }

  onBook(cb) { this.tsBook.addEventListener('click', cb) }
  hideGameOver() { this.gameover.classList.remove('show', 'visible') }

  onRetry(cb) { this.retryBtn.addEventListener('click', cb) }
  onGameOverBook(cb) { this.goBook.addEventListener('click', cb) }
}
