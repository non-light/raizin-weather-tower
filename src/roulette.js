import { COLORS } from './colors.js'

const SECTOR = 360 / COLORS.length
/** 回転時間（秒） */
const SPIN_TIME = 2.6
/** 結果を見せてから次へ進むまでの余韻（秒） */
export const RESULT_HOLD = 1.3

const easeOutQuart = (k) => 1 - Math.pow(1 - k, 4)

/**
 * カラールーレット。
 * 描画は canvas 2D、アニメーションはゲームループから update() で進める
 * （requestAnimationFrame に依存しないので、コマ送り検証もできる）。
 */
export class Roulette {
  constructor(onResult) {
    this.onResult = onResult
    this.root = document.getElementById('roulette')
    this.canvas = document.getElementById('rl-canvas')
    this.ctx = this.canvas.getContext('2d')
    this.spinBtn = document.getElementById('rl-spin')
    this.resultEl = document.getElementById('rl-result')
    this.size = this.canvas.width

    this.rot = -SECTOR / 2
    this.spinning = false
    this.result = null

    this.spinBtn.addEventListener('click', () => this.spin())
    this.draw()
  }

  show(message = '') {
    this.root.classList.add('show')
    this.resultEl.textContent = message
    this.resultEl.style.color = ''
    this.spinBtn.disabled = false
    this.spinBtn.textContent = 'SPIN'
  }

  hide() {
    this.root.classList.remove('show')
  }

  spin() {
    if (this.spinning) return
    this.spinning = true
    this.result = null
    this.spinBtn.disabled = true
    this.spinBtn.textContent = '...'
    this.resultEl.textContent = ''

    // 先に結果を決めて、その色が真上に来る角度で止める
    this.resultIndex = Math.floor(Math.random() * COLORS.length)
    this.startRot = this.rot % 360
    this.endRot = -(this.resultIndex * SECTOR + SECTOR / 2)
    const turns = 4 + Math.floor(Math.random() * 3)
    while (this.endRot < this.startRot + 360 * turns) this.endRot += 360

    this.t = 0
  }

  update(dt) {
    if (!this.spinning) return
    this.t += dt
    const k = Math.min(1, this.t / SPIN_TIME)
    this.rot = this.startRot + (this.endRot - this.startRot) * easeOutQuart(k)
    this.draw()

    if (k < 1) return
    this.spinning = false
    const color = COLORS[this.resultIndex]
    this.result = color
    this.showResult(color)
    this.onResult(color)
  }

  showResult(color) {
    this.resultEl.textContent = `今回の色：${color.emoji} ${color.label}`
    this.resultEl.style.color = color.css
  }

  /** 「その色が無かった」ときにもう一度回せるようにする */
  allowRespin(message) {
    this.spinBtn.disabled = false
    this.spinBtn.textContent = 'SPIN'
    this.resultEl.textContent = message
    this.resultEl.style.color = ''
  }

  draw() {
    const ctx = this.ctx
    const S = this.size
    const R = S / 2 - 10
    ctx.clearRect(0, 0, S, S)
    ctx.save()
    ctx.translate(S / 2, S / 2)
    ctx.rotate((this.rot * Math.PI) / 180)

    for (let i = 0; i < COLORS.length; i++) {
      const a0 = ((-90 + i * SECTOR) * Math.PI) / 180
      const a1 = ((-90 + (i + 1) * SECTOR) * Math.PI) / 180

      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, R, a0, a1)
      ctx.closePath()
      ctx.fillStyle = COLORS[i].css
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(6,9,26,0.55)'
      ctx.stroke()

      ctx.save()
      ctx.rotate((a0 + a1) / 2)
      ctx.translate(R * 0.64, 0)
      ctx.rotate(Math.PI / 2)
      ctx.fillStyle = '#0d1026'
      ctx.font = 'bold 34px "Hiragino Kaku Gothic ProN", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(COLORS[i].label, 0, 0)
      ctx.restore()
    }
    ctx.restore()

    // 外周のリング
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, R + 3, 0, Math.PI * 2)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#ffd23f'
    ctx.stroke()
  }
}
