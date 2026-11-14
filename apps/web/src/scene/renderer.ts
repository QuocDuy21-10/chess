/** True for a WebGL renderer that runs on the CPU (no GPU, or a blocklisted one), where the scene must draw less. */
export const isSoftwareRenderer = (renderer: string) => /swiftshader|llvmpipe|softpipe|basic render driver/i.test(renderer);

/** What this browser's WebGL2 offers: none, or a context whose renderer may be software. */
export function probeWebGL(): { webgl: boolean; software: boolean } {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl: false, software: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // the probe's context is not needed again
    return { webgl: true, software: isSoftwareRenderer(renderer) };
  } catch {
    return { webgl: false, software: false };
  }
}
