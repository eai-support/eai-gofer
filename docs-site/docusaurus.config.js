// @ts-check

import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Gofer',
  tagline: 'Nightly-generated technical documentation sourced from .tech-docs',
  favicon: 'img/favicon.ico',
  url: 'https://eai-support.github.io',
  baseUrl: '/eai-gofer/',
  organizationName: 'eai-support',
  projectName: 'eai-gofer',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  markdown: {
    format: 'md',
    mermaid: false,
    mdx1Compat: {
      comments: true,
      admonitions: true,
      headingIds: true,
    },
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../.tech-docs',
          sidebarPath: './sidebars.js',
          exclude: ['legacy-src/**'],
          onInlineTags: 'ignore',
        },
        blog: false,
        pages: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-content-pages',
      {
        path: 'src/pages',
        routeBasePath: '/',
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Gofer',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/releases',
          label: 'Releases',
          position: 'left',
        },
        {
          href: 'https://github.com/eai-support/eai-gofer',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Overview', to: '/docs/overview'},
            {label: 'Architecture', to: '/docs/architecture'},
            {label: 'Configuration', to: '/docs/configuration'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} EAI Tools.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  },
};

export default config;
