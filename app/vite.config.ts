import { defineConfig } from 'vite';

// In GitHub Actions GITHUB_REPOSITORY is "owner/repo": the landing page links back to it automatically.
const repo = process.env.VITE_REPO_URL ?? (process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : '');

// base './' lets the build work from any sub-path (GitHub Pages serves it under /<repo>/)
export default defineConfig({
  base: './',
  define: { __REPO_URL__: JSON.stringify(repo) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  server: { port: 5173 },
});
