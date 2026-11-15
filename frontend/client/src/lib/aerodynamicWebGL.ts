import * as THREE from "three";

const contextProfiles: WebGLContextAttributes[] = [
  {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  },
  {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  },
];

export type AerodynamicRenderer = {
  canvas: HTMLCanvasElement;
  context: WebGL2RenderingContext;
  renderer: THREE.WebGLRenderer;
};

/** Release an owned context only after its listeners/resources have been detached. */
export function releaseAerodynamicContext(
  context: WebGL2RenderingContext | null,
) {
  try {
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // The browser may already have destroyed the context during a GPU reset.
  }
}

/** No throwaway probe, WebGL1 fallback, remote asset, or synthetic geometry. */
export function createAerodynamicRenderer(
  createCanvas: () => HTMLCanvasElement = () =>
    document.createElement("canvas"),
  createRenderer: (
    options: THREE.WebGLRendererParameters,
  ) => THREE.WebGLRenderer = (options) => new THREE.WebGLRenderer(options),
): AerodynamicRenderer {
  let lastFailure = "Le navigateur a refusé la création du contexte WebGL 2";
  for (const profile of contextProfiles) {
    const canvas = createCanvas();
    let context: WebGL2RenderingContext | null = null;
    try {
      context = canvas.getContext("webgl2", profile);
      if (!context || context.isContextLost()) continue;
      const renderer = createRenderer({ canvas, context, alpha: false });
      canvas.dataset.renderer = "webgl2";
      return { canvas, context, renderer };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : lastFailure;
      releaseAerodynamicContext(context);
    }
  }
  throw new Error(lastFailure);
}

const disposedResources = new WeakSet<AerodynamicRenderer>();

/** Idempotent, exception-safe release: GPU context is freed even if Three cleanup fails. */
export function disposeAerodynamicRenderer(resource: AerodynamicRenderer) {
  if (disposedResources.has(resource)) return;
  disposedResources.add(resource);
  try {
    resource.renderer.dispose();
  } finally {
    releaseAerodynamicContext(resource.context);
    resource.canvas.remove();
  }
}

/** Register each resource immediately; failures never bypass the final GPU release. */
export function createAerodynamicCleanup(finalize: () => void) {
  const tasks: Array<() => void> = [];
  let disposed = false;
  return {
    add(task: () => void) {
      if (disposed) task();
      else tasks.push(task);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const task of tasks.splice(0).reverse()) {
        try {
          task();
        } catch (error) {
          console.warn("AeroMind viewport resource cleanup failed.", error);
        }
      }
      finalize();
    },
  };
}
