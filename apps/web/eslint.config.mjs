import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // three.js loads with the 3D scene (a dynamic import). A value import anywhere else puts it in the first load.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/scene/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [{ name: "three", allowTypeImports: true, message: "Import values from three only in src/scene/*.tsx." }],
          patterns: [
            { group: ["three/*", "@react-three/*"], allowTypeImports: true, message: "Import these only in src/scene/*.tsx." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Stockfish, minified third-party code shipped as is
    "public/engine/**",
  ]),
]);

export default eslintConfig;
