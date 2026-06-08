// @ts-check
import { defineConfig } from '@lobehub/eslint-config';

export default defineConfig(
  {
    react: 'vite',
    typescript: true,
  },
  {
    ignores: ['dist', 'src/generated-routes.ts'],
  },
);
