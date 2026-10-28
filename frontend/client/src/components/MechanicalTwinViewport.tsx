import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  canCreateWebGL2Context,
  reserveWebGLCanvas,
} from "./PhysicalDroneModel";
import {
  transformedPartVertices,
  type MechanicalModel,
  type MechanicalPart,
} from "../lib/mechanicalTwinGeometry";

export type MechanicalView = "iso" | "top" | "front" | "side";
export type MechanicalRender = "solid" | "wireframe" | "xray";
export type XrayLayerState = Record<string, number>;
type Props = {
  model: MechanicalModel;
  selected: string;
  onSelect: (id: string) => void;
  view: MechanicalView;
  mode: MechanicalRender;
  explosion: number;
  resetKey: number;
  forceVector?: boolean;
  xrayCut: number;
  xrayOpacity: XrayLayerState;
  xrayIsolatedLayer?: string;
  kinematicsPlaying?: boolean;
};
const directions: Record<MechanicalView, [number, number, number]> = {
  iso: [1.2, 0.85, 1.45],
  top: [0, 2, 0.001],
  front: [0, 0.001, 2],
  side: [2, 0.001, 0],
};

function CameraRig({
  model,
  view,
  resetKey,
}: Pick<Props, "model" | "view" | "resetKey">) {
  const { camera, invalidate, controls } = useThree();
  useEffect(() => {
    const d = directions[view];
    const extent = Math.max(0.5, model.extent);
    camera.position.set(d[0] * extent, d[1] * extent, d[2] * extent);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = extent / 1000;
      camera.far = extent * 100;
      camera.updateProjectionMatrix();
    }
    if (controls && "target" in controls) {
      (
        controls as unknown as { target: THREE.Vector3; update: () => void }
      ).target.set(0, 0, 0);
      (controls as unknown as { update: () => void }).update();
    }
    invalidate();
  }, [
    view,
    resetKey,
    model.designId,
    model.extent,
    camera,
    controls,
    invalidate,
  ]);
  return null;
}
function MechanicalMesh({
  part,
  selected,
  onSelect,
  mode,
  explosion,
  xrayCut,
  xrayOpacity,
  xrayIsolatedLayer,
  kinematicsPlaying = false,
}: {
  part: MechanicalPart;
  selected: boolean;
  onSelect: (id: string) => void;
  mode: MechanicalRender;
  explosion: number;
  xrayCut: number;
  xrayOpacity: XrayLayerState;
  xrayIsolatedLayer?: string;
  kinematicsPlaying?: boolean;
}) {
  const pivotRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        transformedPartVertices(part, explosion),
        3,
      ),
    );
    g.setIndex(part.indices);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const center = g.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    g.translate(-center.x, -center.y, -center.z);
    g.userData.pivotCenter = center.toArray();
    return g;
  }, [part, explosion]);
  const pivotCenter = geometry.userData.pivotCenter as [number, number, number] | undefined;
  const isRotorBlade = /propeller-|cyclo-blade-|rotor-blade-/i.test(part.id);
  useFrame(({ clock }) => {
    if (!pivotRef.current) return;
    pivotRef.current.rotation.y = kinematicsPlaying && isRotorBlade ? clock.elapsedTime * 18 : 0;
  });
  const edges = useMemo(
    () => new THREE.EdgesGeometry(geometry, 28),
    [geometry],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
    },
    [geometry, edges],
  );
  if (part.hidden) return null;
  const layerOpacity = Math.max(0, Math.min(1, (xrayOpacity[part.category] ?? 100) / 100));
  const layerVisible = !xrayIsolatedLayer || xrayIsolatedLayer === part.category;
  // À 100 %, le plan de coupe est ouvert : aucune pièce ne doit disparaître.
  // Sous 100 %, on conserve une coupe progressive et déterministe par couche.
  const cutVisible = mode !== "xray" || xrayCut >= 0.999 || part.position[2] <= (xrayCut * 2 - 1) * Math.max(0.5, part.size[2]);
  if (!layerVisible || !cutVisible) return null;
  return (
    <group ref={pivotRef} position={pivotCenter ?? [0, 0, 0]}>
      <mesh
        geometry={geometry}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(part.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          color={selected ? "#79eadb" : part.color}
          metalness={part.metalness}
          roughness={part.roughness}
          emissive={selected ? "#145b59" : "#000000"}
          emissiveIntensity={selected ? 0.2 : 0}
          wireframe={mode === "wireframe"}
          transparent={mode === "xray"}
          opacity={(mode === "xray" ? 0.25 * layerOpacity : 1) * (part.opacity ?? 1)}
          depthWrite={mode !== "xray" && (part.opacity ?? 1) >= 0.99}
          side={THREE.DoubleSide}
        />
      </mesh>
      {mode !== "wireframe" && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial
            color={selected ? "#c8fff2" : "#647c88"}
            transparent
            opacity={selected ? 0.8 : 0.22}
          />
        </lineSegments>
      )}
    </group>
  );
}
class TwinRendererBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The fallback projects the SAME editable mesh, not a CSS sphere or generic icon. */
export function MechanicalVectorView({
  model,
  selected,
  onSelect,
  view,
  mode,
  explosion,
  xrayCut,
  xrayOpacity,
  xrayIsolatedLayer,
}: Omit<Props, "resetKey">) {
  const [orbit, setOrbit] = useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{
    x: number;
    y: number;
    moved: boolean;
    partId?: string;
  } | null>(null);
  useEffect(() => {
    setOrbit([0, 0]);
    setZoom(1);
  }, [view, model.designId]);
  const faces = useMemo(() => {
    const d = directions[view];
    const eye = new THREE.Vector3(...d).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      orbit[0],
    );
    if (view === "iso") eye.y += orbit[1];
    const camera = new THREE.Matrix4().lookAt(
      eye,
      new THREE.Vector3(),
      new THREE.Vector3(0, 1, 0),
    );
    const inverse = camera.invert();
    const projected = model.parts
      .filter((p) => !p.hidden)
      .filter((p) => !xrayIsolatedLayer || xrayIsolatedLayer === p.category)
      .filter((p) => mode !== "xray" || xrayCut >= 0.999 || p.position[2] <= (xrayCut * 2 - 1) * Math.max(0.5, p.size[2]))
      .flatMap((part) => {
        const vertices = transformedPartVertices(part, explosion);
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < vertices.length; i += 3)
          points.push(
            new THREE.Vector3(
              vertices[i],
              vertices[i + 1],
              vertices[i + 2],
            ).applyMatrix4(inverse),
          );
        const base = new THREE.Color(
          part.id === selected ? "#79eadb" : part.color,
        );
        const light = new THREE.Vector3(-0.3, 0.85, 0.5).normalize();
        const result: Array<{
          key: string;
          id: string;
          name: string;
          category: string;
          points: THREE.Vector3[];
          depth: number;
          color: string;
        }> = [];
        for (let i = 0; i < part.indices.length; i += 3) {
          const a = points[part.indices[i]],
            b = points[part.indices[i + 1]],
            c = points[part.indices[i + 2]];
          if (!a || !b || !c) continue;
          const normal = new THREE.Vector3()
            .subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a))
            .normalize();
          if (normal.z < -0.001 && mode !== "wireframe" && mode !== "xray")
            continue;
          const shade = 0.55 + 0.5 * Math.max(0, normal.dot(light));
          const color = base.clone().multiplyScalar(shade).getStyle();
          result.push({
            key: `${part.id}-${i}`,
            id: part.id,
            name: part.name,
            category: part.category,
            points: [a, b, c],
            depth: (a.z + b.z + c.z) / 3,
            color,
          });
        }
        return result;
      });
    projected.sort((a, b) => a.depth - b.depth);
    const max = projected.reduce(
      (n, f) =>
        Math.max(
          n,
          ...f.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y) * 1.7)),
        ),
      Math.max(model.span, model.length) * 0.5,
    );
    const factor = (300 / Math.max(0.25, max)) * zoom;
    return projected.map((f) => ({
      ...f,
      coords: f.points
        .map((p) => `${400 + p.x * factor},${230 - p.y * factor}`)
        .join(" "),
    }));
  }, [model, selected, view, mode, explosion, orbit, zoom, xrayCut, xrayOpacity, xrayIsolatedLayer]);
  return (
    <svg
      className="mt-vector-view"
      viewBox="0 0 800 460"
      role="img"
      aria-label={`Assemblage mécanique ${model.name}, projection ${view}, ${model.parts.filter((p) => !p.hidden).length} pièces paramétriques`}
      onPointerDown={(e) => {
        const target = (e.target as Element).closest("polygon[data-part]");
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          moved: false,
          partId: target?.getAttribute("data-part") ?? undefined,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || view !== "iso") return;
        const dx = e.clientX - drag.current.x,
          dy = e.clientY - drag.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          drag.current.moved = true;
          setOrbit((o) => [
            o[0] + dx * 0.012,
            Math.max(-0.6, Math.min(1.8, o[1] + dy * 0.012)),
          ]);
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
        }
      }}
      onPointerUp={(e) => {
        if (drag.current?.partId && !drag.current.moved)
          onSelect(drag.current.partId);
        e.currentTarget.releasePointerCapture(e.pointerId);
        window.setTimeout(() => {
          drag.current = null;
        }, 0);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onWheel={(e) =>
        setZoom((z) =>
          Math.max(0.4, Math.min(2.5, z * (e.deltaY > 0 ? 0.93 : 1.07))),
        )
      }
    >
      {faces.map((face) => (
        <polygon
          key={face.key}
          data-part={face.id}
          points={face.coords}
          fill={mode === "wireframe" ? "none" : face.color}
          fillOpacity={(mode === "xray" ? 0.25 * Math.max(0, Math.min(1, (xrayOpacity[face.category] ?? 100) / 100)) : 1) * (model.parts.find((part) => part.id === face.id)?.opacity ?? 1)}
          stroke={
            face.id === selected
              ? "#cafff2"
              : mode === "wireframe"
                ? "#78adba"
                : face.color
          }
          strokeWidth={mode === "wireframe" ? 0.55 : 0.4}
        >
          <title>{face.name} · sélectionner pour modifier</title>
        </polygon>
      ))}
    </svg>
  );
}
export function MechanicalTwinViewport(props: Props) {
  const {
    model,
    selected,
    onSelect,
    view,
    mode,
    explosion,
    resetKey,
    forceVector,
    xrayCut,
    xrayOpacity,
    xrayIsolatedLayer,
    kinematicsPlaying = false,
  } = props;
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [slot, setSlot] = useState(false);
  const [failed, setFailed] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const supported = !forceVector && canCreateWebGL2Context();
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!supported || !visible || failed) return;
    const cancel = reserveWebGLCanvas((free) => {
      release.current = free;
      setSlot(true);
    });
    return () => {
      cancel();
      release.current = null;
      setSlot(false);
    };
  }, [supported, visible, failed]);
  const vector = (
    <MechanicalVectorView key={`${resetKey}-${view}`} {...props} />
  );
  const webgl = supported && slot && !failed;
  return (
    <div
      ref={root}
      className="mt-viewport"
      data-renderer={webgl ? "webgl" : "vector"}
      data-auto-motion="false"
    >
      <div className="mt-viewport-grid" />
      {webgl ? (
        <TwinRendererBoundary
          fallback={vector}
          onFailure={() => {
            release.current?.();
            release.current = null;
            setFailed(true);
          }}
        >
          <Canvas
            frameloop={kinematicsPlaying ? "always" : "demand"}
            dpr={[1, 1.5]}
            camera={{
              position: [
                model.extent * 1.2,
                model.extent * 0.85,
                model.extent * 1.45,
              ],
              fov: 35,
            }}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.25;
            }}
          >
            <ambientLight intensity={1.1} />
            <hemisphereLight args={["#e8f6ff", "#111a22", 1.8]} />
            <directionalLight position={[5, 8, 5]} intensity={3.5} />
            <directionalLight
              position={[-5, 2, -4]}
              color="#93cbdc"
              intensity={2}
            />
            {model.parts.map((part) => (
              <MechanicalMesh
                key={part.id}
                part={part}
                selected={selected === part.id}
                onSelect={onSelect}
                mode={mode}
                explosion={explosion}
                xrayCut={xrayCut}
                xrayOpacity={xrayOpacity}
                xrayIsolatedLayer={xrayIsolatedLayer}
                kinematicsPlaying={kinematicsPlaying}
              />
            ))}
            <OrbitControls
              makeDefault
              autoRotate={false}
              enableDamping
              enablePan
              minDistance={model.extent * 0.2}
              maxDistance={model.extent * 8}
            />
            <CameraRig model={model} view={view} resetKey={resetKey} />
          </Canvas>
        </TwinRendererBoundary>
      ) : (
        vector
      )}
      <div className="mt-scene-tag">
        <span>MECHANICAL TWIN / {model.modelType.toUpperCase()}</span>
        <b>{webgl ? "3D INTERACTIVE" : "PROJECTION MÉCANIQUE INTERACTIVE"}</b>
      </div>
      <div className="mt-axis">
        <i>X</i>
        <i>Y</i>
        <i>Z</i>
      </div>
      <div className="mt-dimension">
        <span>ENVERGURE / {model.span.toFixed(2)} m</span>
        <i />
        <span>LONGUEUR / {model.length.toFixed(2)} m</span>
      </div>
      <div className="mt-viewport-note">
        Glisser pour orbiter · molette pour zoomer · cliquer une pièce pour
        modifier{!webgl ? " · secours vectoriel, même géométrie" : ""}
      </div>
    </div>
  );
}
