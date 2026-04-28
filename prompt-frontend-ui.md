# Output

- 直接给出`tunnel-drainage-platform\frontend\src\components\ui\CaseSelector.vue`,结出必要注释
- 直接给出`tunnel-drainage-platform\frontend\src\components\ui\ParameterForm.vue`, 结出必要注释
- 直接给出`tunnel-drainage-platform\frontend\src\components\ui\SnapshotSidebar.vue`, 结出必要注释
- 直接给出`tunnel-drainage-platform\frontend\src\views\Dashboard.vue`, 结出必要注释

# Costraints

**目标文件**：`frontend/src/components/ui/ParameterForm.vue`
* **物理隔离参数模块**：引入 `<el-collapse>` 折叠面板组件，将 38/40 个参数拆分为“地质水文参数”、“结构尺寸参数”、“材料属性参数”三个独立业务区块。
* **按层级披露数据**：
    * **基础输入区**：直接暴露核心参数与复选组件（通过 `<el-checkbox>` 或 `<el-switch>` 实现）。
    * **高级默认区**：折叠隐藏默认参数。用户展开后允许干预修改。
* **响应式表单校验**：结合 Element Plus 的 `FormRules`，为核心字段添加数值范围与格式拦截。

* **追加里程定位参数**：在“基础输入区”的首要位置，新增【分区起点里程】与【分区终点里程】数值输入框，并配置 FormRules 校验逻辑（如终点里程应大于起点里程），确保空间拼接基准数据的准确性。

**目标文件**：`frontend/src/components/ui/CaseSelector.vue`
* **封装案例库源数据**：在本地定义包含诸如“标准岩溶发育区双洞”、“高水压富水断层单洞”等工程案例的 JSON 集合。
* **UI 触发与联动**：开发下拉选择组件 `<el-select>`，监听 `change` 事件。当用户选中特定案例时，触发 `parameterStore.overrideAll(caseData)`，实现表单数据的瞬间全量覆盖。

**目标文件**：依托 `frontend/src/components/ui/SnapshotSidebar.vue` 开发侧边栏快照列表组件
* **捕获快照动作**：在界面配置“保存快照”按钮。点击时，将 `parameterStore` 的当前状态深拷贝为 JSON，附加当前时间戳（`Date.now()`）、用户备注以及当前的安全系数/临界水头等计算结果。
* **快照回溯切换**：在列表 UI 中点击任意历史快照缩略图，将保存的 JSON 状态重新反序列化，并注入 `parameterStore`，表单与 3D 视图即可同步更新为当时的极限工况设定。
* **多分区模板适配**：调整空 Excel 模板的表头生成逻辑，嵌入跨分区（起终点里程）的列定义。

* **序列化快照批量生成**：在 excelIO.ts 中升级解析器。读取用户上传的跨分区 Excel 后，按里程区段自动进行数据切片，依次生成对应的状态字典，并批量封装为快照序列推送到 snapshotStore 存档。

**目标文件**：依托 `frontend/src/views/Dashboard.vue` 核心工作台视图
* **功能定位**：作为整体界面的骨架，将新建的快照侧边栏组件（SnapshotSidebar.vue）挂载到页面特定区域。当用户在侧边栏点击回溯时，由于底层的数据状态已被 parameterStore 覆写，依赖该 Store 的兄弟组件（即 ParameterForm.vue 和 Viewer3D.vue）会自动通过 Vue 的响应式机制完成同步更新，实现从表单数值到 3D 渲染效果的同步回溯。
# SourceData

## parameterStore.ts
