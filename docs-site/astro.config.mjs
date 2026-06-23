import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://max-prime-math.github.io',
  base: '/test-generator',
  outDir: '../docs-build',
  integrations: [
    starlight({
      title: 'Test Generator',
      description: 'Local-first math test generation and gradebook documentation',
      favicon: '/img/favicon.svg',
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3
      },
      editLink: {
        baseUrl: 'https://github.com/max-prime-math/test-generator/edit/main/'
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/max-prime-math/test-generator'
        }
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Introduction', link: '/' },
        {
          label: 'User Guide',
          items: [
            'user-guide/question-bank',
            'user-guide/algorithmic-questions',
            'user-guide/test-builder',
            'user-guide/gradebook',
            'user-guide/import-export-sync',
            'user-guide/portable-question-package',
            'user-guide/typst-authoring'
          ]
        },
        {
          label: 'Concepts',
          items: [
            'concepts/local-first-data',
            'concepts/curriculum-class-vs-course-section',
            'concepts/saved-test-vs-assessment'
          ]
        },
        {
          label: 'Architecture',
          items: [
            'architecture/overview',
            'architecture/storage',
            'architecture/sync',
            'architecture/typst-rendering',
            'architecture/gradebook'
          ]
        },
        {
          label: 'Planning',
          items: ['roadmap', 'limitations']
        },
        {
          label: 'Decision Records',
          collapsed: true,
          items: [
            'decisions/0001-local-first-gradebook',
            'decisions/0002-assessment-snapshots',
            'decisions/0003-classroom-grade-export'
          ]
        }
      ]
    })
  ]
});
