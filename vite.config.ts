import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/**
 * Where the app is served from.
 *
 * Root everywhere except a GitHub Pages project site, which serves under
 * `/<repo>/`. Kept an environment variable rather than a constant so one build
 * config covers both: every host in `docs/DEPLOYING.md` serves at the root, and
 * hard-coding a subpath would quietly break all of them.
 */
declare const process: { env: Record<string, string | undefined> };
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  // The version is read from package.json at build time rather than written
  // twice — a settings screen reporting a version nobody bumped is worse than
  // no version at all.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      output: {
        // Named so the service worker's precache ignore can find it. Left to
        // Rollup it comes out as `index-<hash>.js`, indistinguishable from the
        // app's own entry.
        manualChunks: (id) => (id.includes('@supabase') ? 'supabase' : undefined),
      },
    },
  },

  plugins: [
    react(),
    VitePWA({
      // A hand-written worker, because push handling is the point and the
      // generated one cannot express it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Two things are deliberately not precached.
        //
        // The OCR engine is several megabytes the bowler should not pay for at
        // install time; the worker's CacheFirst route keeps it after the first
        // scan instead.
        //
        // The Supabase chunk is 56 KB in aid of screens that cannot work
        // offline anyway — precaching it would spend install bandwidth on a
        // feature that needs the network to do anything at all.
        globIgnores: ['**/tesseract/**', '**/supabase-*.js'],
      },
      devOptions: {
        // Lets the push and offline paths be exercised with `npm run dev`.
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Lane Log',
        short_name: 'Lane Log',
        description: 'Keep your bowling scores, scan paper sheets, and never lose a game.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0d1117',
        theme_color: '#0d1117',
        categories: ['sports', 'lifestyle'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Scan a sheet', url: `${base}?screen=scan` },
          { name: 'New game', url: `${base}?screen=play` },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
