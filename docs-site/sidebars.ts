import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Introduction'
    },
    {
      type: 'category',
      label: 'User Guide',
      collapsible: true,
      collapsed: false,
      items: [
        'user-guide/question-bank',
        'user-guide/test-builder',
        'user-guide/gradebook',
        'user-guide/import-export-sync',
        'user-guide/typst-authoring'
      ]
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsible: true,
      collapsed: false,
      items: [
        'concepts/local-first-data',
        'concepts/curriculum-class-vs-course-section',
        'concepts/saved-test-vs-assessment'
      ]
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsible: true,
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/storage',
        'architecture/sync',
        'architecture/typst-rendering',
        'architecture/gradebook'
      ]
    },
    {
      type: 'category',
      label: 'Planning',
      collapsible: true,
      collapsed: false,
      items: ['roadmap', 'limitations']
    },
    {
      type: 'category',
      label: 'Decision Records',
      collapsible: true,
      collapsed: true,
      items: [
        'decisions/local-first-gradebook',
        'decisions/assessment-snapshots',
        'decisions/classroom-grade-export'
      ]
    }
  ]
};

export default sidebars;
