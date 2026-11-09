import { AMBIENT_MOTION, sampleAmbientMotion } from './ambientMotion';
import { AMBIENT_MAX_BALLS, DEFAULT_AMBIENT_SETTINGS, type AmbientSettings } from './ambientSettings';

export const AMBIENT_FRAMEBUFFER_LIMIT = 700;
export const AMBIENT_FRAME_INTERVAL = 1000 / 24;
export const AMBIENT_DIAMETERS = [1, .88, 1.12, .94, 1.06, .84] as const;
export type AmbientColour = readonly [number, number, number];

/** Clear circles fit inside the viewport; frost expands them into a broad wash.
 * The default 50% keeps the existing large Gaussian composition unchanged. */
export function ambientRadius(width: number, height: number, index: number, frost = 50) {
  const diffuseDiameter = Math.max(width, height) * AMBIENT_DIAMETERS[index];
  const clearDiameter = Math.min(width, height) * .72 * AMBIENT_DIAMETERS[index];
  const blend = Math.max(0, Math.min(1, frost / 50));
  return (clearDiameter + (diffuseDiameter - clearDiameter) * blend) / 2;
}

export function ambientFramebufferSize(width: number, height: number) {
  const scale = Math.min(1, AMBIENT_FRAMEBUFFER_LIMIT / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The same sRGB hue rotation used by CSS filters, without a filtered DOM layer. */
export function ambientColourMatrix(degrees: number) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [
    [.213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s],
    [.213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s],
    [.213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s],
  ];
}

export function rotateAmbientColour(colour: AmbientColour, degrees: number): AmbientColour {
  return ambientColourMatrix(degrees).map(row => Math.max(0, Math.min(1,
    row.reduce((sum, coefficient, i) => sum + coefficient * colour[i], 0),
  ))) as [number, number, number];
}

interface AmbientFrame {
  width: number;
  height: number;
  seconds: number;
  colours: readonly AmbientColour[];
  opacity: number;
  still: boolean;
  settings?: AmbientSettings;
}

function scene(frame: AmbientFrame) {
  const settings = frame.settings ?? DEFAULT_AMBIENT_SETTINGS;
  return AMBIENT_MOTION.slice(0, settings.count).map((motion, i) => {
    const point = sampleAmbientMotion(motion, frame.still ? 0 : frame.seconds, settings.route);
    const custom = settings.colours[i];
    const colour: AmbientColour = custom
      ? [parseInt(custom.slice(1, 3), 16) / 255, parseInt(custom.slice(3, 5), 16) / 255, parseInt(custom.slice(5, 7), 16) / 255]
      : frame.colours[i % frame.colours.length];
    return {
      x: point.x * frame.width, y: point.y * frame.height,
      radius: ambientRadius(frame.width, frame.height, i, settings.frost),
      strength: Math.min(1, 3 / settings.count),
      colour: rotateAmbientColour(colour, frame.still || custom ? 0 : point.hue),
    };
  });
}

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
  gl_Position = vec4(a_position, 0., 1.);
}`;
const fragmentSource = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_viewport;
uniform vec4 u_orbs[${AMBIENT_MAX_BALLS}];
uniform vec3 u_colours[${AMBIENT_MAX_BALLS}];
uniform float u_opacity;
uniform float u_frost;
void main() {
  vec2 point = v_uv * u_viewport;
  vec4 light = vec4(0.);
  for (int i = 0; i < ${AMBIENT_MAX_BALLS}; i++) {
    float distance = length((point - u_orbs[i].xy) / u_orbs[i].z);
    float sharp = 1. - smoothstep(.97, 1., distance);
    float original = exp(-4. * distance * distance) * (1. - smoothstep(.72, 1., distance));
    float diffuse = .78 * exp(-2. * distance * distance) * (1. - smoothstep(.35, 1.35, distance));
    float shape = mix(sharp, original, min(u_frost * 2., 1.));
    shape = mix(shape, diffuse, max(0., u_frost * 2. - 1.));
    float alpha = u_opacity * u_orbs[i].w * shape;
    light.rgb = u_colours[i] * alpha + light.rgb * (1. - alpha);
    light.a = alpha + light.a * (1. - alpha);
  }
  gl_FragColor = light;
}`;

