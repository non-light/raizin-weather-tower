import * as THREE from 'three'
import './style.css'
import { Game } from './game.js'
import { UI } from './ui.js'

/* ---------------- renderer / scene ---------------- */

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 0.1, 200
)

/* ---------------- lights ---------------- */

scene.add(new THREE.HemisphereLight(0x5570b0, 0x090c1c, 0.75))

const key = new THREE.DirectionalLight(0xfff0c8, 1.5)
key.position.set(5, 9, 5)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
key.shadow.camera.left = -6
key.shadow.camera.right = 6
key.shadow.camera.top = 9
key.shadow.camera.bottom = -2
key.shadow.camera.near = 0.5
key.shadow.camera.far = 30
key.shadow.bias = -0.0012
scene.add(key)

// 雷神カラーのアクセント光
const accent = new THREE.PointLight(0xffd23f, 18, 14, 2)
accent.position.set(-3.5, 1.4, -2.5)
scene.add(accent)

/* ---------------- ground / sky ---------------- */

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(6, 6, 0.3, 64),
  new THREE.MeshStandardMaterial({ color: 0x141a3a, roughness: 0.9, metalness: 0.1 })
)
platform.position.y = -0.15
platform.receiveShadow = true
scene.add(platform)

const ring = new THREE.Mesh(
  new THREE.RingGeometry(5.4, 5.9, 64),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
)
ring.rotation.x = -Math.PI / 2
ring.position.y = 0.012
scene.add(ring)

// 星空
{
  const count = 700
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 45 + Math.random() * 25
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(Math.random() * 0.9)
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
    pos[i * 3 + 1] = r * Math.cos(ph) + 6
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const stars = new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true, fog: false })
  )
  scene.add(stars)
}

/* ---------------- camera orbit ---------------- */

function createOrbitCamera(cam) {
  const target = new THREE.Vector3(0, 1.8, 0)
  const s = { theta: Math.PI * 0.25, phi: Math.PI * 0.38, radius: 9 }
  let dragging = false
  let lx = 0
  let ly = 0
  const sph = new THREE.Spherical()

  function apply() {
    sph.set(s.radius, s.phi, s.theta)
    cam.position.setFromSpherical(sph).add(target)
    cam.lookAt(target)
  }
  apply()

  return {
    start(e) { dragging = true; lx = e.clientX; ly = e.clientY },
    move(e) {
      if (!dragging) return
      s.theta -= (e.clientX - lx) * 0.006
      s.phi -= (e.clientY - ly) * 0.005
      s.phi = Math.max(0.18, Math.min(Math.PI * 0.49, s.phi))
      lx = e.clientX
      ly = e.clientY
      apply()
    },
    end() { dragging = false },
    zoom(delta) {
      s.radius = Math.max(4.5, Math.min(20, s.radius + delta * 0.004))
      apply()
    },
    /** タワーが高くなったら注視点をゆっくり上げる */
    followY(y, dt) {
      const d = y - target.y
      if (Math.abs(d) < 0.001) return
      target.y += d * Math.min(1, dt * 1.2)
      apply()
    },
  }
}

const orbit = createOrbitCamera(camera)

/* ---------------- boot ---------------- */

const ui = new UI()
const game = new Game({ scene, camera, renderer, ui, orbit })

window.addEventListener('pointerup', () => orbit.end())

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

let last = performance.now()
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  const dt = (now - last) / 1000
  last = now
  game.update(dt)
  renderer.render(scene, camera)
}
loop()

/* デバッグ用。コンソールから __game で状態を覗ける。
   __step(n) は requestAnimationFrame が止まる状況でも手動で進められる。 */
window.__game = game
window.__step = (n = 60) => {
  for (let i = 0; i < n; i++) game.update(1 / 60)
  renderer.render(scene, camera)
  last = performance.now()
}
