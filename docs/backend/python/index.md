# Python 后端专题

Python 在 AI、数据处理、自动化与 Web API 中拥有成熟生态。本专题不是把 JavaScript 语法逐项改写成 Python，而是建立解释器、对象模型、模块系统、依赖环境、异常、类型、并发与 Web 运行时的完整认识，最终进入 FastAPI 和后端架构。

## 版本基线

- 官方讲解基线：Python 3.14.x。
- 示例兼容目标：Python 3.11 及以上。
- 每课会明确实际验证所用的 CPython 版本。
- 不使用已经停止维护的 Python 2，也不把操作系统自带 Python 当作项目依赖契约。

## 课程目录

1. [开发环境、解释器、虚拟环境、执行模型与第一个程序](/backend/python/environment-interpreter-venv-execution-model-and-first-program)
2. [基础语法与对象模型：名称绑定、可变性、数字、字符串与真值](/backend/python/basic-syntax-object-model-mutability-numbers-strings-and-truthiness)
3. [容器与迭代协议：切片、推导式、迭代器、生成器与惰性求值](/backend/python/containers-slicing-comprehensions-iterators-generators-and-laziness)
4. [函数、参数模型、作用域、闭包、装饰器与函数式抽象](/backend/python/functions-parameters-scope-closures-decorators-and-functional-abstraction)
5. [模块、包、导入系统、pyproject 与依赖管理](/backend/python/modules-packages-import-system-pyproject-and-dependency-management)
6. [异常、错误建模、上下文管理器、文件 I/O 与资源安全](/backend/python/exceptions-error-modeling-context-managers-file-io-and-resource-safety)
7. [类、实例、属性查找、数据类、协议与面向对象建模](/backend/python/classes-instances-attribute-lookup-dataclasses-protocols-and-object-modeling)

后续将依次学习 Python 基础语法与对象模型、容器与迭代、函数与作用域、模块与包、异常与资源管理、类型提示与测试、异步 I/O、FastAPI、数据访问和后端架构。

## 学习约定

- 先解释为什么需要一个机制，再给定义、运行原理和工程用法。
- 明确区分 Python 语言、CPython 实现、解释器进程、虚拟环境与第三方包。
- 示例同时说明输入、状态变化、输出、错误和退出状态。
- 使用 `python -m ...` 绑定工具与当前解释器，减少环境错位。
- 对照 JavaScript 和 Java 时既指出相似处，也说明对象模型、类型检查与运行时边界。
- 所有示例必须可运行，课程不包含练习题。
