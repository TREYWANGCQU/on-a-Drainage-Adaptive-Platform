// 文件路径: tunnel-drainage-platform\frontend\src\main.ts

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// 引入 Element Plus 及其基础样式
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';

// 引入系统全局预设样式
import './assets/styles/main.css';

const app = createApp(App);

// 初始化并注册 Pinia 状态机
// 支撑 parameterStore (参数真值源) 与 snapshotStore (多分区计算快照池)
const pinia = createPinia();
app.use(pinia);

// 注册基础 2D UI 组件库，承载折叠面板、数据表格及状态反馈机制
app.use(ElementPlus, { size: 'default', zIndex: 3000 });

// 挂载至根节点
app.mount('#app');