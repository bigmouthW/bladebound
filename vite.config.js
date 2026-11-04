import { defineConfig } from 'vite';

// A relative base keeps the build portable: the same dist works from a domain
// root, a sub-path, or a third-party CDN such as CrazyGames, where absolute
// /assets/ URLs would resolve against the host site and 404.
export default defineConfig({
  base: './',
});
