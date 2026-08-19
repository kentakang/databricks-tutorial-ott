import { defineConfig } from 'tsdown';
import path from 'node:path';

export default defineConfig({
  entry: 'server/server.ts',
  external: (id) =>
    id.includes('/node_modules/') || id.includes('\\node_modules\\') || (!id.startsWith('.') && !path.isAbsolute(id)),
  tsconfig: 'tsconfig.server.json',
  outExtensions: () => ({
    js: '.js',
  }),
});
