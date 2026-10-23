import { useEffect, useMemo, useRef, useState } from "react";
import {
  canCreateWebGL2Context,
  reserveWebGLCanvas,
} from "./PhysicalDroneModel";

/**
 * AeroMind · mini-visualiseur 3D filaire.
 *
 * Rendu WebGL volontairement minimal (un seul contexte, aucun moteur externe)
 * avec repli Canvas 2D lorsque WebGL est indisponible : le profil du châssis
 * reste lisible dans tous les cas. Le contexte est libéré explicitement avec
 * l'extension WEBGL_lose_context pour ne jamais saturer le quota du navigateur.
 */

export type WireModelKind =
  | "chassis"
  | "propulsion"
  | "payload"
  | "energy"
  | "navigation"
  | "structure"
  | "generic";

type Vec3 = [number, number, number];
type Geometry = { vertices: Vec3[]; edges: Array<[number, number]> };

function addBox(
  geometry: Geometry,
  center: Vec3,
  size: Vec3,
  { top = true, bottom = true }: { top?: boolean; bottom?: boolean } = {}
): number {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const base = geometry.vertices.length;
  const corners: Vec3[] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz],
    [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  geometry.vertices.push(...corners);
  const pairs: Array<[number, number]> = [];
  if (bottom) {
    pairs.push([0, 1], [1, 2], [2, 3], [3, 0]);
  }
  if (top) {
    pairs.push([4, 5], [5, 6], [6, 7], [7, 4]);
  }
  pairs.push([0, 4], [1, 5], [2, 6], [3, 7]);
  for (const [a, b] of pairs) geometry.edges.push([base + a, base + b]);
  return base;
}

function addRing(
  geometry: Geometry,
  center: Vec3,
  radius: number,
  segments = 16
): number {
  const base = geometry.vertices.length;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    geometry.vertices.push([
      center[0] + Math.cos(angle) * radius,
      center[1],
      center[2] + Math.sin(angle) * radius,
    ]);
  }
  for (let index = 0; index < segments; index += 1) {
    geometry.edges.push([base + index, base + ((index + 1) % segments)]);
  }
  return base;
}

function addTube(
  geometry: Geometry,
  from: Vec3,
  to: Vec3,
  radius: number,
  segments = 6
): void {
  const base = geometry.vertices.length;
  const build = (point: Vec3): void => {
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      geometry.vertices.push([
        point[0] + Math.cos(angle) * radius,
        point[1] + Math.sin(angle) * radius,
        point[2],
      ]);
    }
  };
  build(from);
  build(to);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    geometry.edges.push([base + index, base + next]);
    geometry.edges.push([base + segments + index, base + segments + next]);
    geometry.edges.push([base + index, base + segments + index]);
  }
}

function addCross(geometry: Geometry, origin: Vec3, arms: 4 | 6 | 8, armLength: number, rotorRadius: number): void {
  for (let index = 0; index < arms; index += 1) {
    const angle = (index / arms) * Math.PI * 2 + Math.PI / 4;
    const end: Vec3 = [
      origin[0] + Math.cos(angle) * armLength,
      origin[1],
      origin[2] + Math.sin(angle) * armLength,
    ];
    addTube(geometry, origin, end, 0.035);
    addRing(geometry, [end[0], origin[1] + 0.02, end[2]], rotorRadius);
  }
}

