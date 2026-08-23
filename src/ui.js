// マスコット画像。差し替えるときは assets/raizin.png を置き換えるだけでよい
import raizinUrl from '../assets/raizin.png'

/** 成功したときに雷神が言うセリフ */
export const SUCCESS_LINES = [
  'いい感じ！',
  'うまいうまい！',
  'その調子だぞ！',
  'こわくないこわくない！',
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
    this.gameover = document.getElementById('gameover')
    this.finalScore = document.getElementById('final-score')
    this.retryBtn = document.getElementById('retry')

    const img = document.getElementById('raizin-img')
    const fallback = document.getElementById('raizin-fallback')
    img.addEventListener('error', () => {
      img.style.display = 'none'
      fallback.style.display = 'flex'
    })
    img.src = raizinUrl

    this._bubbleTimer = null
    this._flashTimer = null
    this._badgeTimer = null
  }

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

  /** ルーレットで決まった指定色。次のターンまで出しっぱなしにする */
  setColor(color) {
    if (!color) {
      this.colorBadge.textContent = '指定色：—'
      this.colorBadge.style.borderColor = ''
      this.colorBadge.style.color = ''
      return
    }
    this.colorBadge.textContent = `指定色：${color.emoji} ${color.label}`
    this.colorBadge.style.borderColor = color.css
    this.colorBadge.style.color = color.css
    this.colorBadge.classList.remove('pop')
    void this.colorBadge.offsetWidth
    this.colorBadge.classList.add('pop')
    clearTimeout(this._colorTimer)
    this._colorTimer = setTimeout(() => this.colorBadge.classList.remove('pop'), 900)
  }

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

  /** 雷神のふきだし */
  say(text, ms = 2600) {
    this.bubbleText.textContent = text
    this.bubble.classList.add('show')
    clearTimeout(this._bubbleTimer)
    this._bubbleTimer = setTimeout(() => this.bubble.classList.remove('show'), ms)
  }

  /** 風のあいだ、雷神をゆらゆらさせる */
  setWindy(on) {
    this.mascotArt.classList.toggle('windy', !!on)
  }

  showGameOver(score) {
    this.finalScore.textContent = 'SCORE: ' + String(score).padStart(4, '0')
    this.gameover.classList.add('show')
  }
  hideGameOver() { this.gameover.classList.remove('show') }

  onRetry(cb) { this.retryBtn.addEventListener('click', cb) }
}
