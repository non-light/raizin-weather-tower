import * as THREE from 'three'
import * as CANNON from 'cannon-es'

/* ------------------------------------------------------------------
 * ブロック寸法とタワー構成
 * 長辺 len は 幅 wid の 3 倍 = 1段(3本)ぶんの幅とぴったり合う
 * ------------------------------------------------------------------ */
export const BLOCK = { len: 1.5, wid: 0.5, hei: 0.3 }
export const LEVELS = 12
export const MASS = 2.0

/** 段どうし・ブロックどうしの隙間。0 だと初期状態でめり込んで暴れる */
const GAP_Y = 0.001
const GAP_X = 0.005

export const levelY = (level) => BLOCK.hei / 2 + level * (BLOCK.hei + GAP_Y)
export const slotOffset = (slot) => (slot - 1) * (BLOCK.wid + GAP_X)
/** 偶数段は長辺X向き / 奇数段は長辺Z向き */
export const levelAxis = (level) => (level % 2 === 0 ? 'x' : 'z')

/** その段・その位置のブロックが収まるべき姿勢 */
export function slotTransform(level, slot) {
  const axis = levelAxis(level)
  const off = slotOffset(slot)
  const pos = new CANNON.Vec3(
    axis === 'x' ? 0 : off,
    levelY(level),
    axis === 'x' ? off : 0
  )
  const quat = new CANNON.Quaternion()
  if (axis === 'z') quat.setFromEuler(0, Math.PI / 2, 0)
  return { pos, quat, axis }
}

/* ------------------------------------------------------------------
 * 物理マテリアル
 *   wood : 積まれているブロック同士。積み上がりが安定する程度に摩擦は強め
 *   slip : プレイヤーが掴んでいるブロック。摩擦を弱くしないと、引き抜くときに
 *          周りのブロックまで一緒に持っていってしまう
 * ------------------------------------------------------------------ */
export const woodMaterial = new CANNON.Material('wood')
export const slipMaterial = new CANNON.Material('slip')
const groundMaterial = new CANNON.Material('ground')

/* ------------------------------------------------------------------
 * 物理ワールド
 * ------------------------------------------------------------------ */
export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true

  // 反復回数を多めにして、積み上がったブロックがじわじわ沈まないようにする
  world.solver.iterations = 40
  world.solver.tolerance = 0.0005

  // 接触のバネを固くしすぎると、積み上がったブロックが高周波で振動して
  // タワー上部が勝手に暴れだす。柔らかめ + 緩和多めが安定する
  const stiff = {
    restitution: 0,
    contactEquationStiffness: 4e6,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 4e6,
    frictionEquationRelaxation: 3,
  }

  const dc = world.defaultContactMaterial
  dc.friction = 0.6
  Object.assign(dc, stiff)
  world.addContactMaterial(new CANNON.ContactMaterial(woodMaterial, woodMaterial, { ...stiff, friction: 0.62 }))
  world.addContactMaterial(new CANNON.ContactMaterial(woodMaterial, groundMaterial, { ...stiff, friction: 0.8 }))
  // 掴んでいるブロックはほぼ摩擦ゼロ。0.08 でも接触点が多いと引き抜けなくなる
  world.addContactMaterial(new CANNON.ContactMaterial(slipMaterial, woodMaterial, { ...stiff, friction: 0.0 }))
  world.addContactMaterial(new CANNON.ContactMaterial(slipMaterial, groundMaterial, { ...stiff, friction: 0.1 }))

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMaterial })
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(ground)

  return world
}

/**
 * プレイヤーが掴んでいる状態。
 * キネマティック（＝質量無限）にすると、周りのブロックを押しのける力が
 * 無限大になってタワーが暴れるので、あくまで動的ボディのまま速度で動かす。
 * 回転だけロックして、引き抜き中に転がらないようにする。
 */
export function setGrabbed(body) {
  body.material = slipMaterial
  body.type = CANNON.Body.DYNAMIC
  body.mass = MASS
  body.fixedRotation = true
  body.updateMassProperties()
  body.allowSleep = false
  body.angularVelocity.setZero()
  body.wakeUp()
}

/** 掴むのをやめて、普通のブロックに戻す */
export function setReleased(body) {
  body.material = woodMaterial
  body.type = CANNON.Body.DYNAMIC
  body.mass = MASS
  body.fixedRotation = false
  body.updateMassProperties()
  body.allowSleep = true
  body.wakeUp()
}

/** 上へ運ぶあいだだけ、当たり判定を切って強制的に動かす */
export function setKinematic(body) {
  body.material = slipMaterial
  body.type = CANNON.Body.KINEMATIC
  body.mass = 0
  body.fixedRotation = false
  body.updateMassProperties()
  body.allowSleep = false
  body.velocity.setZero()
  body.angularVelocity.setZero()
  body.wakeUp()
}

/** ボディを物理演算に戻す */
export function setDynamic(body) {
  body.material = woodMaterial
  body.type = CANNON.Body.DYNAMIC
  body.mass = MASS
  body.fixedRotation = false
  body.updateMassProperties()
  body.allowSleep = true
  body.velocity.setZero()
  body.angularVelocity.setZero()
  body.wakeUp()
}

