import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import {
  Tower, createWorld, setGrabbed, setReleased, setKinematic, setDynamic,
  slotTransform, levelY, BLOCK, LEVELS,
} from './tower.js'
import { Weather, WEATHERS } from './weather.js'
import { Roulette, RESULT_HOLD, SPECIAL_HOLD } from './roulette.js'
import { SLOT_TYPE, DANGER_LEVELS, COLORS } from './colors.js'
import { createStats } from './stats.js'
import { pickTitle, titleLine } from './titles.js'
import { unlock } from './collection.js'
import { Book } from './book.js'
import { SUCCESS_LINES } from './ui.js'

/* ------------------------------------------------------------------
 * ゲーム状態
 *   TITLE          タイトル画面。ボタンを押すまで何も進まない
 *   BOOK           称号図鑑。開いている間はゲームは何も進まない
 *   INTRO          開始の合図。このあと最初の天候発表へ
 *   ROULETTE       カラールーレットを回して、このターンの条件を決める
 *   COLOR_CHOICE   ⚡ 雷神：好きな色を自分で選ぶ
 *   SELECT         指定色のブロックを選ぶ
 *   SELECT_FREE    🌈 虹：どの色でも選べる
 *   SELECT_DANGER  ⬛ 黒：下3段からしか選べない
 *   PULLING        引き抜き中（完全に抜けるまで次へ進めない）
 *   PLACEMENT      置き場所を選ぶ（最上段の空きスロットから）
 *   PLACING        選んだ場所へ下ろすアニメーション
 *   SETTLING       物理が落ち着くのを待つ
 *   WEATHER_CHANGE 次の天候を発表する
 *   GAMEOVER
 * ------------------------------------------------------------------ */
