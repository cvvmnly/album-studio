import { defineConfig } from 'vite';

const repoName = 'album-studio';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        share: 'share.html',
      },
    },
  },
});