/** Profil filaire déterministe selon le type de composant sélectionné. */
export function buildWireGeometry(kind: WireModelKind): Geometry {
  const geometry: Geometry = { vertices: [], edges: [] };
  switch (kind) {
    case "propulsion": {
      addRing(geometry, [0, 0, 0], 0.95, 20);
      addRing(geometry, [0, 0.12, 0], 0.62, 20);
      addBox(geometry, [0, -0.14, 0], [0.5, 0.26, 0.5]);
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = (blade / 3) * Math.PI * 2;
        addTube(
          geometry,
          [0, 0.06, 0],
          [Math.cos(angle) * 0.92, 0.06, Math.sin(angle) * 0.92],
          0.05
        );
      }
      break;
    }
    case "payload": {
      addBox(geometry, [0, 0, 0], [1.5, 0.72, 1.0]);
      addBox(geometry, [0, 0.42, 0], [1.1, 0.16, 0.7], { bottom: false });
      addRing(geometry, [0, -0.2, 0.62], 0.34, 16);
      addTube(geometry, [-0.55, -0.36, 0], [0.55, -0.36, 0], 0.06);
      break;
    }
    case "energy": {
      addBox(geometry, [0, 0, 0], [1.35, 0.42, 0.85]);
      addBox(geometry, [0, 0.34, 0], [1.05, 0.28, 0.6], { bottom: false });
      addTube(geometry, [-0.5, -0.2, 0.46], [-0.5, 0.3, 0.46], 0.05);
      addTube(geometry, [0.5, -0.2, 0.46], [0.5, 0.3, 0.46], 0.05);
      break;
    }
    case "navigation": {
      addBox(geometry, [0, 0, 0], [0.7, 0.28, 0.7]);
      addRing(geometry, [0, 0.26, 0], 0.42, 16);
      addTube(geometry, [0, 0.26, 0], [0, 0.78, 0], 0.03);
      addBox(geometry, [0, 0.84, 0], [0.34, 0.1, 0.34]);
      break;
    }
    case "structure": {
      addBox(geometry, [0, 0, 0], [1.9, 0.16, 1.5]);
      addBox(geometry, [0, 0.55, 0], [1.6, 0.16, 1.2], { bottom: false });
      for (const [dx, dz] of [[-0.85, -0.66], [0.85, -0.66], [-0.85, 0.66], [0.85, 0.66]] as Array<[number, number]>) {
        addTube(geometry, [dx, 0, dz], [dx * 0.86, 0.55, dz * 0.86], 0.03);
      }
      break;
    }
    case "chassis":
    case "generic":
    default: {
      // Châssis type X500 : deux platines, quatre bras, quatre anneaux rotors,
      // deux patins d'atterrissage.
      addBox(geometry, [0, 0.34, 0], [0.86, 0.06, 0.72]);
      addBox(geometry, [0, -0.3, 0], [0.72, 0.06, 0.6]);
      for (const [dx, dz] of [[-0.4, -0.34], [0.4, -0.34], [-0.4, 0.34], [0.4, 0.34]] as Array<[number, number]>) {
        addTube(geometry, [dx, 0.34, dz], [dx, -0.3, dz], 0.03);
      }
      addCross(geometry, [0, 0.34, 0], 4, 1.02, 0.24);
      addTube(geometry, [-0.42, -0.3, -0.3], [-0.42, -0.78, -0.44], 0.028);
      addTube(geometry, [0.42, -0.3, -0.3], [0.42, -0.78, -0.44], 0.028);
      addTube(geometry, [-0.42, -0.3, 0.3], [-0.42, -0.78, 0.44], 0.028);
      addTube(geometry, [0.42, -0.3, 0.3], [0.42, -0.78, 0.44], 0.028);
      addTube(geometry, [-0.42, -0.78, -0.44], [-0.42, -0.78, 0.44], 0.028);
      addTube(geometry, [0.42, -0.78, -0.44], [0.42, -0.78, 0.44], 0.028);
      break;
    }
  }
  return geometry;
}