export const STATE = {
  TITLE: 'TITLE',
  BOOK: 'BOOK',
  INTRO: 'INTRO',
  ROULETTE: 'ROULETTE',
  COLOR_CHOICE: 'COLOR_CHOICE',
  SELECT: 'SELECT',
  SELECT_FREE: 'SELECT_FREE',
  SELECT_DANGER: 'SELECT_DANGER',
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
const SETTLE_TIME = 1.6
/** 置いた直後、揺れ具合を見て雷神が反応するまでの時間 */
const SETTLE_REACT_TIME = 0.7
/** 天候発表を見せる時間 */
const WEATHER_TIME = 1.8
/** GAME OVER 後、崩れ切るのを待つ最大時間。これを過ぎたら強制的に凍結する */
const GAMEOVER_FREEZE_TIME = 2.5
/** 「よーし、いってみよう！」から最初の天候発表までの間 */
const INTRO_TIME = 1.1

/** 風が強いときのひとこと（順番に出る） */
const WIND_TALK = ['風が出てきた〜', 'ゆらゆらしてる…', 'おお…ちょっと強くなってきた…！']
/** 指定色ブロックのひかえめな強調 */
const COLOR_HINT_EMISSIVE = 0x1b1408
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
    this.roulette = new Roulette((slot) => this.onRouletteResult(slot))
    this.book = new Book(() => this.closeBook())

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
    this.weatherTalkCooldown = 0
    this.windTalkIndex = -1
    this.fogSaid = false
    this.saidPulling = false
    this.settleShake = 0
    this.settleReacted = false
    // 開始直後の初期振動で雷神が驚かないよう、少し猶予を置く
    this.dangerCooldown = 2.0

    this.rule = null
    this.pendingSlot = null
    this.resultHoldT = 0
    this.frozen = false
    this.gameOverT = 0

    this.introT = 0
    this.stats = createStats()
    this.stats.startedAt = performance.now()
    this.pendingRecovery = false
    this.turnSlotKey = null

    this.weather.set(WEATHERS.CLEAR, true)
    this.ui.setWeather(WEATHERS.CLEAR)
    this.ui.setRule('—')
    this.ui.setWindy(false)
    this.ui.setScore(0)
    this.ui.setPrompt('')
    this.ui.hideGameOver()
    this.ui.hideColorChoice()
    this.roulette.hide()

    // ボタンを押すまで、天候もルーレットもスコアも動かさない
    this.state = STATE.TITLE
    this.ui.showTitle()
  }

  /* ================= 開始 ================= */

  openBook() {
    if (this.state !== STATE.TITLE) return
    this.state = STATE.BOOK
    this.book.show()
  }

  closeBook() {
    this.book.hide()
    if (this.state === STATE.BOOK) this.state = STATE.TITLE
  }

  /** 「ゲームスタート！」で呼ばれる。ここで初めてゲームが動き出す */
  startGame() {
    if (this.state !== STATE.TITLE) return
    this.ui.hideTitle()
    this.ui.say('よーし、いってみよう！', 2200)
    this.introT = 0
    this.stats = createStats()
    this.stats.startedAt = performance.now()
    this.pendingRecovery = false
    this.turnSlotKey = null
    this.state = STATE.INTRO
  }

  updateIntro(dt) {
    this.introT += dt
    if (this.introT < INTRO_TIME) return
    // まず天候を発表してから、ルーレットへ
    this.announceWeather(this.weather.current)
  }

  /** 天候を確定して発表する。見せ終わったらルーレットへ進む */
  announceWeather(weather) {
    this.fogSaid = false
    this.weatherTalkCooldown = 2.5
    this.weather.set(weather)
    this.ui.setWeather(weather)
    this.ui.flashWeather(weather)
    this.ui.setWindy(this.weather.windActive)
    if (weather.lines) this.ui.saySequence(weather.lines, 1800)
    else this.ui.say(weather.line, 3200)
    this.stats.weatherSeen[weather.key]++
    this.weatherT = 0
    this.state = STATE.WEATHER_CHANGE
  }

  /* ================= カラールーレット ================= */

  enterRoulette() {
    this.rule = null
    this.pendingSlot = null
    this.resultHoldT = 0
    this.clearHint()
    this.ui.setRule('—')
    this.ui.setPrompt('')
    this.state = STATE.ROULETTE
    this.roulette.show()
  }

  /** ルーレットが止まった瞬間に呼ばれる */
  onRouletteResult(slot) {
    this.pendingSlot = slot
    this.resultHoldT = 0
    this.stats.spins++
    this.stats.slotSeen[slot.key]++
    this.turnSlotKey = slot.key
    if (slot.type === SLOT_TYPE.COLOR) this.stats.colorHistory.push(slot.key)

    if (slot.type === SLOT_TYPE.COLOR) {
      this.ui.say(slot.line, 2600)
      return
    }
    // 特殊マスは演出を出して、2言つづけてしゃべる
    this.ui.playEffect(slot.key)
    this.ui.flashSpecial(slot)
    this.ui.saySequence(slot.lines, 1700)
  }

  updateRoulette(dt) {
    this.roulette.update(dt)
    if (!this.pendingSlot) return

    // 結果を少し見せてから次へ（特殊マスは演出のぶん長め）
    const hold = this.pendingSlot.type === SLOT_TYPE.COLOR ? RESULT_HOLD : SPECIAL_HOLD
    this.resultHoldT += dt
    if (this.resultHoldT < hold) return

    const slot = this.pendingSlot
    this.pendingSlot = null

    switch (slot.type) {
      case SLOT_TYPE.RAIZIN: return this.beginColorChoice()
      case SLOT_TYPE.RAINBOW: return this.beginTurn({ kind: 'FREE', slot })
      case SLOT_TYPE.DANGER: return this.beginTurn({ kind: 'DANGER', slot })
      default: return this.beginTurn({ kind: 'COLOR', color: slot, slot })
    }
  }

  /** ⚡ 雷神：好きな色を選ばせる。選ぶまでブロックは触れない */
  beginColorChoice() {
    // 1本も抜けない色は選ばせない（選んだ瞬間に詰むのを防ぐ）
    const enabled = COLORS
      .filter((c) => this.tower.selectableOfColor(c.key).length > 0)
      .map((c) => c.key)

    if (enabled.length === 0) {
      this.ui.saySequence(['むむ…これはむずかしそう…', 'もう一回、ころころ〜'], 1700)
      this.roulette.allowRespin('抜けるブロックが無いので、もう一回！')
      return
    }

    this.roulette.hide()
    this.state = STATE.COLOR_CHOICE
    this.ui.setRule('⚡ 色をえらぶ', '#ffd23f')
    this.ui.setPrompt('好きな色をえらぼう')
    this.ui.showColorChoice(enabled, (color) => {
      this.beginTurn({ kind: 'COLOR', color, viaRaizin: true })
    })
  }

  /**
   * このターンの条件を確定して選択フェーズへ。
   * 条件に合うブロックが1本も無ければルーレットからやり直す。
   */
  beginTurn(rule) {
    this.rule = rule
    const playable = this.playableBlocks()

    if (playable.length === 0) {
      this.rule = null
      this.ui.saySequence(['その色、ないみたい…', 'もう一回、ころころ〜'], 1700)
      this.ui.setRule('—')
      this.roulette.show('その条件では抜けないので、もう一回！')
      this.state = STATE.ROULETTE
      return
    }

    this.roulette.hide()
    this.applyHint()

    if (rule.kind === 'FREE') {
      this.ui.setRule('🌈 FREE', '#ff8ad4')
      this.ui.setPrompt('どの色でもOK！ 好きなブロックをクリックしよう')
      this.state = STATE.SELECT_FREE
    } else if (rule.kind === 'DANGER') {
      this.ui.setRule(`⬛ 下${DANGER_LEVELS}段`, '#ff5252')
      this.ui.setPrompt(`下${DANGER_LEVELS}段のブロックだけ抜ける！ 色は自由`)
      this.state = STATE.SELECT_DANGER
    } else {
      const c = rule.color
      this.ui.setRule(`${rule.viaRaizin ? '⚡ ' : ''}${c.emoji} ${c.label}`, c.css)
      this.ui.setPrompt(`${c.emoji} ${c.label}のブロックをクリックして選ぼう`)
      this.state = STATE.SELECT
    }
  }

  /** 引き抜きをやめたときに、同じ条件の選択フェーズへ戻る */
  backToSelect() {
    this.applyHint()
    const r = this.rule
    if (!r) { this.enterRoulette(); return }
    if (r.kind === 'FREE') {
      this.state = STATE.SELECT_FREE
      this.ui.setPrompt('どの色でもOK！ 好きなブロックをクリックしよう')
    } else if (r.kind === 'DANGER') {
      this.state = STATE.SELECT_DANGER
      this.ui.setPrompt(`下${DANGER_LEVELS}段のブロックだけ抜ける！ 色は自由`)
    } else {
      this.state = STATE.SELECT
      this.ui.setPrompt(`${r.color.emoji} ${r.color.label}のブロックをクリックして選ぼう`)
    }
  }

  /** いま選べるブロック（ジェンガのルール＋そのターンの条件） */
  playableBlocks() {
    return this.tower.blocks.filter((b) => this.isPlayable(b))
  }

  isPlayable(block) {
    if (!this.rule) return false
    if (!this.tower.isSelectable(block)) return false
    if (this.rule.kind === 'FREE') return true
    if (this.rule.kind === 'DANGER') return block.level < DANGER_LEVELS
    return block.color.key === this.rule.color.key
  }

  /** 選べるブロックをひかえめに明るくする（強い発光はしない） */
  applyHint() {
    this.clearHint()
    // 🌈 はどれでも選べるので、強調しても意味がない
    if (!this.rule || this.rule.kind === 'FREE') return
    for (const b of this.playableBlocks()) {
      b.material.emissive.setHex(COLOR_HINT_EMISSIVE)
    }
  }

  clearHint() {
    if (!this.tower) return
    for (const b of this.tower.blocks) {
      if (b !== this.selected) b.material.emissive.setHex(0x000000)
    }
  }

  /** 選択フェーズかどうか（通常色・虹・黒で共通の入力処理を使う） */
  isSelectState() {
    return this.state === STATE.SELECT
      || this.state === STATE.SELECT_FREE
      || this.state === STATE.SELECT_DANGER
  }

  /** 対象外のブロックをクリックしたときの説明 */
  rejectReason(block) {
    if (!this.rule) return 'あれ…？'
    if (this.rule.kind === 'DANGER' && block.level >= DANGER_LEVELS) {
      return '下のほうだけみたい…'
    }
    if (this.rule.kind === 'COLOR' && block.color.key !== this.rule.color.key) {
      return '今回は、その色じゃないみたい…'
    }
    return 'その段は、まだかな…'
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
      if (this.state === STATE.GAMEOVER || this.state === STATE.COLOR_CHOICE) return
      if (this.state === STATE.TITLE || this.state === STATE.BOOK) return
      this.orbit.zoom(e.deltaY)
    }, { passive: false })

    window.addEventListener('keydown', (e) => {
      if (this.state === STATE.GAMEOVER) return
      if (e.key === 'Escape') this.cancel()
    })

    this.ui.onStart(() => this.startGame())
    this.ui.onBook(() => this.openBook())
    // 「もう一度遊ぶ」はタイトルを挟まずに新しいゲームを始める
    this.ui.onRetry(() => { this.reset(); this.startGame() })
  }

  setNdc(e) {
    this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1
    this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1
    return this.ndc
  }

  /** カーソルの下にある一番手前のブロック（色やルールは問わない） */
  pick(e) {
    this.raycaster.setFromCamera(this.setNdc(e), this.camera)
    const hits = this.raycaster.intersectObjects(this.tower.meshes(), false)
    return hits.length ? hits[0].object.userData.block || null : null
  }

  pickMarker(e) {
    if (!this.markers.length) return null
    this.raycaster.setFromCamera(this.setNdc(e), this.camera)
    const hits = this.raycaster.intersectObjects(this.markers.map((m) => m.mesh), false)
    return hits.length ? hits[0].object.userData.marker : null
  }

  onPointerDown(e) {
    // GAME OVER 中と ⚡ の色えらび中は、3D側の操作をすべて止める
    if (this.state === STATE.GAMEOVER || this.state === STATE.COLOR_CHOICE) return
    if (this.state === STATE.TITLE || this.state === STATE.INTRO || this.state === STATE.BOOK) return
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

    if (this.isSelectState() || this.state === STATE.PULLING) {
      const hit = this.pick(e)
      if (this.isSelectState() && hit) {
        if (this.isPlayable(hit)) {
          this.select(hit)
          this.beginDrag(e)
          return
        }
        // 条件に合わないブロックは動かさず、理由だけ伝える
        this.ui.say(this.rejectReason(hit), 1800)
        this.startOrbit(e)
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
    if (this.state === STATE.GAMEOVER || this.state === STATE.TITLE || this.state === STATE.BOOK) return
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

    // ホバー表示：抜けるブロックの上でだけ輪郭とカーソルを出す
    if (this.isSelectState()) {
      const raw = this.pick(e)
      const hit = raw && this.isPlayable(raw) ? raw : null
      if (hit !== this.hovered) {
        if (this.hovered && this.hovered !== this.selected) {
          this.hovered.outline.visible = false
        }
        this.hovered = hit
        if (hit) hit.outline.visible = true
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
      this.ui.say('もうちょっとかな…', 2200)
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

    this.clearHint()
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
    this.ui.say('それにする？', 1500)
    this.saidPulling = false
    this.ui.setPrompt('ドラッグして完全に引き抜こう')
  }

  deselect() {
    if (this.hovered && this.hovered !== this.selected) this.hovered.outline.visible = false
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

    // 引き抜きはじめに一度だけ声をかける
    if (!this.saidPulling && !this.canceling && this.actualPull() > 0.35) {
      this.saidPulling = true
      this.ui.say('そーっと…そーっと…', 2000)
    }

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
      this.backToSelect()
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
    this.ui.saySequence(['抜けた〜！', 'どこに置こうかな？'], 1500)
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
    this.settleShake = 0
    this.settleReacted = false
    this.state = STATE.SETTLING
  }

  /* ================= ターン進行 ================= */

  updateSettling(dt) {
    this.settleT += dt
    this.settleShake = Math.max(this.settleShake, this.tower.maxSpeed(null))

    // 揺れ具合を見てひとこと
    if (!this.settleReacted && this.settleT >= SETTLE_REACT_TIME) {
      this.settleReacted = true
      if (this.settleShake > 0.8) this.ui.say('おお…ちょっとどきどき…', 1600)
      else this.ui.say('やった〜！', 1400)
    }

    if (this.settleT < SETTLE_TIME) return

    this.score += 100
    this.turn++
    this.ui.setScore(this.score)

    const st = this.stats
    st.turns = this.turn
    st.score = this.score
    st.blocksPlaced = this.turn
    st.maxLevel = Math.max(st.maxLevel, this.topLevel)
    st.weatherTurns[this.weather.current.key]++
    if (this.weather.current.key === 'FOG'
      && this.weather.density > this.weather.targetDensity * 0.85) st.denseFogTurns++
    if (this.turnSlotKey) st.slotCleared[this.turnSlotKey]++
    if (this.pendingRecovery) { st.recoveries++; this.pendingRecovery = false }

    this.announceWeather(this.weather.roll())
  }

  updateWeatherChange(dt) {
    this.weatherT += dt
    if (this.weatherT < WEATHER_TIME) return

    if (this.weather.current.key === 'CLEAR') {
      const line = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)]
      this.ui.say(line, 2000)
    }
    // 天候 → ルーレット → ブロック選択、の順に進む
    this.enterRoulette()
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
    if (this.state === STATE.GAMEOVER) return
    this.state = STATE.GAMEOVER
    this.gameOverT = 0
    this.frozen = false
    // 掴んだままだと物理が止まらないので、手を離してから終了する
    this.exitPlacement()
    if (this.selected) setReleased(this.selected.body)
    this.deselect()
    this.dragging = false
    this.orbiting = false
    this.roulette.hide()
    this.ui.hideColorChoice()
    this.ui.setPrompt('')
    this.ui.setWindy(false)
    this.ui.saySequence(['わーーー！', 'くずれちゃった…！', 'でも、ここまでできたよ！'], 1700)
    const st = this.stats
    st.durationSec = (performance.now() - st.startedAt) / 1000
    st.finalShake = this.tower.maxSpeed(null)
    st.score = this.score
    st.turns = this.turn
    st.blocksPlaced = this.turn
    st.maxLevel = Math.max(st.maxLevel, this.topLevel)

    this.ui.showGameOver({
      score: this.score,
      blocks: this.turn,
      weather: this.weather.current,
      storms: st.weatherTurns.STORM,
    })

    // 称号を決めて図鑑に登録する
    const title = pickTitle(st)
    const isNew = unlock(title.id)
    this.lastTitle = title
    this.ui.revealTitle(title, isNew, () => {
      if (isNew) this.ui.saySequence(['お、新しい称号だ〜！', titleLine(title)], 1900)
      else this.ui.say(titleLine(title), 2600)
    })
  }

  /**
   * GAME OVER 中。
   * 操作・ルーレット・天候・スコア・ターン進行はすべて止まっている。
   * 崩れかけのタワーが空中で固まると不自然なので、落ち切るまでの
   * わずかな時間だけ物理を進めてから完全に凍結する。
   */
  updateGameOver(dt) {
    if (this.frozen) return

    this.gameOverT += dt
    this.world.step(1 / 120, dt, 6)
    this.tower.sync()

    const atRest = this.tower.maxSpeed(null) < 0.05
    if (atRest || this.gameOverT > GAMEOVER_FREEZE_TIME) {
      this.freezeTower()
    }
  }

  /** タワーを完全に停止させる（画面には残す） */
  freezeTower() {
    this.frozen = true
    for (const b of this.tower.blocks) {
      b.body.velocity.setZero()
      b.body.angularVelocity.setZero()
      b.body.sleep()
    }
    this.tower.sync()
  }

  /** 天候そのものへのリアクション（選択中で手が空いているときだけ） */
  checkWeatherTalk(dt) {
    this.weatherTalkCooldown -= dt
    if (!this.isSelectState()) return

    const w = this.weather
    if (w.current.key === 'FOG' && !this.fogSaid && w.density > w.targetDensity * 0.9) {
      this.fogSaid = true
      this.ui.say('これは…かなり真っ白…', 2200)
      return
    }
    if (w.current.key === 'WIND' && w.gustStrength > 0.8 && this.weatherTalkCooldown <= 0) {
      this.windTalkIndex = (this.windTalkIndex + 1) % WIND_TALK.length
      this.ui.say(WIND_TALK[this.windTalkIndex], 2000)
      this.weatherTalkCooldown = 9
    }
  }

  /** 大きく揺れたら雷神が反応する */
  checkDanger(dt) {
    this.dangerCooldown -= dt
    if (this.dangerCooldown > 0) return
    if (this.tower.maxSpeed(this.selected) > 1.3) {
      this.ui.say('わわわ…だいじょうぶかな…！', 2000)
      this.stats.dangerShakes++
      this.pendingRecovery = true
      this.dangerCooldown = 4.5
    }
  }

  /* ================= メインループ ================= */

  update(rawDt) {
    const dt = clamp(rawDt, 1 / 120, 1 / 20)

    // タイトル画面・図鑑のあいだは、天候もルーレットもスコアもターンも進めない
    if (this.state === STATE.TITLE || this.state === STATE.BOOK) {
      this.tower.sync()
      return
    }

    if (this.state === STATE.GAMEOVER) {
      this.updateGameOver(dt)
      return
    }

    switch (this.state) {
      case STATE.INTRO: this.updateIntro(dt); break
      case STATE.ROULETTE: this.updateRoulette(dt); break
      case STATE.COLOR_CHOICE: break // ボタンを押すまで待つ
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
      this.checkWeatherTalk(dt)
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
