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

/* --- 風 ---------------------------------------------------------- */
/** 1サイクル = 吹く時間 + 止む時間。止んでいる間にタワーが落ち着く */
const GUST_BLOW = 1.8
const GUST_CYCLE = 3.6
/** 重力に対する横向きの力の比率。1.0 で体重ぶんの横力（＝ほぼ確実に倒れる） */
const WIND_FORCE = 7.0
/** この高さで風の影響が最大になる。上のブロックほど強く受ける */
const WIND_REF_HEIGHT = 3.6
/** 風の線の本数 */
const STREAK_COUNT = 70

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function makeSoftTexture() {
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

    this.softTexture = makeSoftTexture()
    this.mist = []
    this.clouds = []
    this.buildMist()
    this.buildClouds()
    this.buildStreaks()

    this.windDir = new THREE.Vector2(1, 0)
    this.windAxis = new THREE.Vector2(1, 0)
    this.gustT = 0
    this.gustIndex = -1
    /** 0〜1。物理と見た目の両方でこの値を使う */
    this.gustStrength = 0
  }

  /* ---------------- 見た目のパーツ ---------------- */

  buildMist() {
    const group = new THREE.Group()
    // タワーを囲むように配置。手前側にも入るので「下の方が見づらい」感じになる
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.softTexture,
        color: 0x9fb0dd,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }))
      s.scale.set(9, 3.6, 1)
      s.position.set(Math.cos(a) * 3.2, 0.5 + (i % 2) * 0.7, Math.sin(a) * 3.2)
      s.renderOrder = 5
      group.add(s)
      this.mist.push(s)
    }
    this.mistGroup = group
    this.scene.add(group)
  }

  /** 夜空を流れる雲。風のときは速く流れる */
  buildClouds() {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.softTexture,
        color: 0x39406e,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        fog: false,
      }))
      s.scale.set(16 + Math.random() * 10, 5 + Math.random() * 3, 1)
      s.position.set(
        (Math.random() - 0.5) * 44,
        5 + Math.random() * 6,
        (Math.random() - 0.5) * 44
      )
      s.renderOrder = 1
      this.scene.add(s)
      this.clouds.push(s)
    }
  }

  /** 風の線。画面を横切る半透明のストリーク */
  buildStreaks() {
    const positions = new Float32Array(STREAK_COUNT * 2 * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.streakMaterial = new THREE.LineBasicMaterial({
      color: 0xcfe0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    })
    this.streaks = new THREE.LineSegments(geo, this.streakMaterial)
    this.streaks.frustumCulled = false
    this.streaks.renderOrder = 10
    this.scene.add(this.streaks)

    this.streakData = []
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakData.push({
        // 風向きに沿った位置（-9〜9）と、それに直交する位置
        along: (Math.random() - 0.5) * 18,
        side: (Math.random() - 0.5) * 11,
        y: 0.15 + Math.random() * 6.5,
        len: 0.5 + Math.random() * 2.0,
        speed: 5 + Math.random() * 9,
      })
    }
  }

  /* ---------------- 天候の切り替え ---------------- */

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
      this.windDir.copy(this.windAxis)
    } else {
      this.gustStrength = 0
    }
  }

  /* ---------------- 毎フレームの更新 ---------------- */

  update(dt, tower) {
    this.updateFog(dt)
    this.updateWind(dt, tower)
    this.updateStreaks(dt)
    this.updateClouds(dt)
  }

  updateFog(dt) {
    this.density += (this.targetDensity - this.density) * Math.min(1, dt * 1.6)
    this.scene.fog.density = this.density

    const k = clamp01((this.density - DENSITY_CLEAR) / (DENSITY_FOG - DENSITY_CLEAR))
    this.scene.background.copy(this.bgClear).lerp(this.bgFog, k)
    for (const s of this.mist) s.material.opacity = 0.32 * k
    if (k > 0.01) this.mistGroup.rotation.y += dt * 0.04
  }

  updateWind(dt, tower) {
    if (this.current.key !== 'WIND') {
      this.gustStrength += (0 - this.gustStrength) * Math.min(1, dt * 3)
      return
    }

    this.gustT += dt

    const index = Math.floor(this.gustT / GUST_CYCLE)
    if (index !== this.gustIndex) {
      this.gustIndex = index
      // 突風ごとに向きが反転する：弱い → 強い → 弱い → 逆から
      const sign = index % 2 === 0 ? 1 : -1
      this.windDir.copy(this.windAxis).multiplyScalar(sign)
    }

    const p = this.gustT % GUST_CYCLE
    // 0 → 1 → 0 のなめらかな強弱。吹いていない間は 0
    this.gustStrength = p < GUST_BLOW ? Math.sin((p / GUST_BLOW) * Math.PI) : 0
    if (this.gustStrength <= 0) return

    const force = new CANNON.Vec3()
    for (const b of tower.blocks) {
      const body = b.body
      if (body.type !== CANNON.Body.DYNAMIC) continue
      // 高いところほど強く受ける → タワーがしなるように揺れる
      const h = 0.15 + 0.85 * clamp01(body.position.y / WIND_REF_HEIGHT)
      const f = WIND_FORCE * this.gustStrength * h * body.mass
      force.set(this.windDir.x * f, 0, this.windDir.y * f)
      body.wakeUp()
      body.applyForce(force)
    }
  }

  updateStreaks(dt) {
    // 吹いていない間もうっすら流しておくと「風のターン」だと分かりやすい
    const vis = this.current.key === 'WIND' ? 0.25 + 0.75 * this.gustStrength : 0
    this.streakMaterial.opacity += (vis * 0.5 - this.streakMaterial.opacity) * Math.min(1, dt * 5)
    if (this.streakMaterial.opacity < 0.005) return

    const dx = this.windDir.x
    const dz = this.windDir.y
    // 風向きに直交する軸
    const sx = -dz
    const sz = dx

    const arr = this.streaks.geometry.attributes.position.array
    for (let i = 0; i < STREAK_COUNT; i++) {
      const s = this.streakData[i]
      s.along += s.speed * (0.35 + 0.65 * this.gustStrength) * dt
      if (s.along > 9) {
        s.along = -9
        s.side = (Math.random() - 0.5) * 11
        s.y = 0.15 + Math.random() * 6.5
      }
      const hx = dx * s.along + sx * s.side
      const hz = dz * s.along + sz * s.side
      const o = i * 6
      arr[o] = hx
      arr[o + 1] = s.y
      arr[o + 2] = hz
      arr[o + 3] = hx - dx * s.len
      arr[o + 4] = s.y
      arr[o + 5] = hz - dz * s.len
    }
    this.streaks.geometry.attributes.position.needsUpdate = true
  }

  updateClouds(dt) {
    const boost = this.current.key === 'WIND' ? 1 + 6 * this.gustStrength : 1
    const vx = this.windDir.x * 0.25 * boost
    const vz = this.windDir.y * 0.25 * boost
    for (const c of this.clouds) {
      c.position.x += vx * dt
      c.position.z += vz * dt
      if (Math.abs(c.position.x) > 30) c.position.x = -Math.sign(c.position.x) * 30
      if (Math.abs(c.position.z) > 30) c.position.z = -Math.sign(c.position.z) * 30
    }
  }

  dispose() {
    this.scene.remove(this.mistGroup)
    for (const s of this.mist) s.material.dispose()
    for (const c of this.clouds) { this.scene.remove(c); c.material.dispose() }
    this.scene.remove(this.streaks)
    this.streaks.geometry.dispose()
    this.streakMaterial.dispose()
    this.softTexture.dispose()
    this.mist = []
    this.clouds = []
  }
}
