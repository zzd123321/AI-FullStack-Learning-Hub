import { createApp, type App } from 'vue'

export function withSetup<Result>(composable: () => Result): [Result, App] {
  let result!: Result
  const app = createApp({
    setup() {
      result = composable()
      return () => undefined
    }
  })

  app.mount(document.createElement('div'))
  return [result, app]
}
