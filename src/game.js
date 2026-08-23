import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import {
  Tower, createWorld, setGrabbed, setReleased, setKinematic, setDynamic,
  slotTransform, levelY, BLOCK, LEVELS,
} from './tower.js'
import { Weather, WEATHERS } from './weather.js'
import { SUCCESS_LINES } from './ui.js'

/* ------------------------------------------------------------------
 * ゲーム状態
 *   SELECT         抜くブロックを選ぶ
 *   PULLING        引き抜き中（完全に抜けるまで次へ進めない）
 *   PLACEMENT      置き場所を選ぶ（最上段の空きスロットから）
 *   PLACING        選んだ場所へ下ろすアニメーション
 *   SETTLING       物理が落ち着くのを待つ
 *   WEATHER_CHANGE 次の天候を発表する
 *   GAMEOVER
 * ------------------------------------------------------------------ */
export const STATE = {
  SELECT: 'SELECT',
  PULLING: 'PULLING',
  PLACEMENT: 'PLACEMENT',
  PLACING: 'PLACING',
  SETTLING: 'SETTLING',
  WEATHER_CHANGE: 'WEATHER_CHANGE',
  GAMEOVER: 'GAMEOVER',
}

/** 引き抜ける最大距離。タワーの外へ完全に出せるだけの余裕を持たせる */
const MAX_PULL = BLOCK.len * 1.35
/** ここまで動かさないと「抜けた」と判定しない（重なり判定と併用） */
const MIN_PULL_DISTANCE = BLOCK.len * 0.9
/** 重なり判定に使うすき間。これだけ離れていれば重なっていないとみなす */
const CLEAR_MARGIN = 0.02

