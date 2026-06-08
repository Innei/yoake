import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import { defineConfig } from 'vite';
import { routeBuilderPlugin } from 'vite-plugin-route-builder';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      editor: 'cursor',
      hotKeys: ['altKey'],
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    routeBuilderPlugin({
      pagePattern: './src/pages/**/*.{tsx,sync.tsx}',
      outputPath: './src/generated-routes.ts',
      enableInDev: true,
    }),
    wasm(),
    topLevelAwait(),
  ],
});
