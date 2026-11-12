import * as THREE from "three";

const vertexShader = `varying vec3 vWorldPosition; varying vec3 vNormal; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`;

export function createCarbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color("#1b242a") }, fiberDirection: { value: new THREE.Vector3(1, 0.16, 0.08) }, lightDirection: { value: new THREE.Vector3(0.35, 0.8, 0.5).normalize() } },
    vertexShader,
    fragmentShader: `uniform vec3 color; uniform vec3 fiberDirection; uniform vec3 lightDirection; varying vec3 vWorldPosition; varying vec3 vNormal; void main(){ vec3 n=normalize(vNormal); vec3 f=normalize(fiberDirection); float incidence=max(dot(n,normalize(lightDirection)),0.0); float weave=0.5+0.5*sin(dot(vWorldPosition,f)*92.0)*sin(dot(vWorldPosition,cross(f,n))*84.0); float anis=pow(max(dot(reflect(-normalize(lightDirection),n),f),0.0),18.0); vec3 base=mix(color*0.58,color*1.32,weave); gl_FragColor=vec4(base+vec3(anis*0.42)+vec3(incidence*0.08),1.0); }`,
    side: THREE.DoubleSide,
  });
}

export function createCrystalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ior: { value: 1.46 }, tint: { value: new THREE.Color("#8ddce5") }, opacity: { value: 0.42 } },
    vertexShader,
    fragmentShader: `uniform float ior; uniform vec3 tint; uniform float opacity; varying vec3 vWorldPosition; varying vec3 vNormal; void main(){ vec3 n=normalize(vNormal); vec3 viewDir=normalize(cameraPosition-vWorldPosition); float fresnel=pow(1.0-max(dot(n,viewDir),0.0),5.0); vec3 refracted=refract(-viewDir,n,1.0/ior); float layer=0.5+0.5*sin(dot(vWorldPosition,refracted)*26.0); vec3 color=mix(tint*0.48,tint*1.15,layer); gl_FragColor=vec4(color,opacity+fresnel*0.38); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createArchvizMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: "#b5d5d7",
    metalness: 0.28,
    roughness: 0.24,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.65,
    sheen: 0.2,
    iridescence: 0.08,
  });
}
