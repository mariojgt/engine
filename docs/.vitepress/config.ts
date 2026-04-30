import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Feather Engine',
  description: 'A TypeScript-first game engine with visual scripting, real-time physics, and a fully dockable editor — for the browser and desktop.',
  // Repo deploys at https://mariojgt.github.io/featherEngine/
  // For a custom domain or username.github.io repo, change to '/'.
  base: '/featherEngine/',
  srcDir: '.',
  cleanUrls: true,
  appearance: 'dark',
  // Source-code links (e.g. ../src/engine/Engine.ts) are intentional — they
  // resolve in editors / IDEs but aren't routes inside the docs site. Skip
  // dead-link validation for any path that escapes the docs root.
  ignoreDeadLinks: [
    /\.\.\//,
    /^\/\.\.\//,
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Start', link: '/introduction' },
      { text: 'Editor', link: '/editor' },
      { text: 'Blueprints', link: '/blueprints' },
      { text: 'Nodes', link: '/nodes' },
      { text: 'Systems', link: '/systems' },
      { text: 'Showcase', link: '/showcase' },
    ],
    sidebar: [
      {
        text: 'Get Going',
        collapsed: false,
        items: [
          { text: 'Home', link: '/' },
          { text: 'Introduction', link: '/introduction' },
          { text: 'Installation', link: '/installation' },
          { text: 'Quickstart', link: '/quickstart' },
        ],
      },
      {
        text: 'Use the Engine',
        collapsed: false,
        items: [
          { text: 'Editor Tour', link: '/editor' },
          { text: 'Core Concepts', link: '/concepts' },
          { text: 'Blueprints', link: '/blueprints' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Node Catalog', link: '/nodes' },
          { text: 'Runtime Systems', link: '/systems' },
          { text: 'Extending Feather', link: '/extending' },
        ],
      },
      {
        text: 'Community',
        collapsed: false,
        items: [
          { text: 'Showcase', link: '/showcase' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Built with VitePress · Neo-brutalist by design.',
      copyright: 'Copyright © Feather Engine contributors',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],
    outline: { level: [2, 3], label: 'On this page' },
  },
});
