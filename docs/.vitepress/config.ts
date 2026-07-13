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
            },
            {
              text: '泛型基础与约束',
              link: '/frontend/typescript/generics-and-constraints'
            },
            {
              text: 'keyof、typeof 与索引访问类型',
              link: '/frontend/typescript/keyof-typeof-and-indexed-access'
            },
            {
              text: '条件类型与 infer',
              link: '/frontend/typescript/conditional-types-and-infer'
            },
            {
              text: '映射类型与常用工具类型',
              link: '/frontend/typescript/mapped-types-and-utility-types'
            },
            {
              text: '模板字面量类型与类型安全契约',
              link: '/frontend/typescript/template-literal-types-and-type-safe-contracts'
            },
            {
              text: '工程配置与模块边界',
              link: '/frontend/typescript/project-configuration-and-module-boundaries'
            }
          ]
        },
        {
          text: 'Vue 3',
          collapsed: false,
          items: [
            {
              text: 'Composition API 与组件类型设计',
              link: '/frontend/vue3/composition-api-and-component-typing'
            },
            {
              text: '响应式系统与副作用管理',
              link: '/frontend/vue3/reactivity-and-effect-management'
            },
            {
              text: '组件通信与可复用组件',
              link: '/frontend/vue3/component-communication-and-reusable-components'
            },
            { text: 'Pinia 状态管理与服务层', link: '/frontend/vue3/pinia-state-management-and-service-layer' },
            { text: 'Vue Router 与路由架构', link: '/frontend/vue3/vue-router-and-routing-architecture' },
            { text: '表单架构与复杂交互状态', link: '/frontend/vue3/form-architecture-and-complex-interaction-state' },
            { text: '渲染机制、组件更新与性能', link: '/frontend/vue3/rendering-mechanism-component-updates-and-performance' },
            { text: '测试策略与可测试架构', link: '/frontend/vue3/testing-strategy-and-testable-architecture' },
            { text: 'SSR、Hydration 与同构边界', link: '/frontend/vue3/ssr-hydration-and-universal-application-boundaries' },
            { text: 'Vue 2 到 Vue 3 渐进式迁移', link: '/frontend/vue3/vue2-to-vue3-progressive-migration-and-architecture' }
          ]
        },
        {
          text: 'React',
          collapsed: false,
          items: [
            { text: '核心心智模型与 TypeScript 组件', link: '/frontend/react/core-mental-model-and-typescript-components' },
            { text: 'Effect、Ref、异步竞争与自定义 Hook', link: '/frontend/react/effects-refs-async-races-and-custom-hooks' },
            { text: 'Reducer、Context 与跨组件状态架构', link: '/frontend/react/reducer-context-and-cross-component-state-architecture' },
            { text: 'React Router 数据路由与应用边界', link: '/frontend/react/react-router-data-routing-and-application-boundaries' }
          ]
        }
      ],
      '/backend/': [
        {
          text: '后端开发',
          items: [{ text: '专题首页', link: '/backend/' }]
        },
        {
          text: 'Java 基础',
          collapsed: false,
          items: [
            {
              text: '开发环境、JDK/JRE/JVM 与第一个程序',
              link: '/backend/java/development-environment-and-first-program'
            },
            {
              text: '变量、基本类型、运算符与控制流程',
              link: '/backend/java/variables-types-operators-and-control-flow'
            },
            {
              text: '方法、参数传递、数组与可变参数',
              link: '/backend/java/methods-parameter-passing-arrays-and-varargs'
            },
            {
              text: '类、对象、构造器与封装',
              link: '/backend/java/classes-objects-constructors-and-encapsulation'
            },
            {
              text: '继承、接口、多态与组合',
              link: '/backend/java/inheritance-interfaces-polymorphism-and-composition'
            },
            { text: '包、枚举、记录与代码组织', link: '/backend/java/packages-enums-records-and-code-organization' },
            { text: '异常、错误传播与资源清理', link: '/backend/java/exceptions-error-propagation-and-resource-cleanup' },
            { text: 'IO、NIO.2、字符编码与文件', link: '/backend/java/io-nio2-character-encoding-and-files' },
            { text: '集合框架与 List', link: '/backend/java/collections-framework-and-list' },
            { text: 'Set、Map、相等性与哈希', link: '/backend/java/set-map-equality-and-hashing' },
            { text: '泛型、通配符、类型擦除与 API 设计', link: '/backend/java/generics-wildcards-type-erasure-and-api-design' },
            { text: 'Lambda、函数式接口、Optional 与 Stream', link: '/backend/java/lambda-functional-interfaces-optional-and-streams' },
            { text: '线程、共享状态与内存可见性', link: '/backend/java/concurrency-threads-shared-state-and-memory-visibility' },
            { text: '线程池、Future、原子类与并发集合', link: '/backend/java/executor-future-atomic-and-concurrent-collections' },
            { text: 'CompletableFuture 异步编排', link: '/backend/java/completable-future-async-composition-timeout-and-recovery' },
            { text: '锁、条件变量、信号量与同步器', link: '/backend/java/locks-conditions-semaphores-and-synchronizers' },
            { text: '虚拟线程、结构化并发与 Scoped Values', link: '/backend/java/virtual-threads-structured-concurrency-and-scoped-values' },
            { text: 'Java 内存模型与 happens-before', link: '/backend/java/memory-model-volatile-final-and-happens-before' },
            { text: '类加载、字节码、JIT、运行时内存与 GC', link: '/backend/java/class-loading-bytecode-jit-runtime-memory-and-gc' }
          ]
        }
      ],
      '/database/': [
        {
          text: '数据库',
          items: [
            { text: '专题首页', link: '/database/' },
            {
              text: '关系模型与第一条查询',
              link: '/database/relational-model-and-first-query'
            },
            { text: 'MySQL 与 PostgreSQL 基础', link: '/database/mysql-postgresql-basics' },
            { text: '数据类型、默认值与约束', link: '/database/data-types-defaults-and-constraints' },
            { text: 'SELECT、过滤、排序与分页', link: '/database/select-filter-sort-pagination' },
            { text: '表关系与 JOIN', link: '/database/relationships-and-joins' },
            { text: '聚合、GROUP BY 与 HAVING', link: '/database/aggregates-group-by-having' },
            { text: '子查询与 CTE', link: '/database/subqueries-and-cte' },
            { text: '安全的 INSERT、UPDATE 与 DELETE', link: '/database/safe-insert-update-delete' }
          ]
        }
      ],
      '/ai/': [
        {
          text: '人工智能',
          items: [
            { text: '专题首页', link: '/ai/' },
            {
              text: 'AI、机器学习、深度学习与生成式 AI',
              link: '/ai/foundations/ai-ml-dl-generative-ai'
            }
          ]
        }
      ],
      '/ai-application/': [
        {
          text: '大模型应用开发',
          items: [
            { text: '专题首页', link: '/ai-application/' },
            {
              text: '一次大模型请求的完整生命周期',
              link: '/ai-application/request-lifecycle'
            },
            { text: 'Token、上下文窗口与 Prompt 预算', link: '/ai-application/tokens-context-and-prompts' },
            { text: '结构化输出与工具调用', link: '/ai-application/structured-output-and-tool-calling' },
            { text: 'Embedding 与向量检索', link: '/ai-application/embeddings-vector-retrieval' }
          ]
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
