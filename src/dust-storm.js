export const STORM_DURATION = 14;

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function stormEnvelope(age) {
  if (age < 0 || age >= STORM_DURATION) return 0;
  return smoothstep(0, 0.85, age) * (1 - smoothstep(10, STORM_DURATION, age));
}

// Analytic clocks keep momentum continuous through gusts, at any frame rate.
// Only these three currents run on the CPU; each grain's path stays on the GPU.
export function stormCurrent(age, lane, seed = 0, reducedMotion = false) {
  const t = Math.max(0, age) * (reducedMotion ? 0.3 : 1);
  const phase = lane * 2.1 + seed;
  const frequency = 1.1 + lane * 0.17;
  const angle = (2.1 + lane * 0.17) * t +
    0.85 * (Math.sin(t * frequency + phase) - Math.sin(phase)) +
    0.24 * (Math.sin(t * 2.65 + phase * 0.7) - Math.sin(phase * 0.7));
  const pulse = 0.5 + 0.5 * Math.sin(t * (1.7 + lane * 0.11) + phase);
  const gust = 0.35 + 0.8 * pulse ** 3 + 0.12 * Math.sin(t * 0.73 + phase);
  return { angle, gust };
}

export const dustStormShader = /* glsl */ `
  vec3 dustStormPosition(vec3 source, vec4 random, float age, float phase, float gust, float strength, float aspect, float seed) {
    float lane = floor(random.w * 3.0) - 1.0;
    float theta = random.x * 6.2831853 + phase * (0.8 + random.z * 0.45);
    theta += sin(phase * 1.7 + random.y * 6.2831853) * 0.28;
    float height = (random.y - 0.5) * 2.65 + sin(phase * 0.6 + random.y * 6.2831853) * 0.55;
    float taper = 0.32 + smoothstep(-1.6, 1.6, height) * 0.85;
    float radius = (0.28 + random.z * 1.15) * taper * (0.65 + gust * 0.65);
    vec3 centre = vec3(
      lane * min(aspect, 1.8) * 0.5 + sin(phase * 0.17 + lane * 2.0 + seed) * 0.45,
      sin(phase * 0.23 + lane) * 0.3,
      cos(phase * 0.19 + lane * 1.4) * 0.4
    );
    vec3 eddy = vec3(
      sin(theta * 0.63 + random.y * 10.0),
      cos(theta * 0.91 + random.z * 11.0),
      sin(theta * 0.83 + random.x * 12.0)
    ) * (0.12 + gust * 0.24);
    vec3 dust = centre + vec3(cos(theta) * radius, height + sin(theta * 2.0) * gust * 0.18, sin(theta) * radius * 0.85) + eddy;
    dust *= strength;
    // A staggered outward impulse hands off to the moving vortices, rather
    // than making the photograph jump straight into a prearranged funnel.
    vec3 impulse = source + vec3(cos(random.x * 6.2831853), (random.y - 0.35) * 1.2, sin(random.x * 6.2831853)) * (0.5 + random.z) * strength;
    return mix(impulse, dust, smoothstep(0.3, 1.9, age));
  }
`;
