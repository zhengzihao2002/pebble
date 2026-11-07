import { AMBIENT_MOTION, sampleAmbientMotion } from './ambientMotion';

export const AMBIENT_FRAMEBUFFER_LIMIT = 700;
export const AMBIENT_FRAME_INTERVAL = 1000 / 24;
export const AMBIENT_DIAMETERS = [1, .88, 1.12] as const;
export type AmbientColour = readonly [number, number, number];

export function ambientFramebufferSize(width: number, height: number) {
  const scale = Math.min(1, AMBIENT_FRAMEBUFFER_LIMIT / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The same sRGB hue rotation used by CSS filters, without a filtered DOM layer. */
export function rotateAmbientColour([r, g, b]: AmbientColour, degrees: number): AmbientColour {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return [
    clamp((.213 + .787 * c - .213 * s) * r + (.715 - .715 * c - .715 * s) * g + (.072 - .072 * c + .928 * s) * b),
    clamp((.213 - .213 * c + .143 * s) * r + (.715 + .285 * c + .140 * s) * g + (.072 - .072 * c - .283 * s) * b),
    clamp((.213 - .213 * c - .787 * s) * r + (.715 - .715 * c + .715 * s) * g + (.072 + .928 * c + .072 * s) * b),
  ];
}

interface AmbientFrame {
  width: number;
  height: number;
  seconds: number;
  colours: readonly AmbientColour[];
  opacity: number;
  still: boolean;
}

function scene(frame: AmbientFrame) {
  const longest = Math.max(frame.width, frame.height);
  return AMBIENT_MOTION.map((motion, i) => {
    const point = sampleAmbientMotion(motion, frame.still ? 0 : frame.seconds);
    return {
      x: point.x * frame.width, y: point.y * frame.height,
      radius: longest * AMBIENT_DIAMETERS[i] / 2,
      colour: rotateAmbientColour(frame.colours[i], frame.still ? 0 : point.hue),
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
uniform vec3 u_orbs[3];
uniform vec3 u_colours[3];
uniform float u_opacity;
void main() {
  vec2 point = v_uv * u_viewport;
  vec4 light = vec4(0.);
  for (int i = 0; i < 3; i++) {
    float distance = length((point - u_orbs[i].xy) / u_orbs[i].z);
    float alpha = u_opacity * exp(-4. * distance * distance)
      * (1. - smoothstep(.72, 1., distance));
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
  return {
    kind: 'webgl' as const,
    draw(frame: AmbientFrame) {
      const size = ambientFramebufferSize(frame.width, frame.height);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      const lights = scene(frame);
      gl.viewport(0, 0, size.width, size.height);
      gl.uniform2f(viewport, frame.width, frame.height);
      gl.uniform3fv(orbs, lights.flatMap(light => [light.x, light.y, light.radius]));
      gl.uniform3fv(colours, lights.flatMap(light => [...light.colour]));
      gl.uniform1f(opacity, frame.opacity);
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
      for (const light of scene(frame)) {
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
        const rgb = light.colour.map(channel => Math.round(channel * 255)).join(',');
        for (let step = 0; step <= 20; step++) {
          const d = step / 20, t = Math.max(0, Math.min(1, (d - .72) / .28));
          const alpha = frame.opacity * Math.exp(-4 * d * d) * (1 - t * t * (3 - 2 * t));
          gradient.addColorStop(d, `rgba(${rgb},${alpha})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
      }
    },
    dispose() { ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
}

export function createAmbientRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, powerPreference: 'low-power',
  });
  return gl ? webglRenderer(canvas, gl) : canvasRenderer(canvas);
}
