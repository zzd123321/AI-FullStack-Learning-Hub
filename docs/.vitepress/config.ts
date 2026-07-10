import { defineConfig } from 'vitepress'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isUserOrOrganizationPage = repositoryName?.endsWith('.github.io')
const base =
  process.env.GITHUB_ACTIONS && repositoryName && !isUserOrOrganizationPage
    ? `/${repositoryName}/`
    : '/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'AI 全栈学习站',
  description: '从前端开发出发，系统学习后端、数据库与 AI 应用开发',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#3157d5' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }]
  ],
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    siteTitle: 'AI 全栈学习站',
    nav: [
      { text: '首页', link: '/' },
      { text: '学习路线', link: '/roadmap/' },
      {
        text: '技术专题',
        items: [
          { text: '前端开发', link: '/frontend/' },
          { text: '后端开发', link: '/backend/' },
          { text: '数据库', link: '/database/' },
          { text: '人工智能', link: '/ai/' },
          { text: '大模型应用', link: '/ai-application/' }
        ]
      },
      { text: '项目实战', link: '/projects/' }
    ],
    sidebar: {
      '/roadmap/': [
        {
          text: '学习路线',
          items: [
            { text: '路线总览', link: '/roadmap/' },
            { text: '学习方法', link: '/about/learning-method' }
          ]
        }
      ],
      '/about/': [
        {
          text: '开始学习',
          items: [
            { text: '路线总览', link: '/roadmap/' },
            { text: '学习方法', link: '/about/learning-method' }
          ]
        }
      ],
      '/frontend/': [
        {
          text: '前端开发',
          items: [
            { text: '专题首页', link: '/frontend/' }
          ]
        },
        {
          text: 'TypeScript',
          collapsed: false,
          items: [
            {
              text: '从 JavaScript 到 TypeScript',
              link: '/frontend/typescript/from-javascript-to-typescript'
            },
            {
              text: '对象类型与函数类型',
              link: '/frontend/typescript/object-and-function-types'
            },
            {
              text: '联合类型、交叉类型与类型收窄',
              link: '/frontend/typescript/unions-intersections-and-narrowing'
            }
          ]
        }
      ],
      '/backend/': [
        {
          text: '后端开发',
          items: [{ text: '专题首页', link: '/backend/' }]
        }
      ],
      '/database/': [
        {
          text: '数据库',
          items: [{ text: '专题首页', link: '/database/' }]
        }
      ],
      '/ai/': [
        {
          text: '人工智能',
          items: [{ text: '专题首页', link: '/ai/' }]
        }
      ],
      '/ai-application/': [
        {
          text: '大模型应用开发',
          items: [{ text: '专题首页', link: '/ai-application/' }]
        }
      ],
      '/projects/': [
        {
          text: '项目实战',
          items: [{ text: '项目首页', link: '/projects/' }]
        }
      ]
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除查询',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关内容',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc'
                }
              }
            }
          }
        }
      }
    },
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '文档目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    footer: {
      message: '持续学习，持续构建。',
      copyright: 'AI 全栈学习站'
    }
  }
})
