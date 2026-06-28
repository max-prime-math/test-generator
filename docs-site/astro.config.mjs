import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

function docsBaseFromAppBase(appBase) {
  if (!appBase) return undefined;
  if (appBase === '/') return '/docs';
  return `${appBase.replace(/\/$/, '')}/docs`;
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const defaultBase = repositoryName && !repositoryName.endsWith('.github.io')
  ? `/${repositoryName}/docs`
  : '/docs';
const base = process.env.DOCS_BASE_PATH ?? docsBaseFromAppBase(process.env.VITE_BASE_PATH) ?? defaultBase;
const site = process.env.DOCS_SITE_URL ?? 'https://testgen.dev';

export default defineConfig({
  site,
  base,
  outDir: '../docs-build',
  integrations: [
    starlight({
      title: 'Test Generator',
      description: 'How-to guides for building math question banks and tests',
      favicon: '/img/favicon.svg',
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/max-prime-math/test-generator'
        }
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro'
      },
      sidebar: [
        { label: 'Introduction', link: '/' },
        {
          label: 'User Guide',
          items: [
            'user-guide/getting-started',
            'user-guide/question-bank',
            'user-guide/import-export-sync',
            'user-guide/portable-question-package',
            'user-guide/algorithmic-questions',
            'user-guide/typst-authoring',
            'user-guide/test-builder',
            'user-guide/gradebook'
          ]
        }
      ]
    })
  ]
});