type WireRenderer = { dispose: () => void; draw: (angle: number) => void };

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPosition, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createWebGLRenderer(
  canvas: HTMLCanvasElement,
  geometry: Geometry,
  hue: string
): WireRenderer | null {
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: false,
  };
  const gl = canvas.getContext("webgl2", contextAttributes);
  if (!gl) return null;
  const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const edgeIndices = geometry.edges.flat();
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edgeIndices), gl.STATIC_DRAW);

  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const colorLocation = gl.getAttribLocation(program, "aColor");
  gl.enableVertexAttribArray(positionLocation);
  gl.enableVertexAttribArray(colorLocation);

  const [r, g, b] = hexToRgb(hue);
  const projected = new Float32Array(geometry.vertices.length * 3);
  const colors = new Float32Array(geometry.vertices.length * 3);
  let disposed = false;

  const draw = (angle: number) => {
    if (disposed) return;
    const width = canvas.clientWidth || 240;
    const height = canvas.clientHeight || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const camera = 4.6;
    const focal = 3.1;
    const cosY = Math.cos(angle);
    const sinY = Math.sin(angle);
    const tilt = -0.32;
    const cosX = Math.cos(tilt);
    const sinX = Math.sin(tilt);
    geometry.vertices.forEach((vertex, index) => {
      const [vx, vy, vz] = vertex;
      const rx = vx * cosY - vz * sinY;
      const rz = vx * sinY + vz * cosY;
      const ry = vy * cosX - rz * sinX;
      const zz = vy * sinX + rz * cosX;
      const depth = camera - zz;
      const safeDepth = depth < 0.4 ? 0.4 : depth;
      const ndcX = (rx * focal) / safeDepth;
      const ndcY = ((ry + 0.1) * focal) / safeDepth;
      projected[index * 3] = ndcX;
      projected[index * 3 + 1] = ndcY;
      projected[index * 3 + 2] = 0;
      const shade = Math.min(1, Math.max(0.32, 1.25 - safeDepth / 6.4));
      colors[index * 3] = r * shade;
      colors[index * 3 + 1] = g * shade;
      colors[index * 3 + 2] = b * shade;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, projected, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.LINES, edgeIndices.length, gl.UNSIGNED_SHORT, 0);
  };

  return {
    draw,
    dispose: () => {
      disposed = true;
      try {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* libération best-effort */
      }
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    },
  };
}

