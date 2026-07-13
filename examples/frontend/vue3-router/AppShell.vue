<template>
  <div class="app-shell">
    <header>
      <strong>AI 全栈学习站</strong>
      <nav aria-label="主导航">
        <RouterLink :to="{ name: 'lesson-list' }">课程</RouterLink>
      </nav>
    </header>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 60rem;
  margin: 2rem auto;
  font-family: system-ui, sans-serif;
}

header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #ddd;
  padding-bottom: 1rem;
}
</style>