function webglRenderer(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
  };
  if (!program || !buffer) { dispose(); return null; }
  for (const [kind, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
    const shader = gl.createShader(kind);
    if (!shader) { dispose(); return null; }
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { dispose(); return null; }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const viewport = gl.getUniformLocation(program, 'u_viewport');
  const orbs = gl.getUniformLocation(program, 'u_orbs[0]');
  const colours = gl.getUniformLocation(program, 'u_colours[0]');
  const opacity = gl.getUniformLocation(program, 'u_opacity');
  const frost = gl.getUniformLocation(program, 'u_frost');
  return {
    kind: 'webgl' as const,
    draw(frame: AmbientFrame) {
      const size = ambientFramebufferSize(frame.width, frame.height);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      const lights = scene(frame);
      gl.viewport(0, 0, size.width, size.height);
      gl.uniform2f(viewport, frame.width, frame.height);
      const positions = new Float32Array(AMBIENT_MAX_BALLS * 4);
      const palette = new Float32Array(AMBIENT_MAX_BALLS * 3);
      for (let i = 0; i < AMBIENT_MAX_BALLS; i++) {
        const light = lights[i];
        positions.set(light ? [light.x, light.y, light.radius, light.strength] : [0, 0, 1, 0], i * 4);
        if (light) palette.set(light.colour, i * 3);
      }
      gl.uniform4fv(orbs, positions);
      gl.uniform3fv(colours, palette);
      gl.uniform1f(opacity, frame.opacity);
      gl.uniform1f(frost, (frame.settings ?? DEFAULT_AMBIENT_SETTINGS).frost / 100);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose,
  };
}

/** Low-resolution fallback for devices which do not offer a WebGL context. */
function canvasRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return {
    kind: '2d' as const,
    draw(frame: AmbientFrame) {
      const size = ambientFramebufferSize(frame.width, frame.height);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      ctx.setTransform(size.width / frame.width, 0, 0, size.height / frame.height, 0, 0);
      ctx.clearRect(0, 0, frame.width, frame.height);
      const frost = (frame.settings ?? DEFAULT_AMBIENT_SETTINGS).frost;
      const extent = frost > 50 ? 1.35 : 1;
      const steps = frost === 50 ? 20 : 40;
      for (const light of scene(frame)) {
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius * extent);
        const rgb = light.colour.map(channel => Math.round(channel * 255)).join(',');
        for (let step = 0; step <= steps; step++) {
          const stop = step / steps, d = stop * extent;
          const alpha = frame.opacity * light.strength * ambientEnvelope(d, frost);
          gradient.addColorStop(stop, `rgba(${rgb},${alpha})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(light.x - light.radius * extent, light.y - light.radius * extent, light.radius * extent * 2, light.radius * extent * 2);
      }
    },
    dispose() { ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
}

/** Same frost envelope as the shader; 50 is exactly the original Gaussian. */
export function ambientEnvelope(distance: number, frost: number) {
  const smooth = (a: number, b: number) => {
    const t = Math.max(0, Math.min(1, (distance - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const original = Math.exp(-4 * distance * distance) * (1 - smooth(.72, 1));
  const sharp = 1 - smooth(.97, 1);
  const diffuse = .78 * Math.exp(-2 * distance * distance) * (1 - smooth(.35, 1.35));
  const amount = Math.max(0, Math.min(1, frost / 100));
  if (amount === .5) return original;
  const first = sharp + (original - sharp) * Math.min(amount * 2, 1);
  return first + (diffuse - first) * Math.max(0, amount * 2 - 1);
}

export function createAmbientRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, powerPreference: 'low-power',
  });
  return gl ? webglRenderer(canvas, gl) : canvasRenderer(canvas);
}
