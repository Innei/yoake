import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import { defineConfig, loadEnv } from 'vite';
import { routeBuilderPlugin } from 'vite-plugin-route-builder';

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_SITE_URL': JSON.stringify(
      loadEnv(mode, process.cwd(), '').VITE_SITE_URL?.replace(/\/$/, '') ?? '',
    ),
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
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
  ],
}));
