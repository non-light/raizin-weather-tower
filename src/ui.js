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
    this.flash = document.getElementById('weather-flash')
    this.placeBtn = document.getElementById('place-btn')
    this.bubble = document.getElementById('bubble')
    this.bubbleText = document.getElementById('bubble-text')
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
  }

  setScore(n) {
    this.score.textContent = 'SCORE: ' + String(n).padStart(4, '0')
  }

  setWeather(w) {
    this.badge.textContent = `${w.icon} ${w.label}`
  }

  /** 天候切り替え時に画面中央へ大きく表示 → 1.6秒後に消えて小さい表示だけ残る */
  flashWeather(w) {
    this.flash.textContent = `${w.icon} ${w.label}`
    this.flash.classList.add('show')
    clearTimeout(this._flashTimer)
    this._flashTimer = setTimeout(() => this.flash.classList.remove('show'), 1600)
  }

  /** 雷神のふきだし */
  say(text, ms = 2600) {
    this.bubbleText.textContent = text
    this.bubble.classList.add('show')
    clearTimeout(this._bubbleTimer)
    this._bubbleTimer = setTimeout(() => this.bubble.classList.remove('show'), ms)
  }

  showPlace() { this.placeBtn.classList.add('show') }
  hidePlace() { this.placeBtn.classList.remove('show') }

  showGameOver(score) {
    this.finalScore.textContent = 'SCORE: ' + String(score).padStart(4, '0')
    this.gameover.classList.add('show')
  }
  hideGameOver() { this.gameover.classList.remove('show') }

  onPlace(cb) { this.placeBtn.addEventListener('click', cb) }
  onRetry(cb) { this.retryBtn.addEventListener('click', cb) }
}
