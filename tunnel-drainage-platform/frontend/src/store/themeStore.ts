// frontend/src/store/themeStore.ts
import { defineStore } from 'pinia';

export const useThemeStore = defineStore('theme', {
  state: () => ({
    // 默认为明亮白
    currentTheme: 'light' as 'light' | 'tech-blue',
  }),
  getters: {
    isTechBlue: (state) => state.currentTheme === 'tech-blue',
    // 供 Three.js 订阅使用的 3D 背景色
    sceneBackgroundColor: (state) => state.currentTheme === 'light' ? 0x2a2a2a : 0x08101a,
  },
  actions: {
    toggleTheme() {
      this.currentTheme = this.currentTheme === 'light' ? 'tech-blue' : 'light';
    }
  }
});