import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import {
  Tower, createWorld, setGrabbed, setReleased, setKinematic, setDynamic,
  slotTransform, levelY, BLOCK, LEVELS,
} from './tower.js'
import { Weather, WEATHERS } from './weather.js'
import { SUCCESS_LINES } from './ui.js'

const STATE = {
  IDLE: 'idle',     // 抜くブロックを選ぶ
  PULL: 'pull',     // 引き抜き中
  PLACE: 'place',   // 上へ運搬中（アニメーション）
  SETTLE: 'settle', // 置いた直後、落ち着くのを待つ
  OVER: 'over',
}

/** 引き抜ける最大距離 */
const MAX_PULL = BLOCK.len * 0.95
/** ここまで抜いたら「上に置く」ボタンが出る */
const PLACE_THRESHOLD = BLOCK.len * 0.66
/** 引き抜き速度の上限。速すぎると周りのブロックを弾き飛ばしてしまう */
const MAX_GRAB_SPEED = 1.4
/** 置いたあと落ち着くのを待つ時間 */
const SETTLE_TIME = 1.1

/** 崩壊判定：本来あるべき高さからこれだけ落ちたブロックを「落ちた」とみなす */
const FALL_DROP = BLOCK.hei * 2
const FALL_COUNT = 3

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export class Game {
  constructor({ scene, camera, renderer, ui, orbit }) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.ui = ui
    this.orbit = orbit

    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()

    this.world = null
    this.tower = null
    this.weather = null

    this.bindEvents()
    this.reset()
  }

  /* ================= セットアップ / リセット ================= */

  reset() {
    if (this.tower) this.tower.dispose()
    if (this.weather) this.weather.dispose()

    this.world = createWorld()
    this.tower = new Tower(this.scene, this.world)
    this.weather = new Weather(this.scene)

    this.score = 0
    this.turn = 0
    this.topLevel = LEVELS
    this.topSlot = 0

    this.selected = null
    this.hovered = null
    this.dragging = false
    this.orbiting = false
    this.canceling = false
    this.pull = 0
    this.pullTarget = 0
    this.tween = null
    this.settleT = 0
    // 開始直後の初期振動で雷神が驚かないよう、少し猶予を置く
    this.dangerCooldown = 2.0

    this.state = STATE.IDLE

    this.weather.set(WEATHERS.CLEAR, true)
    this.ui.setWeather(WEATHERS.CLEAR)
    this.ui.setScore(0)
    this.ui.hideGameOver()
    this.ui.hidePlace()
    this.ui.say('崩さないように、そーっと抜くんだぞ！', 3800)
  }

  /* ================= 入力 ================= */

  bindEvents() {
    const dom = this.renderer.domElement
    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    dom.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    window.addEventListener('pointermove', (e) => this.onPointerMove(e))
    window.addEventListener('pointerup', () => this.onPointerUp())
    dom.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.orbit.zoom(e.deltaY)
    }, { passive: false })

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelPull()
    })

    this.ui.onPlace(() => this.startPlace())
    this.ui.onRetry(() => this.reset())
  }

  pick(e) {
    this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.tower.meshes(), false)
    for (const h of hits) {
      const block = h.object.userData.block
      if (block && this.tower.isSelectable(block)) return block
    }
    return null
  }

  onPointerDown(e) {
    if (this.state === STATE.OVER) return

    // 右クリックは引き抜きのキャンセル
    if (e.button === 2) {
      this.cancelPull()
      return
    }
    if (e.button !== 0) return

    if (this.state === STATE.IDLE || this.state === STATE.PULL) {
      const hit = this.pick(e)

      if (this.state === STATE.IDLE && hit) {
        this.select(hit)
        this.beginDrag(e)
        return
      }
      if (this.state === STATE.PULL && hit === this.selected) {
        this.beginDrag(e)
        return
      }
      // ブロック以外を掴んだらカメラ操作
      this.orbiting = true
      this.orbit.start(e)
      this.renderer.domElement.classList.add('grabbing')
    }
  }

  onPointerMove(e) {
    if (this.dragging) {
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      // マウス移動量をブロックの長手方向（画面上のベクトル）へ射影する
      const along = (dx * this.axis2.x + dy * this.axis2.y) / this.axis2.pxPerUnit
      this.pullTarget = clamp(this.pullTarget + along, 0, MAX_PULL)
      this.canceling = false
      return
    }

    if (this.orbiting) {
      this.orbit.move(e)
      return
    }

    // ホバー表示（掴めるブロックの上ではカーソルを変える）
    if (this.state === STATE.IDLE) {
      const hit = this.pick(e)
      if (hit !== this.hovered) {
        if (this.hovered && this.hovered !== this.selected) {
          this.hovered.material.emissive.setHex(0x000000)
        }
        this.hovered = hit
        if (hit && hit !== this.selected) hit.material.emissive.setHex(0x241a00)
      }
      this.renderer.domElement.classList.toggle('pointing', !!hit)
    }
  }

  onPointerUp() {
    this.dragging = false
    this.orbiting = false
    this.renderer.domElement.classList.remove('grabbing')
  }

  beginDrag(e) {
    this.dragging = true
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.computeScreenAxis()
  }

  /**
   * ブロックの長手方向が画面上でどちら向きに見えるかを求める。
   * ドラッグ量(px) → 引き抜き量(world) の変換に使う。
   */
  computeScreenAxis() {
    const o = this.origPos
    const d = this.pullDir
    const p0 = new THREE.Vector3(o.x, o.y, o.z).project(this.camera)
    const p1 = new THREE.Vector3(
      o.x + d.x * BLOCK.len, o.y + d.y * BLOCK.len, o.z + d.z * BLOCK.len
    ).project(this.camera)

    const hw = window.innerWidth / 2
    const hh = window.innerHeight / 2
    const dx = (p1.x - p0.x) * hw
    const dy = -(p1.y - p0.y) * hh
    const len = Math.hypot(dx, dy)

    if (len < 1e-3) {
      // ほぼ真正面を向いている（画面上で潰れている）ときの保険
      this.axis2 = { x: 0, y: 1, pxPerUnit: 120 }
      return
    }
    this.axis2 = {
      x: dx / len,
      y: dy / len,
      // 極端に感度が上がらないよう下限を設ける
      pxPerUnit: Math.max(60, len / BLOCK.len),
    }
  }

  /* ================= ブロック選択 / 引き抜き ================= */

  select(block) {
    this.selected = block
    this.state = STATE.PULL
    this.pull = 0
    this.pullTarget = 0
    this.canceling = false

    block.outline.visible = true
    block.material.emissive.setHex(0x6b4d00)

    this.origPos = block.body.position.clone()
    this.origQuat = block.body.quaternion.clone()

    // 長手方向（ローカル +X）をワールドへ。カメラに近づく向きを「手前」とする
    const local = new CANNON.Vec3(1, 0, 0)
    const world = block.body.quaternion.vmult(local)
    const dir = new THREE.Vector3(world.x, world.y, world.z).normalize()
    const toCam = new THREE.Vector3()
      .copy(this.camera.position)
      .sub(block.mesh.position)
    if (dir.dot(toCam) < 0) dir.multiplyScalar(-1)
    this.pullDir = dir

    setGrabbed(block.body)
    this.tower.wakeAll()
  }

  deselect() {
    if (this.hovered) this.hovered.material.emissive.setHex(0x000000)
    this.hovered = null
    if (this.selected) {
      this.selected.outline.visible = false
      this.selected.material.emissive.setHex(0x000000)
      this.selected = null
    }
    this.ui.hidePlace()
  }

  /** 引き抜きをやめて元の位置へ戻す */
  cancelPull() {
    if (this.state !== STATE.PULL) return
    this.canceling = true
    this.pullTarget = 0
    this.ui.hidePlace()
  }

  updatePull(dt) {
    const block = this.selected
    if (!block) return

    // 目標値へなめらかに追従させる（急激な移動で物理が壊れるのを防ぐ）
    this.pull += (this.pullTarget - this.pull) * Math.min(1, dt * 6)

    const d = this.pullDir
    const tx = this.origPos.x + d.x * this.pull
    const ty = this.origPos.y + d.y * this.pull
    const tz = this.origPos.z + d.z * this.pull

    const body = block.body
    const vx = (tx - body.position.x) / dt
    const vy = (ty - body.position.y) / dt
    const vz = (tz - body.position.z) / dt

    body.velocity.set(vx, vy, vz)
    const sp = body.velocity.length()
    if (sp > MAX_GRAB_SPEED) body.velocity.scale(MAX_GRAB_SPEED / sp, body.velocity)

    body.angularVelocity.setZero()
    body.quaternion.copy(this.origQuat)

    if (this.canceling && this.pull < 0.02) {
      // 元に戻しきったので手を離す
      body.position.copy(this.origPos)
      body.quaternion.copy(this.origQuat)
      setReleased(body)
      this.deselect()
      this.canceling = false
      this.state = STATE.IDLE
      return
    }

    if (!this.canceling && this.pull >= PLACE_THRESHOLD) this.ui.showPlace()
    else this.ui.hidePlace()
  }

  /* ================= 上へ積む ================= */

  startPlace() {
    if (this.state !== STATE.PULL || !this.selected) return
    if (this.pull < PLACE_THRESHOLD) return

    const block = this.selected
    const body = block.body
    const t = slotTransform(this.topLevel, this.topSlot)
    // ほんの少しだけ浮かせて置く（めり込み防止）
    t.pos.y += 0.04

    const cur = body.position.clone()
    const flyY = Math.max(cur.y, t.pos.y) + 1.0

    // 運搬中は他のブロックに触れないようにして、強制的に動かす
    setKinematic(body)
    body.collisionResponse = false

    this.tween = {
      t: 0,
      total: 1.1,
      segs: [
        { dur: 0.35, from: cur, to: new CANNON.Vec3(cur.x, flyY, cur.z) },
        { dur: 0.45, from: new CANNON.Vec3(cur.x, flyY, cur.z), to: new CANNON.Vec3(t.pos.x, flyY, t.pos.z) },
        { dur: 0.30, from: new CANNON.Vec3(t.pos.x, flyY, t.pos.z), to: t.pos.clone() },
      ],
      q0: body.quaternion.clone(),
      q1: t.quat.clone(),
      target: t,
      level: this.topLevel,
    }

    this.ui.hidePlace()
    this.state = STATE.PLACE
  }

  updatePlace(dt) {
    const tw = this.tween
    const body = this.selected.body
    tw.t += dt

    // 3区間（持ち上げ → 水平移動 → 下ろす）を順に進む
    let rest = tw.t
    let pos = null
    for (const seg of tw.segs) {
      if (rest <= seg.dur) {
        const k = seg.dur > 0 ? rest / seg.dur : 1
        const e = k * k * (3 - 2 * k) // smoothstep
        pos = seg.from.clone()
        seg.from.lerp(seg.to, e, pos)
        break
      }
      rest -= seg.dur
    }

    const progress = clamp(tw.t / tw.total, 0, 1)
    const q = new CANNON.Quaternion()
    tw.q0.slerp(tw.q1, Math.min(1, progress * 1.6), q)
    body.quaternion.copy(q)

    if (pos) {
      body.position.copy(pos)
      body.velocity.setZero()
      return
    }

    // 到着 → 物理演算へ戻す
    body.position.copy(tw.target.pos)
    body.quaternion.copy(tw.q1)
    body.collisionResponse = true
    setDynamic(body)

    this.selected.level = tw.level
    this.selected.slot = this.topSlot

    this.topSlot++
    if (this.topSlot > 2) {
      this.topSlot = 0
      this.topLevel++
    }

    this.deselect()
    this.tween = null
    this.settleT = 0
    this.state = STATE.SETTLE
  }

  /* ================= ターン進行 ================= */

  updateSettle(dt) {
    this.settleT += dt
    if (this.settleT < SETTLE_TIME) return

    this.score += 100
    this.turn++
    this.ui.setScore(this.score)

    const next = this.weather.roll()
    this.weather.set(next)
    this.ui.setWeather(next)
    this.ui.flashWeather(next)

    // 天候のセリフを優先し、晴れのときだけ成功セリフを出す
    if (next.key === 'CLEAR') {
      const line = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)]
      this.ui.say(line, 2200)
    } else {
      this.ui.say(next.line, 3000)
    }

    this.state = STATE.IDLE
  }

  /* ================= 崩壊判定 ================= */

  countFallen() {
    let n = 0
    for (const b of this.tower.blocks) {
      if (b === this.selected) continue
      if (b.level < 2) continue
      // 「その段の本来の高さ」からどれだけ落ちたかで見る。
      // 積み上がって高くなっても同じ基準で判定できる
      if (b.body.position.y < levelY(b.level) - FALL_DROP) n++
    }
    return n
  }

  checkCollapse() {
    if (this.countFallen() >= FALL_COUNT) this.gameOver()
  }

  gameOver() {
    this.state = STATE.OVER
    // 掴んだままだと物理が止まらないので、手を離してから終了する
    if (this.selected && this.selected.body.type === CANNON.Body.DYNAMIC) {
      setReleased(this.selected.body)
    }
    this.deselect()
    this.dragging = false
    this.orbiting = false
    this.ui.hidePlace()
    this.ui.say('あ〜〜〜！ くずれちゃった……', 4000)
    this.ui.showGameOver(this.score)
  }

  /** 大きく揺れたら雷神が反応する */
  checkDanger(dt) {
    this.dangerCooldown -= dt
    if (this.dangerCooldown > 0) return
    if (this.tower.maxSpeed(this.selected) > 1.3) {
      this.ui.say('お、おお……！？', 1800)
      this.dangerCooldown = 4.5
    }
  }

  /* ================= メインループ ================= */

  update(rawDt) {
    const dt = clamp(rawDt, 1 / 120, 1 / 20)

    if (this.state === STATE.PULL) this.updatePull(dt)
    else if (this.state === STATE.PLACE) this.updatePlace(dt)

    if (this.state !== STATE.OVER) {
      this.weather.update(dt, this.tower)
    }

    // 固定ステップを細かくすると、積み重なったブロックが安定する
    this.world.step(1 / 120, dt, 6)
    this.tower.sync()

    if (this.state === STATE.SETTLE) this.updateSettle(dt)

    if (this.state !== STATE.OVER && this.state !== STATE.PLACE) {
      this.checkCollapse()
      this.checkDanger(dt)
    }

    // タワーが伸びたらカメラの注視点も少し上げる
    const targetY = clamp(levelY(this.topLevel) * 0.5, 1.6, 3.2)
    this.orbit.followY(targetY, dt)
  }
}
