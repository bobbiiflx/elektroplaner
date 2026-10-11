import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { cableType, deviceType } from '../config/catalog'
import { elevationOf } from '../lib/factory'
import { boundsOf, cableLengths, pointOnWall, wallAngleDeg, wallDir, wallLength, wallNormal } from '../lib/geom'
import { horizontalBands, verticalSpans } from '../lib/zones'
import { useStore } from '../store'
import type { Cable, Device, Floor, Opening, Project, Wall } from '../types'

const ACCENT = '#0071e3'
const mm = (v: number) => v / 1000

function useDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia('(prefers-color-scheme: dark)')
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
}

// ---------------------------------------------------------------------------
// Wand
// ---------------------------------------------------------------------------
function WallMesh({
  wall,
  openings,
  height,
  selected,
  opacity,
  interactive,
  dark,
  onSelect,
}: {
  wall: Wall
  openings: Opening[]
  height: number
  selected: boolean
  opacity: number
  interactive: boolean
  dark: boolean
  onSelect: () => void
}) {
  const t = wall.thickness
  const L = wallLength(wall)

  const { geo, edges } = useMemo(() => {
    const total = L + t
    const H = height
    const hs = H - 10
    const sorted = [...openings].sort((a, b) => a.offset - b.offset)
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    for (const o of sorted) {
      if (o.sill > 0.5) continue
      const x0 = mm(o.offset + t / 2)
      const x1 = mm(o.offset + t / 2 + o.width)
      const y1 = mm(Math.min(o.height, hs))
      shape.lineTo(x0, 0)
      shape.lineTo(x0, y1)
      shape.lineTo(x1, y1)
      shape.lineTo(x1, 0)
    }
    shape.lineTo(mm(total), 0)
    shape.lineTo(mm(total), mm(H))
    shape.lineTo(0, mm(H))
    shape.closePath()
    for (const o of sorted) {
      if (o.sill <= 0.5) continue
      const x0 = mm(o.offset + t / 2)
      const x1 = mm(o.offset + t / 2 + o.width)
      const y0 = mm(o.sill)
      const y1 = mm(Math.min(o.sill + o.height, hs))
      if (y1 <= y0) continue
      const hole = new THREE.Path()
      hole.moveTo(x0, y0)
      hole.lineTo(x1, y0)
      hole.lineTo(x1, y1)
      hole.lineTo(x0, y1)
      hole.closePath()
      shape.holes.push(hole)
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: mm(t), bevelEnabled: false })
    g.translate(0, 0, -mm(t) / 2)
    return { geo: g, edges: new THREE.EdgesGeometry(g, 25) }
  }, [L, t, height, openings])

  const d = wallDir(wall)
  const pos: [number, number, number] = [mm(wall.a.x - (d.x * t) / 2), 0, mm(wall.a.y - (d.y * t) / 2)]
  const rotY = (-wallAngleDeg(wall) * Math.PI) / 180

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <mesh
        geometry={geo}
        onClick={interactive ? (e) => (e.stopPropagation(), onSelect()) : undefined}
        raycast={interactive ? undefined : () => null}
      >
        <meshStandardMaterial
          color={selected ? ACCENT : dark ? '#8e8e93' : '#f2f2f4'}
          roughness={0.95}
          metalness={0}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity >= 1}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={selected ? '#0a4ea3' : dark ? '#1c1c1e' : '#8e8e93'} transparent opacity={0.55 * Math.max(opacity, 0.4)} />
      </lineSegments>
      {openings
        .filter((o) => o.type === 'window')
        .map((o) => (
          <mesh
            key={o.id}
            position={[mm(o.offset + t / 2 + o.width / 2), mm(o.sill + o.height / 2), 0]}
            raycast={() => null}
          >
            <boxGeometry args={[mm(o.width), mm(Math.min(o.height, height - 10)), 0.02]} />
            <meshStandardMaterial color="#8ec5ff" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Installationszonen als halbtransparente Bänder
// ---------------------------------------------------------------------------
function ZoneOverlay({ floor, project }: { floor: Floor; project: Project }) {
  const zones = project.settings.zones
  return (
    <>
      {floor.walls.map((w) => {
        const L = wallLength(w)
        const H = w.height ?? floor.wallHeight
        const bands = horizontalBands(zones, H)
        const spans = verticalSpans(w, floor.openings, zones)
        const rotY = (-wallAngleDeg(w) * Math.PI) / 180
        return (
          <group key={w.id} position={[mm(w.a.x), 0, mm(w.a.y)]} rotation={[0, rotY, 0]}>
            {([1, -1] as const).map((side) => {
              const z = side * mm(w.thickness / 2 + 3)
              return (
                <group key={side}>
                  {bands.map((b) => (
                    <mesh key={b.id} position={[mm(L / 2), mm(b.center), z]} raycast={() => null}>
                      <planeGeometry args={[mm(L), mm(zones.width)]} />
                      <meshBasicMaterial color="#30d158" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
                    </mesh>
                  ))}
                  {spans.map(([s0, s1], i) => (
                    <mesh key={i} position={[mm((s0 + s1) / 2), mm(H / 2), z]} raycast={() => null}>
                      <planeGeometry args={[mm(s1 - s0), mm(H)]} />
                      <meshBasicMaterial color="#ff9f0a" transparent opacity={0.26} side={THREE.DoubleSide} depthWrite={false} />
                    </mesh>
                  ))}
                </group>
              )
            })}
          </group>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Gerät
// ---------------------------------------------------------------------------
function DeviceMesh({
  device,
  floor,
  selected,
  interactive,
  elevation,
  onSelect,
}: {
  device: Device
  floor: Floor
  selected: boolean
  interactive: boolean
  elevation: number
  onSelect: () => void
}) {
  const w = floor.walls.find((x) => x.id === device.wallId)
  if (!w) return null
  const dt = deviceType(device.typeId)
  const c = pointOnWall(w, device.offset)
  const n = wallNormal(w)
  const off = w.thickness / 2 + dt.d / 2
  const pos: [number, number, number] = [
    mm(c.x + n.x * device.side * off),
    mm(elevation + device.height),
    mm(c.y + n.y * device.side * off),
  ]
  const rotY = (-wallAngleDeg(w) * Math.PI) / 180
  const k = selected ? 1.15 : 1
  return (
    <mesh
      position={pos}
      rotation={[0, rotY, 0]}
      scale={[k, k, k]}
      onClick={interactive ? (e) => (e.stopPropagation(), onSelect()) : undefined}
      raycast={interactive ? undefined : () => null}
    >
      <boxGeometry args={[mm(dt.w), mm(dt.h), mm(dt.d)]} />
      <meshStandardMaterial color={selected ? ACCENT : dt.color} roughness={0.6} emissive={selected ? ACCENT : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Leitung (immer sichtbar, auch durch Wände hindurch)
// ---------------------------------------------------------------------------
function CableLine({
  cable,
  elevation,
  selected,
  interactive,
  opacity,
  onSelect,
}: {
  cable: Cable
  elevation: number
  selected: boolean
  interactive: boolean
  opacity: number
  onSelect: () => void
}) {
  const ct = cableType(cable.typeId)
  const pts = useMemo(
    () => cable.points.map((p) => new THREE.Vector3(mm(p.x), mm(elevation + p.z), mm(p.y))),
    [cable.points, elevation],
  )
  if (pts.length < 2) return null
  return (
    <group renderOrder={10}>
      <Line
        points={pts}
        color={ct.color}
        lineWidth={selected ? 5 : 3}
        transparent
        opacity={opacity}
        depthTest={false}
        onClick={interactive ? (e) => (e.stopPropagation(), onSelect()) : undefined}
        raycast={interactive ? undefined : () => null}
      />
      {selected &&
        pts.map((p, i) => (
          <mesh key={i} position={p} renderOrder={11} raycast={() => null}>
            <sphereGeometry args={[0.025, 12, 12]} />
            <meshBasicMaterial color={ct.color} depthTest={false} />
          </mesh>
        ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Geschoss
// ---------------------------------------------------------------------------
function FloorModel({
  project,
  floor,
  index,
  active,
  dark,
}: {
  project: Project
  floor: Floor
  index: number
  active: boolean
  dark: boolean
}) {
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const showZones = useStore((s) => s.showZones)
  const ghostWalls = useStore((s) => s.ghostWalls)
  const elevation = elevationOf(project, index)
  const opacity = active ? (ghostWalls ? 0.35 : 1) : 0.3

  const slab = useMemo(() => {
    const b = boundsOf(floor.walls.flatMap((w) => [w.a, w.b]))
    if (!b) return null
    const pad = 300
    const thick = Math.max(100, floor.levelHeight - floor.wallHeight)
    return {
      pos: [mm((b.minX + b.maxX) / 2), mm(elevation - thick / 2), mm((b.minY + b.maxY) / 2)] as [number, number, number],
      size: [mm(b.maxX - b.minX + pad * 2), mm(thick), mm(b.maxY - b.minY + pad * 2)] as [number, number, number],
    }
  }, [floor.walls, floor.levelHeight, floor.wallHeight, elevation])

  return (
    <group>
      {slab && (
        <mesh position={slab.pos} raycast={() => null}>
          <boxGeometry args={slab.size} />
          <meshStandardMaterial color={dark ? '#3a3a3c' : '#e5e5ea'} roughness={1} transparent={!active} opacity={active ? 1 : 0.3} />
        </mesh>
      )}
      <group position={[0, mm(elevation), 0]}>
        {floor.walls.map((w) => (
          <WallMesh
            key={w.id}
            wall={w}
            openings={floor.openings.filter((o) => o.wallId === w.id)}
            height={w.height ?? floor.wallHeight}
            selected={selection?.kind === 'wall' && selection.id === w.id}
            opacity={opacity}
            interactive={active}
            dark={dark}
            onSelect={() => select({ kind: 'wall', id: w.id })}
          />
        ))}
      </group>
      {floor.devices.map((d) => (
        <DeviceMesh
          key={d.id}
          device={d}
          floor={floor}
          elevation={elevation}
          selected={selection?.kind === 'device' && selection.id === d.id}
          interactive={active}
          onSelect={() => select({ kind: 'device', id: d.id })}
        />
      ))}
      {floor.cables.map((c) => (
        <CableLine
          key={c.id}
          cable={c}
          elevation={elevation}
          selected={selection?.kind === 'cable' && selection.id === c.id}
          interactive={active}
          opacity={active ? 1 : 0.35}
          onSelect={() => select({ kind: 'cable', id: c.id })}
        />
      ))}
      {active && showZones && (
        <group position={[0, mm(elevation), 0]}>
          <ZoneOverlay floor={floor} project={project} />
        </group>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Kamera
// ---------------------------------------------------------------------------
interface FitData {
  center: [number, number, number]
  radius: number
}

function CameraRig({ fitRef, trigger, preset }: { fitRef: React.RefObject<FitData>; trigger: string; preset: 'iso' | 'top' }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const size = useThree((s) => s.size)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const sized = size.width > 10 && size.height > 10
  useEffect(() => {
    if (!controls || !sized) return
    const { center, radius } = fitRef.current
    const { width, height } = sizeRef.current
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (width / height))
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.1
    const target = new THREE.Vector3(...center)
    const dir = preset === 'top' ? new THREE.Vector3(0, 1, 0.02) : new THREE.Vector3(0.75, 0.7, 1)
    dir.normalize()
    camera.position.copy(target).addScaledVector(dir, dist)
    controls.target.copy(target)
    controls.update()
  }, [trigger, preset, controls, camera, fitRef, sized])
  return null
}

// ---------------------------------------------------------------------------
export default function View3D() {
  const project = useStore((s) => s.project)
  const activeFloorId = useStore((s) => s.activeFloorId)
  const showAll = useStore((s) => s.showAllFloors)
  const showZones = useStore((s) => s.showZones)
  const ghostWalls = useStore((s) => s.ghostWalls)
  const toggleZones = useStore((s) => s.toggleZones)
  const toggleAll = useStore((s) => s.toggleAllFloors)
  const toggleGhost = useStore((s) => s.toggleGhostWalls)
  const select = useStore((s) => s.select)
  const dark = useDark()
  const [preset, setPreset] = useState<'iso' | 'top'>('iso')
  const [nonce, setNonce] = useState(0)

  const activeIdx = Math.max(0, project.floors.findIndex((f) => f.id === activeFloorId))
  const active = project.floors[activeIdx]

  const fit = useMemo<FitData>(() => {
    const pts = active.walls.flatMap((w) => [w.a, w.b])
    const b = boundsOf(pts)
    const elev = mm(elevationOf(project, activeIdx))
    const H = mm(active.wallHeight)
    if (!b) return { center: [3, elev + H / 2, 2.5], radius: 4 }
    const dx = mm(b.maxX - b.minX)
    const dz = mm(b.maxY - b.minY)
    return {
      center: [mm((b.minX + b.maxX) / 2), elev + H / 2, mm((b.minY + b.maxY) / 2)],
      radius: Math.max(1.5, 0.5 * Math.sqrt(dx * dx + dz * dz + H * H)),
    }
  }, [active.walls, active.wallHeight, project, activeIdx])
  const fitRef = useRef(fit)
  fitRef.current = fit

  const trigger = `${project.id}|${active.id}|${active.walls.length > 0}|${nonce}`

  return (
    <div className="view3d">
      <Canvas camera={{ fov: 38, near: 0.05, far: 400, position: [8, 7, 9] }} dpr={[1, 2]} onPointerMissed={() => select(null)}>
        <color attach="background" args={[dark ? '#1c1c1e' : '#f5f5f7']} />
        <ambientLight intensity={dark ? 0.9 : 1.1} />
        <directionalLight position={[8, 12, 6]} intensity={dark ? 1.4 : 1.6} />
        <directionalLight position={[-6, 5, -8]} intensity={0.5} />
        <gridHelper args={[60, 60, dark ? '#48484a' : '#d1d1d6', dark ? '#2c2c2e' : '#e5e5ea']} position={[0, -0.34, 0]} raycast={() => null} />
        {project.floors.map((f, i) =>
          showAll || i === activeIdx ? <FloorModel key={f.id} project={project} floor={f} index={i} active={i === activeIdx} dark={dark} /> : null,
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.499} />
        <CameraRig fitRef={fitRef} trigger={trigger} preset={preset} />
      </Canvas>

      <div className="view3d-bar glass">
        <button className={preset === 'iso' ? 'chip on' : 'chip'} onClick={() => (setPreset('iso'), setNonce((n) => n + 1))}>
          3D
        </button>
        <button className={preset === 'top' ? 'chip on' : 'chip'} onClick={() => (setPreset('top'), setNonce((n) => n + 1))}>
          Oben
        </button>
        <span className="sep" />
        <button className={showZones ? 'chip on' : 'chip'} onClick={toggleZones} title="Installationszonen nach DIN 18015-3 anzeigen">
          Zonen
        </button>
        <button className={ghostWalls ? 'chip on' : 'chip'} onClick={toggleGhost} title="Wände durchsichtig">
          Transparent
        </button>
        {project.floors.length > 1 && (
          <button className={showAll ? 'chip on' : 'chip'} onClick={toggleAll} title="Alle Geschosse anzeigen">
            Alle Geschosse
          </button>
        )}
      </div>
      <Legend project={project} floor={active} />
    </div>
  )
}

function Legend({ project, floor }: { project: Project; floor: Floor }) {
  const used = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of floor.cables) map.set(c.typeId, (map.get(c.typeId) ?? 0) + cableLengths(c.points).total)
    return [...map.entries()]
  }, [floor.cables])
  if (!used.length || project.floors.length < 1) return null
  return (
    <div className="legend glass">
      {used.map(([id, len]) => {
        const ct = cableType(id)
        return (
          <div key={id} className="legend-item">
            <span className="dot" style={{ background: ct.color }} />
            <span>{ct.name}</span>
            <span className="muted">{(len / 1000).toFixed(1).replace('.', ',')} m</span>
          </div>
        )
      })}
    </div>
  )
}