/** 引き抜き速度の上限。速すぎると周りのブロックを弾き飛ばしてしまう */
const MAX_GRAB_SPEED = 1.4
/** 置いたあと落ち着くのを待つ時間 */
const SETTLE_TIME = 1.1
/** 天候発表を見せる時間 */
const WEATHER_TIME = 1.8
/** 配置モードでブロックを浮かせておく高さ */
const HOVER_HEIGHT = 0.6

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
    this.pointerNdc = new THREE.Vector2()

    this.world = null
    this.tower = null
    this.weather = null
    this.markers = []

    this.bindEvents()
    this.reset()
  }

  /* ================= セットアップ / リセット ================= */

  reset() {
    if (this.tower) this.tower.dispose()
    if (this.weather) this.weather.dispose()
    this.clearMarkers()

    this.world = createWorld()
    this.tower = new Tower(this.scene, this.world)
    this.weather = new Weather(this.scene)

    this.score = 0
    this.turn = 0
    this.topLevel = LEVELS
    this.topFilled = [false, false, false]

    this.selected = null
    this.hovered = null
    this.dragging = false
    this.orbiting = false
    this.canceling = false
    this.awaitRelease = false
    this.pull = 0
    this.pullTarget = 0
    this.hoverSlot = 1
    this.tween = null
    this.settleT = 0
    this.weatherT = 0
    this.pullNagCooldown = 0
    // 開始直後の初期振動で雷神が驚かないよう、少し猶予を置く
    this.dangerCooldown = 2.0

    this.state = STATE.SELECT

    this.weather.set(WEATHERS.CLEAR, true)
    this.ui.setWeather(WEATHERS.CLEAR)
    this.ui.setWindy(false)
    this.ui.setScore(0)
    this.ui.hideGameOver()
    this.ui.setPrompt('ブロックをクリックして選ぼう')
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
      if (e.key === 'Escape') this.cancel()
    })

    this.ui.onRetry(() => this.reset())
  }

  setNdc(e) {
    this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1
    return this.ndc
  }

  pick(e) {
    this.raycaster.setFromCamera(this.setNdc(e), this.camera)
    const hits = this.raycaster.intersectObjects(this.tower.meshes(), false)
    for (const h of hits) {
      const block = h.object.userData.block
      if (block && this.tower.isSelectable(block)) return block
    }
    return null
  }

  pickMarker(e) {
    if (!this.markers.length) return null
    this.raycaster.setFromCamera(this.setNdc(e), this.camera)
    const hits = this.raycaster.intersectObjects(this.markers.map((m) => m.mesh), false)
    return hits.length ? hits[0].object.userData.marker : null
  }

  onPointerDown(e) {
    if (this.state === STATE.GAMEOVER) return
    if (e.button === 2) { this.cancel(); return }
    if (e.button !== 0) return

    if (this.state === STATE.PLACEMENT) {
      const marker = this.pickMarker(e)
      if (marker && !this.awaitRelease) {
        this.hoverSlot = marker.slot
        this.confirmPlacement()
        return
      }
      // 置き場所以外を掴んだらカメラ操作
      this.startOrbit(e)
      return
    }

    if (this.state === STATE.SELECT || this.state === STATE.PULLING) {
      const hit = this.pick(e)
      if (this.state === STATE.SELECT && hit) {
        this.select(hit)
        this.beginDrag(e)
        return
      }
      if (this.state === STATE.PULLING && hit === this.selected) {
        this.beginDrag(e)
        return
      }
      this.startOrbit(e)
    }
  }

  startOrbit(e) {
    this.orbiting = true
    this.orbit.start(e)
    this.renderer.domElement.classList.add('grabbing')
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

    if (this.state === STATE.PLACEMENT) {
      const marker = this.pickMarker(e)
      this.renderer.domElement.classList.toggle('pointing', !!marker)
      if (marker) this.hoverSlot = marker.slot
      return
    }

    // ホバー表示（掴めるブロックの上ではカーソルを変える）
    if (this.state === STATE.SELECT) {
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
    this.awaitRelease = false
    this.renderer.domElement.classList.remove('grabbing')

    // 中途半端なところで手を離したら、まだ抜けていないことを伝える
    if (this.state === STATE.PULLING && this.pullNagCooldown <= 0 && this.actualPull() > 0.25) {
      this.ui.say('もう少し引き抜こう！', 2200)
      this.pullNagCooldown = 3.0
    }
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
    this.state = STATE.PULLING
    this.pull = 0
    this.pullTarget = 0
    this.canceling = false
    this.pullNagCooldown = 0

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
    this.ui.setPrompt('ドラッグして完全に引き抜こう')
  }

  deselect() {
    if (this.hovered) this.hovered.material.emissive.setHex(0x000000)
    this.hovered = null
    if (this.selected) {
      this.selected.outline.visible = false
      this.selected.material.emissive.setHex(0x000000)
      this.selected = null
    }
  }

  /** 引き抜き方向に、実際にどれだけ動いたか（物理の結果を見る） */
  actualPull() {
    if (!this.selected) return 0
    const p = this.selected.body.position
    const d = this.pullDir
    return (p.x - this.origPos.x) * d.x
      + (p.y - this.origPos.y) * d.y
      + (p.z - this.origPos.z) * d.z
  }

  /**
   * 完全に引き抜けたか。
   * 「元の位置から十分離れている」かつ「どのブロックとも重なっていない」で判定する。
   */
  isFullyPulled() {
    if (!this.selected) return false
    if (this.actualPull() < MIN_PULL_DISTANCE) return false

    const me = this.selected.body
    me.updateAABB()
    for (const b of this.tower.blocks) {
      if (b === this.selected) continue
      b.body.updateAABB()
      if (aabbOverlaps(me.aabb, b.body.aabb, CLEAR_MARGIN)) return false
    }
    return true
  }

  /** 引き抜き・配置をやめて元に戻す */
  cancel() {
    if (this.state === STATE.PULLING) {
      this.canceling = true
      this.pullTarget = 0
      return
    }
    if (this.state === STATE.PLACEMENT) {
      // 配置をやめて、ブロックを元の穴へ戻す（このターンをやり直し）
      this.exitPlacement()
      const body = this.selected.body
      // 空中に浮いているので、いったん引き抜き軸の上へ戻してから押し込む
      body.position.set(
        this.origPos.x + this.pullDir.x * MAX_PULL,
        this.origPos.y + this.pullDir.y * MAX_PULL,
        this.origPos.z + this.pullDir.z * MAX_PULL
      )
      body.quaternion.copy(this.origQuat)
      setGrabbed(body)
      body.collisionResponse = true

      this.pull = MAX_PULL
      this.pullTarget = 0
      // canceling を立てておかないと、抜けきった状態なので即座に配置モードへ戻ってしまう
      this.canceling = true
      this.state = STATE.PULLING
      this.ui.setPrompt('もどしています……')
    }
  }

  updatePulling(dt) {
    const block = this.selected
    if (!block) return

    this.pullNagCooldown -= dt

    // 目標値へなめらかに追従させる（急激な移動で物理が壊れるのを防ぐ）
    this.pull += (this.pullTarget - this.pull) * Math.min(1, dt * 6)

    const d = this.pullDir
    const tx = this.origPos.x + d.x * this.pull
    const ty = this.origPos.y + d.y * this.pull
    const tz = this.origPos.z + d.z * this.pull

    const body = block.body
    body.velocity.set((tx - body.position.x) / dt, (ty - body.position.y) / dt, (tz - body.position.z) / dt)
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
      this.state = STATE.SELECT
      this.ui.setPrompt('ブロックをクリックして選ぼう')
      return
    }

    if (!this.canceling && this.isFullyPulled()) this.enterPlacement()
  }

  /* ================= 配置モード ================= */

  freeSlots() {
    const out = []
    for (let i = 0; i < 3; i++) if (!this.topFilled[i]) out.push(i)
    return out
  }

  enterPlacement() {
    const block = this.selected
    const body = block.body

    setKinematic(body)
    body.collisionResponse = false

    // 「ここに置かれる」ことが分かるように半透明にする
    block.material.transparent = true
    block.material.opacity = 0.55
    block.material.depthWrite = false

    this.buildMarkers()
    const free = this.freeSlots()
    this.hoverSlot = free.includes(1) ? 1 : free[0]
    // ドラッグから連続で置いてしまわないよう、一度指を離させる
    this.awaitRelease = this.dragging
    this.dragging = false

    this.state = STATE.PLACEMENT
    this.ui.setPrompt('置き場所をクリックして決めよう（端に置くほど不安定！）')
    this.ui.say('どこに置く？ まんなかが安全だぞ！', 2600)
  }

  buildMarkers() {
    this.clearMarkers()
    for (const slot of this.freeSlots()) {
      const { pos, quat } = slotTransform(this.topLevel, slot)
      const mesh = new THREE.Mesh(
        this.tower.geometry,
        new THREE.MeshBasicMaterial({
          color: 0xffd23f,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        })
      )
      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
      // 少し小さくして、候補どうしのすき間を見えるようにする
      mesh.scale.setScalar(0.96)

      const edge = new THREE.LineSegments(
        this.tower.edgesGeometry,
        new THREE.LineBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthTest: false })
      )
      edge.renderOrder = 998
      mesh.add(edge)

      const marker = { slot, mesh, edge, pos }
      mesh.userData.marker = marker
      this.scene.add(mesh)
      this.markers.push(marker)
    }
  }

  clearMarkers() {
    for (const m of this.markers) {
      this.scene.remove(m.mesh)
      m.mesh.material.dispose()
      m.edge.material.dispose()
    }
    this.markers = []
  }

  updatePlacement(dt) {
    // 選ばれている候補を強調する
    for (const m of this.markers) {
      const on = m.slot === this.hoverSlot
      m.mesh.material.opacity += ((on ? 0.5 : 0.05) - m.mesh.material.opacity) * Math.min(1, dt * 10)
      m.edge.material.opacity = on ? 1.0 : 0.22
      m.edge.material.color.setHex(on ? 0xffffff : 0xffd23f)
    }

    // ブロックを候補位置の真上へふわりと移動させる（配置プレビュー）
    const { pos, quat } = slotTransform(this.topLevel, this.hoverSlot)
    const body = this.selected.body
    const k = Math.min(1, dt * 8)
    body.position.x += (pos.x - body.position.x) * k
    body.position.y += (pos.y + HOVER_HEIGHT - body.position.y) * k
    body.position.z += (pos.z - body.position.z) * k
    body.velocity.setZero()

    const q = new CANNON.Quaternion()
    body.quaternion.slerp(quat, k, q)
    body.quaternion.copy(q)
  }

  exitPlacement() {
    this.clearMarkers()
    const block = this.selected
    if (block) {
      block.material.transparent = false
      block.material.opacity = 1
      block.material.depthWrite = true
    }
  }

  confirmPlacement() {
    const block = this.selected
    const body = block.body
    const slot = this.hoverSlot
    const t = slotTransform(this.topLevel, slot)
    // ほんの少しだけ浮かせて置く（めり込み防止）
    t.pos.y += 0.04

    this.tween = {
      t: 0,
      dur: 0.32,
      from: body.position.clone(),
      to: t.pos.clone(),
      q0: body.quaternion.clone(),
      q1: t.quat.clone(),
      level: this.topLevel,
      slot,
    }

    this.clearMarkers()
    this.state = STATE.PLACING
    this.ui.setPrompt('')
  }

  updatePlacing(dt) {
    const tw = this.tween
    const body = this.selected.body
    tw.t += dt

    const k = clamp(tw.t / tw.dur, 0, 1)
    const e = k * k * (3 - 2 * k) // smoothstep
    const pos = new CANNON.Vec3()
    tw.from.lerp(tw.to, e, pos)
    body.position.copy(pos)
    body.velocity.setZero()

    const q = new CANNON.Quaternion()
    tw.q0.slerp(tw.q1, e, q)
    body.quaternion.copy(q)

    if (k < 1) return

    // 到着 → 物理演算へ戻す
    const block = this.selected
    block.material.transparent = false
    block.material.opacity = 1
    block.material.depthWrite = true

    body.position.copy(tw.to)
    body.quaternion.copy(tw.q1)
    body.collisionResponse = true
    setDynamic(body)

    block.level = tw.level
    block.slot = tw.slot

    this.topFilled[tw.slot] = true
    if (this.topFilled.every(Boolean)) {
      this.topLevel++
      this.topFilled = [false, false, false]
    }

    this.deselect()
    this.tween = null
    this.settleT = 0
    this.state = STATE.SETTLING
  }

  /* ================= ターン進行 ================= */

  updateSettling(dt) {
    this.settleT += dt
    if (this.settleT < SETTLE_TIME) return

    this.score += 100
    this.turn++
    this.ui.setScore(this.score)

    const next = this.weather.roll()
    this.weather.set(next)
    this.ui.setWeather(next)
    this.ui.flashWeather(next)
    this.ui.setWindy(next.key === 'WIND')
    this.ui.say(next.line, 3200)

    this.weatherT = 0
    this.state = STATE.WEATHER_CHANGE
  }

  updateWeatherChange(dt) {
    this.weatherT += dt
    if (this.weatherT < WEATHER_TIME) return

    if (this.weather.current.key === 'CLEAR') {
      const line = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)]
      this.ui.say(line, 2000)
    }
    this.state = STATE.SELECT
    this.ui.setPrompt('ブロックをクリックして選ぼう')
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
    this.state = STATE.GAMEOVER
    // 掴んだままだと物理が止まらないので、手を離してから終了する
    this.exitPlacement()
    if (this.selected) setReleased(this.selected.body)
    this.deselect()
    this.dragging = false
    this.orbiting = false
    this.ui.setPrompt('')
    this.ui.setWindy(false)
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

    switch (this.state) {
      case STATE.PULLING: this.updatePulling(dt); break
      case STATE.PLACEMENT: this.updatePlacement(dt); break
      case STATE.PLACING: this.updatePlacing(dt); break
      default: break
    }

    if (this.state !== STATE.GAMEOVER) {
      this.weather.update(dt, this.tower)
    }

    // 固定ステップを細かくすると、積み重なったブロックが安定する
    this.world.step(1 / 120, dt, 6)
    this.tower.sync()

    if (this.state === STATE.SETTLING) this.updateSettling(dt)
    else if (this.state === STATE.WEATHER_CHANGE) this.updateWeatherChange(dt)

    if (this.state !== STATE.GAMEOVER && this.state !== STATE.PLACING) {
      this.checkCollapse()
      this.checkDanger(dt)
    }

    // タワーが伸びたらカメラの注視点も少し上げる
    const targetY = clamp(levelY(this.topLevel) * 0.5, 1.6, 3.2)
    this.orbit.followY(targetY, dt)
  }
}

/** margin だけ縮めた上での AABB 重なり判定 */
function aabbOverlaps(a, b, margin) {
  return (
    a.lowerBound.x + margin < b.upperBound.x && b.lowerBound.x + margin < a.upperBound.x &&
    a.lowerBound.y + margin < b.upperBound.y && b.lowerBound.y + margin < a.upperBound.y &&
    a.lowerBound.z + margin < b.upperBound.z && b.lowerBound.z + margin < a.upperBound.z
  )
}
