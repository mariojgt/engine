import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Feather Engine',
  description: 'Unreal-style game engine workflow in TypeScript: editor, runtime, blueprints, 2D/3D systems, and deployment guides.',
  srcDir: '.',
  cleanUrls: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'What is Feather?', link: '/what-is-feather' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Node System', link: '/node-system' },
      { text: 'Deep Review', link: '/deep-review' },
    ],
    sidebar: [
      {
        text: 'Feather Guide',
        items: [
          { text: 'Home', link: '/' },
          { text: 'What is Feather?', link: '/what-is-feather' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Node System (2D/3D)', link: '/node-system' },
          { text: 'Deep Review', link: '/deep-review' },
        ],
      },
      {
        text: 'Blueprint Docs',
        items: [
          { text: 'How Nodes Become Runtime Code', link: '/How-Nodes-Become-Runtime-Code' },
          { text: 'Adding New Nodes', link: '/adding-new-nodes' },
          { text: 'Drag From Pin Context Menu', link: '/Drag-From-Pin-Context-Menu' },
          { text: 'Adding Component Nodes', link: '/Adding-Component-Nodes' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Feather Engine documentation (self-hosted VitePress).',
      copyright: 'Copyright © Feather Engine contributors',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],
  },
});
