这是一个非常关键的工程细节。在将现有的独立 Python 脚本服务化时，**必须完全对齐原生模型的运行环境**。

针对您提到的这两个库，处理方式截然不同：

1. **`math`（无需安装）**：这是 Python 的内置标准库，随 Python 解释器自带。在 FastAPI 项目中直接 `import math` 即可，不需要进行任何 `pip` 操作。
2. **`numpy`（必须安装）**：这是第三方的高性能科学计算库。在隔离的虚拟环境（venv）中默认是不存在的，必须手动加入后端的环境依赖中。

### 修正后的阶段一安装步骤

在阶段一“初始化后端 (Python)”时，您的核心依赖安装命令应更新为：

```bash
pip install fastapi uvicorn pydantic pandas numpy
# 数据库依赖
pip install sqlalchemy aiosqlite 
```
*(注：保留 `pandas` 是因为它可以与前端批量导出的 Excel 或后端的 JSON 序列化进行高效的数据转换。)*

### 补充验证步骤：依赖防漏排查

为了防止原生计算模型中还隐藏了其他未察觉的第三方库（例如用 `scipy` 进行复杂方程求解，或用 `sympy` 进行了符号推导），建议在代码迁移前执行一次精准扫描。

您可以临时安装 `pipreqs` 工具，对存放原生 Python 代码的目录进行分析：

```bash
pip install pipreqs
# 假设原生模型存放在 /path/to/old_model 目录下
pipreqs /path/to/old_model --encoding=utf8
```

该命令会解析原生脚本中的所有 `import` 语句，并自动生成一个真实的 `requirements.txt` 文件。您只需将扫描出的内容（如 `numpy==1.26.0`）与 FastAPI 的依赖合并，即可确保计算模型无缝迁移。


强烈建议**将 `matplotlib` 从核心计算逻辑中剥离并最终移除**。

在您原有的本地 Python 脚本时代，`matplotlib` 可能是用来绘制排水量曲线、孔径变化图或隧道二维断面的。但在如今转型的 **前后端分离架构 (FastAPI + Vue 3)** 中，后端直接生成图像（图片）是典型的反模式。

以下是具体的处理策略和最小化修改方案：

### 1. 为什么必须剥离？

* **数据与表现未解耦**：FastAPI 的核心职责是提供纯粹的计算数据（JSON 格式），而不是表现层的图片。
* **丧失交互性**：`matplotlib` 生成的 `.png` 或 `.jpg` 是静态死图，前端无法实现“鼠标悬浮查看具体数值”、“框选放大曲线”等现代化 UI 交互。
* **服务器性能开销**：在服务器端并发执行 `matplotlib` 的底层 C 绘图引擎会大量消耗内存，且容易引发线程安全问题（尤其是在未设置非交互式后端 `Agg` 的情况下）。

### 2. 最小化修改原则：如何改造原有代码？

您不需要重写核心的数学和 `numpy` 计算逻辑，只需**拦截并修改原本用于绘图的输出端**。

**修改前 (原生包含 matplotlib 的逻辑)：**
```python
import matplotlib.pyplot as plt
import numpy as np

def calculate_pipe_spacing(water_pressure, permeability):
    # ... 复杂的 numpy 矩阵运算获取间距数组 spacings 和 里程数组 mileages
    mileages = np.array([...])
    spacings = np.array([...])
    
    # 原来的绘图逻辑
    plt.plot(mileages, spacings)
    plt.title('里程-间距图')
    plt.savefig('output.png')
    # plt.show() 
    return 'output.png'
```

**修改后 (纯数据输出逻辑)：**
```python
import numpy as np
# 删除了 import matplotlib.pyplot as plt

def calculate_pipe_spacing(water_pressure, permeability):
    # ... 复杂的 numpy 矩阵运算保持完全不变 ...
    mileages = np.array([...])
    spacings = np.array([...])
    
    # 直接将 numpy 数组序列化为 Python 原生列表返回
    return {
        "mileages": mileages.tolist(),
        "spacings": spacings.tolist()
    }
```

### 3. 前端的替代方案（由谁来画图？）

后端交出纯数据（如上面的 JSON 字典）后，视觉呈现完全交棒给前端：

* **2D 图表替换 (推荐 ECharts)**：在 Vue 3 前端引入 `echarts` (或 `vue-echarts`)。用前端拿到 `mileages` 和 `spacings` 数组后，直接渲染出带动态提示框 (Tooltip)、可缩放 (DataZoom) 的交互式折线图。
* **3D 视图吸收**：如果是原本用 `matplotlib` 画的隧道断面图或排布图，现在将直接被我们之前讨论的 **Three.js 3D 渲染引擎** 吸收并降维打击，直接在 3D 空间中展示。

### 4. 唯一的保留例外：强制报表导出

**如果您有一项硬性业务要求：**“必须在后台一键生成一份包含图表的标准 PDF/Word 验算报告”。

只有在这种情况下，可以保留 `matplotlib`。但它绝不能放在高频的 `/calculate` 接口中，而是应该剥离成一个独立的异步任务（例如：`POST /api/v1/export/report`），在此服务中利用 `matplotlib` (设置 `matplotlib.use('Agg')`) 在后台静默生成图表，并拼接到报表文件中供用户下载。