/* ------------------------------------------------------------------
 * タワー本体
 * ------------------------------------------------------------------ */
export class Tower {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.blocks = []

    this.geometry = new THREE.BoxGeometry(BLOCK.len, BLOCK.hei, BLOCK.wid)
    this.edgesGeometry = new THREE.EdgesGeometry(this.geometry)
    this.shape = new CANNON.Box(
      new CANNON.Vec3(BLOCK.len / 2, BLOCK.hei / 2, BLOCK.wid / 2)
    )

    this.group = new THREE.Group()
    scene.add(this.group)

    this.build()
    this.presettle()
  }

  /**
   * ゲーム開始前に物理を少し進めて、初期のガタつきを消しておく。
   * 沈み込んだぶんの高さは活かしつつ、横位置と向きは理想値へ揃え直すことで、
   * 見た目がきれいに整ったタワーから始められる。
   */
  presettle(steps = 90) {
    for (let i = 0; i < steps; i++) this.world.step(1 / 120)

    for (const b of this.blocks) {
      const { pos, quat } = slotTransform(b.level, b.slot)
      b.body.position.x = pos.x
      b.body.position.z = pos.z
      b.body.quaternion.copy(quat)
      b.body.velocity.setZero()
      b.body.angularVelocity.setZero()
    }
    // 揃え直した状態でもう一度落ち着かせてから眠らせる
    for (let i = 0; i < 30; i++) this.world.step(1 / 120)
    for (const b of this.blocks) {
      b.body.velocity.setZero()
      b.body.angularVelocity.setZero()
      b.body.sleep()
    }
    this.sync()
  }

  build() {
    for (let level = 0; level < LEVELS; level++) {
      for (let slot = 0; slot < 3; slot++) {
        this.addBlock(level, slot)
      }
    }
  }

  addBlock(level, slot) {
    const { pos, quat, axis } = slotTransform(level, slot)

    // 木目風に少しだけ色をばらつかせる
    const shade = 0.88 + Math.random() * 0.24
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xc99a52).multiplyScalar(shade),
      roughness: 0.75,
      metalness: 0.05,
      emissive: 0x000000,
    })

    const mesh = new THREE.Mesh(this.geometry, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.position.set(pos.x, pos.y, pos.z)
    mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)

    // 選択中の輪郭。depthTest を切って、ブロックに隠れても必ず見えるようにする
    const outline = new THREE.LineSegments(
      this.edgesGeometry,
      new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true })
    )
    outline.scale.set(1.02, 1.08, 1.05)
    outline.renderOrder = 999
    outline.visible = false
    mesh.add(outline)

    this.group.add(mesh)

    const body = new CANNON.Body({
      mass: MASS,
      shape: this.shape,
      position: pos.clone(),
      quaternion: quat.clone(),
      material: woodMaterial,
    })
    // 落ち着いたら眠らせる。眠っている間はまったくズレないので
    // タワーが長時間かけて崩れていくのを防げる
    body.allowSleep = true
    body.sleepSpeedLimit = 0.22
    body.sleepTimeLimit = 0.35
    body.linearDamping = 0.28
    body.angularDamping = 0.35
    this.world.addBody(body)

    const block = { mesh, body, outline, material: mat, level, slot, axis }
    mesh.userData.block = block
    this.blocks.push(block)
    return block
  }

  /** 最上段の情報（ジェンガのルール上、抜いてはいけない段の判定に使う） */
  topInfo() {
    let maxLevel = 0
    for (const b of this.blocks) maxLevel = Math.max(maxLevel, b.level)
    const countAtMax = this.blocks.filter((b) => b.level === maxLevel).length
    return { maxLevel, countAtMax }
  }

  /** 抜いてよいブロックか（最上段と、未完成な最上段のひとつ下は不可） */
  isSelectable(block) {
    const { maxLevel, countAtMax } = this.topInfo()
    if (block.level === maxLevel) return false
    if (countAtMax < 3 && block.level === maxLevel - 1) return false
    return true
  }

  meshes() {
    return this.blocks.map((b) => b.mesh)
  }

  /** 物理 → 表示 の反映 */
  sync() {
    for (const b of this.blocks) {
      b.mesh.position.copy(b.body.position)
      b.mesh.quaternion.copy(b.body.quaternion)
    }
  }

  wakeAll() {
    for (const b of this.blocks) b.body.wakeUp()
  }

  /** 一番速く動いているブロックの速さ（ぐらつき検出用） */
  maxSpeed(exclude) {
    let m = 0
    for (const b of this.blocks) {
      if (b === exclude) continue
      m = Math.max(m, b.body.velocity.length())
    }
    return m
  }

  dispose() {
    for (const b of this.blocks) {
      this.world.removeBody(b.body)
      b.material.dispose()
      b.outline.material.dispose()
    }
    this.scene.remove(this.group)
    this.geometry.dispose()
    this.edgesGeometry.dispose()
    this.blocks = []
  }
}
