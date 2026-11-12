// Fog is done by hand in each material so additive links/particles fade into the dark like real FogExp2.
const fogVert = /* glsl */ `
uniform float uFog;
varying float vFogF;
void applyFog(float depth){ vFogF = exp(-(uFog*uFog*depth*depth)); }
`;

export const nodeVert = /* glsl */ `
${fogVert}
uniform float uTime;
uniform float uPulse;
attribute vec3 aColor;
attribute float aPhase;
attribute float aState;
varying vec3 vColor;
varying float vRim;
varying float vState;
void main(){
  vec3 p = position * (1.0 + uPulse * 0.14 * sin(uTime * 1.7 + aPhase));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
  vec3 v = normalize(-mv.xyz);
  vRim = pow(1.0 - abs(dot(n, v)), 2.2);
  vColor = aColor;
  vState = aState;
  applyFog(-mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const nodeFrag = /* glsl */ `
uniform float uGhost;
varying vec3 vColor;
varying float vRim;
varying float vState;
varying float vFogF;
void main(){
  vec3 c = vColor * (0.42 + 1.25 * vRim) * vState;
  float a = 1.0;
  if (uGhost > 0.5) { c = vColor * (0.55 + 0.8 * vRim) * vState; a = 0.75; }
  gl_FragColor = vec4(c * vFogF, a);
}`;

export const lineVert = /* glsl */ `
${fogVert}
attribute vec3 aColor;
attribute float aState;
varying vec3 vColor;
varying float vState;
void main(){
  vColor = aColor;
  vState = aState;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  applyFog(-mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const lineFrag = /* glsl */ `
uniform float uAlpha;
varying vec3 vColor;
varying float vState;
varying float vFogF;
void main(){
  if (vState <= 0.0) discard;
  gl_FragColor = vec4(vColor * uAlpha * vState * vFogF, 1.0);
}`;

export const particleVert = /* glsl */ `
${fogVert}
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aColor;
attribute float aSpeed;
attribute float aOffset;
attribute float aState;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float t = fract(uTime * aSpeed + aOffset);
  vec3 p = mix(aFrom, aTo, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  applyFog(-mv.z);
  float fade = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t);
  vAlpha = fade * min(aState, 2.4) * vFogF * (aState > 0.0 ? 1.0 : 0.0);
  vColor = mix(aColor, vec3(1.0), 0.35);
  gl_PointSize = uSize * uPixelRatio * (0.7 + 0.6 * t) * (300.0 / max(-mv.z, 1.0)) * min(aState, 1.6);
  gl_Position = projectionMatrix * mv;
}`;

export const particleFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`;

export const HologramShader = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uHolo: { value: 1 },
    uRes: { value: [1, 1] as [number, number] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uHolo;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uHolo < 0.5) { gl_FragColor = texture2D(tDiffuse, uv); return; }
      // slow rolling band: brighter, slightly jittery
      float bandPos = fract(uv.y * 0.9 - uTime * 0.06);
      float band = smoothstep(0.0, 0.015, bandPos) * (1.0 - smoothstep(0.015, 0.09, bandPos));
      uv.x += band * 0.0022 * sin(uTime * 40.0 + uv.y * 90.0);
      // chromatic aberration grows toward the edges
      vec2 dir = uv - 0.5;
      float ab = 0.0016 * dot(dir, dir) * 4.0 + 0.0003;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;
      // scanlines
      float scan = 0.955 + 0.045 * sin(uv.y * uRes.y * 1.6);
      col *= scan;
      col += band * 0.022 * vec3(0.3, 0.8, 1.0);
      // grain
      col += (rand(uv * uRes + uTime) - 0.5) * 0.022;
      // vignette + cool tint
      col *= 1.0 - dot(dir, dir) * 0.9;
      col *= vec3(0.93, 1.0, 1.06);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
