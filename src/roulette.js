import { COLORS, SLOTS, SLOT_TYPE, slotWeight } from './colors.js'

/** 回転時間（秒） */
const SPIN_TIME = 2.6
/** 通常色の結果を見せてから次へ進むまでの余韻（秒） */
export const RESULT_HOLD = 1.3
/** 特殊マスは演出があるので少し長めに見せる */
export const SPECIAL_HOLD = 2.0

const easeOutQuart = (k) => 1 - Math.pow(1 - k, 4)
const rad = (deg) => (deg * Math.PI) / 180

/**
 * カラールーレット。
 * 扇の角度は SLOT_WEIGHTS の重みに比例するので、見た目と当たる確率が一致する。
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

    this.buildSectors()
    this.rot = -this.sectors[0].mid
    this.spinning = false
    this.result = null

    this.spinBtn.addEventListener('click', () => this.spin())
    this.draw()
  }

  /** 重みに比例した扇を作る（真上を 0 度として時計回り） */
  buildSectors() {
    const total = SLOTS.reduce((a, s) => a + slotWeight(s), 0)
    let acc = 0
    this.sectors = SLOTS.map((slot) => {
      const span = (slotWeight(slot) / total) * 360
      const seg = { slot, a0: acc, a1: acc + span, mid: acc + span / 2 }
      acc += span
      return seg
    })
    this.total = total
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

  /** 重み付き抽選 */
  pickIndex() {
    let r = Math.random() * this.total
    for (let i = 0; i < SLOTS.length; i++) {
      r -= slotWeight(SLOTS[i])
      if (r <= 0) return i
    }
    return SLOTS.length - 1
  }

  spin() {
    if (this.spinning) return
    this.spinning = true
    this.result = null
    this.spinBtn.disabled = true
    this.spinBtn.textContent = '...'
    this.resultEl.textContent = ''

    // 先に結果を決めて、その扇の中心が真上に来る角度で止める
    this.resultIndex = this.pickIndex()
    this.startRot = this.rot % 360
    this.endRot = -this.sectors[this.resultIndex].mid
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
    const slot = SLOTS[this.resultIndex]
    this.result = slot
    this.showResult(slot)
    this.onResult(slot)
  }

  showResult(slot) {
    if (slot.type === SLOT_TYPE.COLOR) {
      this.resultEl.textContent = `今回の色：${slot.emoji} ${slot.label}`
    } else {
      this.resultEl.textContent = `今回：${slot.emoji} ${slot.label}`
    }
    this.resultEl.style.color = slot.type === SLOT_TYPE.DANGER ? '#ff6b6b' : slot.css
  }

  /** 「その条件では抜けない」ときにもう一度回せるようにする */
  allowRespin(message) {
    this.spinBtn.disabled = false
    this.spinBtn.textContent = 'SPIN'
    this.resultEl.textContent = message
    this.resultEl.style.color = ''
  }

  /** 針の真下にある扇（結果と一致するはず。検証用にも使う） */
  sectorUnderPointer() {
    const norm = ((-this.rot % 360) + 360) % 360
    return this.sectors.findIndex((s) => norm >= s.a0 && norm < s.a1)
  }

  draw() {
    const ctx = this.ctx
    const S = this.size
    const R = S / 2 - 10
    ctx.clearRect(0, 0, S, S)
    ctx.save()
    ctx.translate(S / 2, S / 2)
    ctx.rotate(rad(this.rot))

    for (const seg of this.sectors) {
      const a0 = rad(-90 + seg.a0)
      const a1 = rad(-90 + seg.a1)

      if (seg.slot.type === SLOT_TYPE.RAINBOW) {
        // 虹は5色の細い扇に割って塗る
        for (let i = 0; i < COLORS.length; i++) {
          const b0 = a0 + ((a1 - a0) * i) / COLORS.length
          const b1 = a0 + ((a1 - a0) * (i + 1)) / COLORS.length
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, R, b0, b1)
          ctx.closePath()
          ctx.fillStyle = COLORS[i].css
          ctx.fill()
        }
      } else {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, R, a0, a1)
        ctx.closePath()
        ctx.fillStyle = seg.slot.css
        ctx.fill()
      }

      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, R, a0, a1)
      ctx.closePath()
      ctx.lineWidth = 3
      ctx.strokeStyle = seg.slot.type === SLOT_TYPE.DANGER
        ? 'rgba(255,82,82,0.85)'
        : 'rgba(6,9,26,0.55)'
      ctx.stroke()

      ctx.save()
      ctx.rotate((a0 + a1) / 2)
      ctx.translate(R * 0.66, 0)
      ctx.rotate(Math.PI / 2)
      ctx.fillStyle = seg.slot.textCss
      ctx.font = 'bold 26px "Hiragino Kaku Gothic ProN", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(seg.slot.wheelLabel, 0, 0)
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
