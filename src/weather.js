import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export const WEATHERS = {
  CLEAR: {
    key: 'CLEAR',
    icon: '☀️',
    label: '晴れ',
    line: '今日はいい天気だぞ！ どんどん抜こう！',
  },
  FOG: {
    key: 'FOG',
    icon: '🌫️',
    label: '霧',
    line: '霧が出てきたぞ……見えるかな？',
  },
  WIND: {
    key: 'WIND',
    icon: '💨',
    label: '風',
    line: '風が強くなってきたぞ！',
  },
}

const WEATHER_LIST = [WEATHERS.CLEAR, WEATHERS.FOG, WEATHERS.WIND]

const BG_CLEAR = 0x070b1e
const BG_FOG = 0x232a4d
const FOG_COLOR = 0x39406b
const DENSITY_CLEAR = 0.012
const DENSITY_FOG = 0.07

/** 風：1サイクル = 吹く時間 + 止む時間。止んでいる間にタワーが落ち着く */
const GUST_BLOW = 1.4
const GUST_CYCLE = 3.4
/** 重力に対する横向きの力の比率。0.3 = 体重の 3 割ぶんの横風 */
const WIND_FORCE = 4.5
/** この高さで風の影響が最大になる */
const WIND_REF_HEIGHT = 3.6

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function makeMistTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

export class Weather {
  constructor(scene) {
    this.scene = scene
    this.current = WEATHERS.CLEAR

    this.bgClear = new THREE.Color(BG_CLEAR)
    this.bgFog = new THREE.Color(BG_FOG)
    scene.background = new THREE.Color(BG_CLEAR)
    scene.fog = new THREE.FogExp2(FOG_COLOR, DENSITY_CLEAR)

    this.density = DENSITY_CLEAR
    this.targetDensity = DENSITY_CLEAR

    this.mist = []
    this.buildMist()

    this.windDir = new THREE.Vector2(1, 0)
    this.windAxis = new THREE.Vector2(1, 0)
    this.gustT = 0
    this.gustIndex = -1
  }

  buildMist() {
    const tex = makeMistTexture()
    this.mistTexture = tex
    const group = new THREE.Group()
    // タワーを囲むように配置。手前側にも入るので「下の方が見づらい」感じになる
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0x9fb0dd,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const s = new THREE.Sprite(mat)
      s.scale.set(9, 3.6, 1)
      s.position.set(Math.cos(a) * 3.2, 0.5 + (i % 2) * 0.7, Math.sin(a) * 3.2)
      s.renderOrder = 5
      group.add(s)
      this.mist.push(s)
    }
    this.mistGroup = group
    this.scene.add(group)
  }

  /** 次のターンの天候を抽選（同じ天候の連続は避ける） */
  roll() {
    const pool = WEATHER_LIST.filter((w) => w.key !== this.current.key)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  set(weather, instant = false) {
    this.current = weather
    this.targetDensity = weather.key === 'FOG' ? DENSITY_FOG : DENSITY_CLEAR
    if (instant) this.density = this.targetDensity

    if (weather.key === 'WIND') {
      this.gustT = 0
      this.gustIndex = -1
      // 風向きの軸はターンごとにランダム。突風は左右交互に吹かせて、
      // タワーが一方向に流されずに「ゆら……ゆら……」と揺れるようにする
      const a = Math.random() * Math.PI * 2
      this.windAxis.set(Math.cos(a), Math.sin(a))
    }
  }

  update(dt, tower) {
    // --- 霧の濃さ・背景色・ミストスプライトをなめらかに補間 ---
    this.density += (this.targetDensity - this.density) * Math.min(1, dt * 1.6)
    this.scene.fog.density = this.density

    const k = clamp01((this.density - DENSITY_CLEAR) / (DENSITY_FOG - DENSITY_CLEAR))
    this.scene.background.copy(this.bgClear).lerp(this.bgFog, k)
    for (const s of this.mist) s.material.opacity = 0.32 * k

    if (k > 0.01) {
      this.mistGroup.rotation.y += dt * 0.04
    }

    // --- 風 ---
    if (this.current.key === 'WIND') this.applyWind(dt, tower)
  }

  applyWind(dt, tower) {
    this.gustT += dt

    const index = Math.floor(this.gustT / GUST_CYCLE)
    if (index !== this.gustIndex) {
      this.gustIndex = index
      const sign = index % 2 === 0 ? 1 : -1
      this.windDir.copy(this.windAxis).multiplyScalar(sign)
    }

    const p = this.gustT % GUST_CYCLE
    if (p > GUST_BLOW) return // 突風の合間。ここでタワーが落ち着く

    // 0 → 1 → 0 のなめらかな強弱
    const env = Math.sin((p / GUST_BLOW) * Math.PI)
    const force = new CANNON.Vec3()

    for (const b of tower.blocks) {
      const body = b.body
      if (body.type !== CANNON.Body.DYNAMIC) continue
      // 高いところほど強く受ける → タワーがしなるように揺れる
      const h = 0.2 + 0.8 * clamp01(body.position.y / WIND_REF_HEIGHT)
      const f = WIND_FORCE * env * h * body.mass
      force.set(this.windDir.x * f, 0, this.windDir.y * f)
      body.wakeUp()
      body.applyForce(force)
    }
  }

  dispose() {
    this.scene.remove(this.mistGroup)
    for (const s of this.mist) s.material.dispose()
    this.mistTexture.dispose()
    this.mist = []
  }
}