function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  geometry: Geometry,
  hue: string
): WireRenderer | null {
  const context = canvas.getContext("2d");
  const [r, g, b] = hexToRgb(hue);
  if (!context) return null;
  const draw = (angle: number) => {
    const width = canvas.clientWidth || 240;
    const height = canvas.clientHeight || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const camera = 4.6;
    const scale = Math.min(width, height) * 0.62;
    const cosY = Math.cos(angle);
    const sinY = Math.sin(angle);
    const tilt = -0.32;
    const cosX = Math.cos(tilt);
    const sinX = Math.sin(tilt);
    const project = (vertex: Vec3) => {
      const rx = vertex[0] * cosY - vertex[2] * sinY;
      const rz = vertex[0] * sinY + vertex[2] * cosY;
      const ry = vertex[1] * cosX - rz * sinX;
      const zz = vertex[1] * sinX + rz * cosX;
      const depth = Math.max(0.5, camera - zz);
      return {
        x: width / 2 + (rx / depth) * scale,
        y: height / 2 - ((ry + 0.1) / depth) * scale,
        shade: Math.min(1, Math.max(0.32, 1.25 - depth / 6.4)),
      };
    };
    const points = geometry.vertices.map(project);
    context.lineCap = "round";
    for (const [from, to] of geometry.edges) {
      const a = points[from];
      const b2 = points[to];
      if (!a || !b2) continue;
      const shade = (a.shade + b2.shade) / 2;
      context.strokeStyle = `rgba(${Math.round(r * shade)}, ${Math.round(g * shade)}, ${Math.round(b * shade)}, 0.95)`;
      context.lineWidth = 1.35;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b2.x, b2.y);
      context.stroke();
    }
  };
  return {
    draw,
    dispose: () => undefined,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map(char => char + char).join("")
    : normalized.padEnd(6, "0");
  const int = Number.parseInt(value.slice(0, 6), 16);
  if (!Number.isFinite(int)) return [72, 211, 240];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function WireframeViewer({
  model = "chassis",
  label,
  caption,
  accent = "#48d3f0",
  height = 190,
}: {
  model?: WireModelKind;
  label: string;
  caption?: string;
  accent?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [slotGranted, setSlotGranted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [mode, setMode] = useState<"webgl" | "canvas2d">("canvas2d");
  const webglSupported = useMemo(() => canCreateWebGL2Context(), []);

  // Le budget de contextes graphiques est partagé avec les aperçus de drones :
  // le visualiseur attend son tour plutôt que de saturer le navigateur.
  useEffect(() => {
    if (!webglSupported) return;
    const cancel = reserveWebGLCanvas(release => {
      releaseRef.current = release;
      setSlotGranted(true);
    });
    return () => {
      cancel();
      releaseRef.current?.();
      releaseRef.current = null;
      setSlotGranted(false);
    };
  }, [webglSupported]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const geometry = buildWireGeometry(model);
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: WireRenderer | null = null;
    let using: "webgl" | "canvas2d" = "canvas2d";
    let mustRemountCanvas = false;

    if (webglSupported && slotGranted) {
      const webglRenderer = createWebGLRenderer(canvas, geometry, accent);
      if (webglRenderer) {
        renderer = webglRenderer;
        using = "webgl";
      } else {
        // Un contexte WebGL a pu être créé puis perdu : le canvas reste lié à ce
        // contexte et refuse un contexte 2D. Il faut remonter un canvas neuf.
        mustRemountCanvas = canvas.getContext("2d") === null;
      }
    }

    if (!renderer) {
      const canvasRenderer = createCanvasRenderer(canvas, geometry, accent);
      if (canvasRenderer) {
        renderer = canvasRenderer;
        using = "canvas2d";
      } else if (!mustRemountCanvas) {
        mustRemountCanvas = true;
      }
    }

    if (mustRemountCanvas) {
      setCanvasKey(key => key + 1);
      setMode("canvas2d");
      return;
    }

    setMode(using);

    let frame = 0;
    let start = 0;
    let visible = true;
    const speed = reduceMotion ? 0.06 : 0.42;

    const loop = (time: number) => {
      if (!start) start = time;
      const elapsed = (time - start) / 1000;
      renderer?.draw(0.55 + elapsed * speed);
      frame = window.requestAnimationFrame(loop);
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              const nextVisible = entry.isIntersecting;
              if (nextVisible === visible) return;
              visible = nextVisible;
              if (visible) {
                start = 0;
                frame = window.requestAnimationFrame(loop);
              } else if (frame) {
                window.cancelAnimationFrame(frame);
                frame = 0;
              }
            },
            { rootMargin: "140px", threshold: 0.01 }
          );
    observer?.observe(canvas);

    renderer?.draw(0.55);
    if (visible) frame = window.requestAnimationFrame(loop);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      renderer?.dispose();
      renderer = null;
      if (frame) window.cancelAnimationFrame(frame);
      setMode("canvas2d");
      setCanvasKey(key => key + 1);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      renderer?.dispose();
    };
  }, [model, accent, webglSupported, slotGranted, canvasKey]);

  return (
    <figure className="wireframe-viewer" style={{ ["--wireframe-accent" as string]: accent }}>
      <div className="wireframe-stage" style={{ height }}>
        <canvas
          key={canvasKey}
          ref={canvasRef}
          aria-label={`${label} — volume filaire 3D rotatif, rendu ${mode === "webgl" ? "WebGL" : "Canvas 2D"}`}
        />
        <span className="wireframe-badge">
          {mode === "webgl" ? "WEBGL · FILAIRE" : "REPLI 2D CANVAS"}
        </span>
        <span className="wireframe-grid" aria-hidden="true" />
      </div>
      <figcaption>
        <strong>{label}</strong>
        {caption && <small>{caption}</small>}
      </figcaption>
    </figure>
  );
}
