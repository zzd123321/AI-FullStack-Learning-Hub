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
            { text: 'React Router 数据路由与应用边界', link: '/frontend/react/react-router-data-routing-and-application-boundaries' },
            { text: '表单架构、Action 与复杂交互', link: '/frontend/react/form-architecture-actions-and-complex-interactions' },
            { text: '渲染性能、并发特性与 Suspense', link: '/frontend/react/rendering-performance-concurrency-and-suspense' },
            { text: '测试策略与可测试架构', link: '/frontend/react/testing-strategy-and-testable-architecture' },
            { text: 'Server Components、Server Functions 与全栈边界', link: '/frontend/react/server-components-functions-and-fullstack-boundaries' },
            { text: 'Server Components、Server Functions 与全栈边界（补充）', link: '/frontend/react/server-components-server-functions-and-fullstack-boundaries' },
            { text: '大型应用架构、渐进迁移与生产治理', link: '/frontend/react/large-scale-architecture-migration-and-production-governance' }
          ]
        },
        {
          text: '浏览器原理',
          collapsed: false,
          items: [
            { text: '事件循环、渲染与长任务', link: '/frontend/browser/event-loop-rendering-and-long-tasks' },
            { text: 'URL、DNS、TLS、HTTP 缓存与 Fetch', link: '/frontend/browser/url-dns-tls-http-cache-and-fetch' }
            ,{ text: 'DOM 事件、Shadow DOM 与可访问交互', link: '/frontend/browser/dom-events-shadow-dom-and-accessible-interactions' }
            ,{ text: '浏览器存储、IndexedDB 与离线一致性', link: '/frontend/browser/browser-storage-indexeddb-cache-and-offline-consistency' }
            ,{ text: '浏览器安全：XSS、CSRF、CSP 与跨源隔离', link: '/frontend/browser/browser-security-xss-csrf-csp-and-cross-origin-isolation' }
          ]
        }
        ,{
          text: '前端工程化', collapsed: false, items: [
            { text: 'Vite 开发服务器、模块图、插件与生产构建', link: '/frontend/engineering/vite-dev-server-module-graph-plugins-and-production-build' },
            { text: '代码质量与 CI 门禁', link: '/frontend/engineering/code-quality-eslint-prettier-typescript-git-hooks-and-ci-gates' },
            { text: '前端测试工程化', link: '/frontend/engineering/frontend-testing-unit-component-e2e-and-reliability' },
            { text: '前端性能工程：Core Web Vitals、RUM 与预算', link: '/frontend/engineering/frontend-performance-core-web-vitals-rum-and-budgets' },
            { text: '现代 HTML、CSS、响应式与无障碍 UI 工程', link: '/frontend/engineering/modern-html-css-responsive-and-accessible-ui-engineering' },
            { text: '包管理、模块发布、Monorepo 与依赖治理', link: '/frontend/engineering/package-management-module-publishing-monorepo-and-dependency-governance' }
          ]
        }, {
          text: '前端架构', collapsed: false, items: [
            { text: '大型前端架构、模块边界与微前端', link: '/frontend/architecture/large-scale-frontend-modules-boundaries-and-micro-frontends' },
            { text: '前端可观测性、发布治理与事故响应', link: '/frontend/architecture/frontend-observability-release-governance-and-incident-response' },
            { text: '设计系统、无障碍与跨框架组件', link: '/frontend/architecture/design-system-tokens-accessibility-and-cross-framework-components' },
            { text: '国际化、本地化与 RTL 工程', link: '/frontend/architecture/frontend-internationalization-localization-and-rtl-engineering' },
            { text: '数据可视化、交互与无障碍架构', link: '/frontend/architecture/frontend-data-visualization-rendering-interaction-and-accessibility' },
            { text: '实时同步、协作与冲突解决架构', link: '/frontend/architecture/frontend-realtime-sync-and-collaboration-architecture' },
            { text: 'AI 流式界面、任务状态与生成式 UI 架构', link: '/frontend/architecture/frontend-ai-streaming-task-state-and-generative-ui-architecture' },
            { text: '实时语音、音频与多模态交互架构', link: '/frontend/architecture/frontend-realtime-voice-audio-and-multimodal-interaction-architecture' },
            { text: '文件上传、媒体资源与大文件传输架构', link: '/frontend/architecture/frontend-file-upload-media-assets-and-large-file-transfer-architecture' },
            { text: 'PWA、Service Worker、后台同步与离线应用架构', link: '/frontend/architecture/pwa-service-worker-background-sync-and-offline-application-architecture' },
            { text: 'Web Push、通知权限与后台消息架构', link: '/frontend/architecture/web-push-notification-permission-and-background-messaging-architecture' },
            { text: 'WebView、Electron 与跨端前端架构', link: '/frontend/architecture/webview-electron-and-cross-platform-frontend-architecture' },
            { text: '权限、设备能力与隐私工程', link: '/frontend/architecture/frontend-permissions-device-capabilities-and-privacy-engineering' },
            { text: 'Web Worker、SharedWorker、WebAssembly 与前端计算架构', link: '/frontend/architecture/web-worker-sharedworker-webassembly-and-frontend-compute-architecture' },
            { text: '认证、会话、令牌与授权架构', link: '/frontend/architecture/frontend-authentication-session-token-and-authorization-architecture' },
            { text: '支付、结算与高风险交易架构', link: '/frontend/architecture/frontend-payment-checkout-and-high-risk-transaction-architecture' },
            { text: '多租户、权限与企业后台架构', link: '/frontend/architecture/frontend-multi-tenant-permission-and-enterprise-admin-architecture' },
            { text: '复杂表单、审批工作流与低代码架构', link: '/frontend/architecture/frontend-complex-forms-approval-workflow-and-low-code-architecture' },
            { text: '搜索、筛选、排序与数据查询体验架构', link: '/frontend/architecture/frontend-search-filter-sort-and-data-query-experience-architecture' },
            { text: '数据导入导出、报表与大型异步任务架构', link: '/frontend/architecture/frontend-data-import-export-reporting-and-large-async-job-architecture' },
            { text: '富文本编辑器、内容模型与安全发布架构', link: '/frontend/architecture/frontend-rich-text-editor-content-model-and-secure-publishing-architecture' }
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
            { text: '类加载、字节码、JIT、运行时内存与 GC', link: '/backend/java/class-loading-bytecode-jit-runtime-memory-and-gc' },
            { text: 'GC 日志、JFR、线程转储、堆转储与排障', link: '/backend/java/gc-logs-jfr-thread-dumps-heap-dumps-and-troubleshooting' },
            { text: 'Maven 项目模型、依赖、生命周期与插件', link: '/backend/java/maven-project-model-dependencies-lifecycle-and-plugins' }
          ]
        },
        {
          text: 'Spring Boot',
          collapsed: false,
          items: [
            { text: '专题首页', link: '/backend/spring-boot/' },
            { text: '项目结构、自动配置、配置与第一个 API', link: '/backend/spring-boot/project-structure-auto-configuration-config-and-first-api' },
            { text: 'Bean 生命周期、Java Config、Scope、代理与循环依赖', link: '/backend/spring-boot/bean-lifecycle-java-config-scopes-proxies-and-circular-dependencies' },
            { text: 'MVC 参数绑定、校验、错误响应与测试', link: '/backend/spring-boot/mvc-parameter-binding-validation-error-response-and-testing' }
            ,{ text: '配置、Profile、日志、Actuator 与可观测性', link: '/backend/spring-boot/config-profiles-logging-actuator-and-observability' }
            ,{ text: 'JDBC、连接池、事务与 Flyway', link: '/backend/spring-boot/jdbc-connection-pool-transactions-and-flyway' }
            ,{ text: 'JPA 实体生命周期、关联、查询与 N+1', link: '/backend/spring-boot/jpa-entity-lifecycle-associations-queries-and-n-plus-one' }
            ,{ text: 'JPA 分页、Specification、批量写入与 Testcontainers', link: '/backend/spring-boot/jpa-pagination-specification-batch-and-testcontainers' }
            ,{ text: '缓存抽象、Caffeine、Redis 与一致性', link: '/backend/spring-boot/cache-abstraction-caffeine-redis-and-consistency' }
            ,{ text: '异步、调度、上下文与优雅停机', link: '/backend/spring-boot/async-execution-scheduling-context-and-graceful-shutdown' }
            ,{ text: 'RabbitMQ、Kafka、可靠投递与 Outbox', link: '/backend/spring-boot/messaging-rabbitmq-kafka-reliability-and-outbox' }
            ,{ text: 'Spring Security：认证、授权、Session、JWT 与 CSRF', link: '/backend/spring-boot/security-authentication-authorization-session-jwt-and-csrf' }
            ,{ text: '测试策略：JUnit、Mockito、切片测试与集成测试', link: '/backend/spring-boot/testing-strategy-junit-mockito-slices-and-integration-tests' }
            ,{ text: '生产运行时：打包、配置、健康检查、代理与优雅停机', link: '/backend/spring-boot/production-packaging-configuration-health-proxy-and-graceful-shutdown' }
          ]
        }
        ,{
          text: 'Python', collapsed: false, items: [
            { text: '环境、解释器、虚拟环境、执行模型与第一个程序', link: '/backend/python/environment-interpreter-venv-execution-model-and-first-program' },
            { text: '对象模型、可变性、数值、字符串与真值判断', link: '/backend/python/basic-syntax-object-model-mutability-numbers-strings-and-truthiness' },
            { text: '容器、切片、推导式、迭代器、生成器与惰性求值', link: '/backend/python/containers-slicing-comprehensions-iterators-generators-and-laziness' },
            { text: '函数、参数、作用域、闭包、装饰器与函数式抽象', link: '/backend/python/functions-parameters-scope-closures-decorators-and-functional-abstraction' },
            { text: '模块、包、导入系统、pyproject 与依赖管理', link: '/backend/python/modules-packages-import-system-pyproject-and-dependency-management' },
            { text: '异常、错误建模、上下文管理器、文件 IO 与资源安全', link: '/backend/python/exceptions-error-modeling-context-managers-file-io-and-resource-safety' },
            { text: '类、实例、属性查找、dataclass、Protocol 与对象建模', link: '/backend/python/classes-instances-attribute-lookup-dataclasses-protocols-and-object-modeling' },
            { text: '类型标注、泛型、类型收窄、静态分析与自动化测试', link: '/backend/python/type-hints-generics-narrowing-static-analysis-and-automated-testing' },
            { text: '线程、进程、GIL、asyncio 与结构化异步 IO', link: '/backend/python/concurrency-threads-processes-gil-asyncio-and-structured-async-io' }
          ]
        },
        {
          text: 'FastAPI', collapsed: false, items: [
            { text: '专题首页', link: '/backend/fastapi/' },
            { text: 'ASGI、Lifespan、路由、校验与第一个 API', link: '/backend/fastapi/asgi-lifespan-routing-validation-and-first-api' },
            { text: 'Annotated、Pydantic、依赖、配置与模块化路由', link: '/backend/fastapi/annotated-pydantic-dependencies-settings-and-modular-routing' },
            { text: 'SQLAlchemy Session、事务、Repository 与 Alembic', link: '/backend/fastapi/sqlalchemy-session-transactions-repository-and-alembic' },
            { text: 'SQLAlchemy 关联、加载、并发更新与隔离', link: '/backend/fastapi/sqlalchemy-relationships-loading-updates-concurrency-and-isolation' },
            { text: '密码、JWT、Session、授权与 Web 安全', link: '/backend/fastapi/password-jwt-session-authorization-and-web-security' },
            { text: '测试、结构化日志、指标、追踪与可观测性', link: '/backend/fastapi/testing-structured-logging-metrics-tracing-and-observability' },
            { text: '后台任务、队列、幂等、重试、Outbox 与 SSE', link: '/backend/fastapi/background-tasks-queues-idempotency-retries-outbox-and-sse' },
            { text: 'AI 推理流式输出、模型生命周期、容量与背压', link: '/backend/fastapi/ai-inference-streaming-model-lifecycle-capacity-timeout-cancellation-and-backpressure' },
            { text: '部署拓扑、容器、Worker、代理、迁移与优雅停机', link: '/backend/fastapi/deployment-topology-containers-workers-proxies-migrations-health-and-graceful-shutdown' },
            { text: '分层、模块、领域、Repository、事件、缓存与演进', link: '/backend/fastapi/backend-architecture-layers-modules-domain-repository-events-cache-and-evolution' }
          ]
        },
        {
          text: '后端架构', collapsed: false, items: [
            { text: '专题首页', link: '/backend/architecture/' },
            { text: 'HTTP API：资源建模、语义、错误、分页、并发与版本', link: '/backend/architecture/http-api-resource-modeling-semantics-errors-pagination-concurrency-and-versioning' },
            { text: 'HTTP 缓存、CDN、再验证、缓存键与失效', link: '/backend/architecture/http-cache-cdn-revalidation-keys-and-invalidation' },
            { text: '应用缓存、Redis、Cache-Aside、TTL 与一致性', link: '/backend/architecture/application-cache-redis-cache-aside-ttl-stampede-and-consistency' },
            { text: '事件驱动、Broker、确认、重试、幂等与 Outbox', link: '/backend/architecture/messaging-event-driven-broker-ack-retry-idempotency-and-outbox' },
            { text: '分布式事务、Saga、补偿与一致性', link: '/backend/architecture/distributed-transactions-saga-compensation-and-consistency' },
            { text: '超时、重试、熔断、隔舱、限流与过载保护', link: '/backend/architecture/resilience-deadline-retry-circuit-breaker-bulkhead-rate-limit-and-overload' },
            { text: 'API Gateway、服务发现、健康检查与配置', link: '/backend/architecture/api-gateway-service-discovery-health-and-configuration' },
            { text: '微服务边界、模块化单体与渐进演进', link: '/backend/architecture/microservice-boundaries-modular-monolith-and-evolution' },
            { text: '容量、SLO、可用性与灾难恢复', link: '/backend/architecture/capacity-slo-availability-and-disaster-recovery' }
          ]
        }
      ],
      '/database/': [
        {
          text: '数据库',
          items: [
            { text: '专题首页', link: '/database/' },
            { text: '全栈必修主线', link: '/database/core/' },
            { text: '后端工程进阶', link: '/database/advanced/' },
            { text: '架构与运维参考', link: '/database/reference/' },
            { text: 'Redis 专题首页', link: '/database/redis/' },
            { text: 'Redis 全栈必修', link: '/database/redis/core/' },
            { text: 'Redis 进阶', link: '/database/redis/advanced/' },
            { text: 'Redis 架构与运维参考', link: '/database/redis/reference/' }
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
