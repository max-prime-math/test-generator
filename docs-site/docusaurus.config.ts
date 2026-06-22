import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Test Generator',
  tagline: 'Local-first math test generation and gradebook documentation',
  url: 'https://max-prime-math.github.io',
  baseUrl: '/test-generator/',
  organizationName: 'max-prime-math',
  projectName: 'test-generator',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },
  future: {
    experimental_router: 'hash'
  },
  themes: ['@docusaurus/theme-mermaid'],
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts'
        },
        blog: false,
        theme: {
          customCss: './custom.css'
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: 'Test Generator',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation'
        },
        {
          href: 'https://max-prime-math.github.io/test-generator/',
          label: 'Open App',
          position: 'right'
        },
        {
          href: 'https://github.com/max-prime-math/test-generator',
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'User Guide', to: '/docs/user-guide/question-bank'},
            {label: 'Architecture', to: '/docs/architecture/overview'},
            {label: 'Roadmap', to: '/docs/roadmap'}
          ]
        },
        {
          title: 'Project',
          items: [
            {label: 'Open App', href: 'https://max-prime-math.github.io/test-generator/'},
            {label: 'GitHub', href: 'https://github.com/max-prime-math/test-generator'}
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Test Generator.`
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3
    },
    colorMode: {
      respectPrefersColorScheme: true
    }
  } satisfies Preset.ThemeConfig
};

export default config;
