import { expect, test } from 'vitest';
import { isSoftwareRenderer } from './renderer';

test('a WebGL renderer running on the CPU is recognised, a GPU is not', () => {
  expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
  expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
  expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
  expect(isSoftwareRenderer('Apple M1, or similar')).toBe(false);
  expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  expect(isSoftwareRenderer('')).toBe(false);
});
