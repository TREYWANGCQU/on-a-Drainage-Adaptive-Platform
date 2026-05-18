隧道工程多维协同智能排水自适应平台采用前后端分离架构，确保计算逻辑与表现层解耦，支持跨端部署。

* **前端渲染层 (Web & 3D)**：采用 Vue 3 + TypeScript 框架。2D UI 组件库选用 Element Plus 或 Ant Design Vue，保障表单重负载场景下的性能；3D 渲染引擎选用 Three.js，支持轻量化且高定制化的 WebGL 图形展示。
* **桌面端容器 (客户端套壳)**：选用 Tauri 或 Electron。Tauri 基于 Rust 开发，打包体积更小、内存占用更低，符合轻量化客户端需求；Electron 生态更为成熟。两者均可完美封装 HTML5 前端页面。
* **后端 API 服务层**：采用 Python FastAPI 框架。由于底层计算模型已完全由 Python 函数构建，FastAPI 可实现原生无缝集成。FastAPI 具备极高的并发性能，且自动生成 OpenAPI (Swagger) 接口文档，直接满足向第三方输出 POST API 请求的要求。

- **点击跳转**：[工程总体技术架构](/阶段0-工程开发计划.md)
- **点击跳转**：[工程开发计划](/阶段0-工程开发计划.md)