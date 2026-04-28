<template>
  <div class="app-wrapper">
    <Dashboard />
  </div>
</template>

<script setup lang="ts">
// 引入核心页面：主控工作台
import Dashboard from './views/Dashboard.vue';
</script>

<style>
/* 确保顶层容器继承了 main.css 中的全屏无滚动条设置 */
.app-wrapper {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-color);
}
</style>