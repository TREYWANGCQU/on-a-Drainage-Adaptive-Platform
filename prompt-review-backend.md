最小化修改后端启动服务相关`main.py`, `config.py`等函数，原因：

- 启动后端报错，Error loading ASGI app. Could not import module "app.main".

- 检查Review,是否缺失配置文件

# tunnel-drainage-platform\backend\main.py

```python

import uvicorn

from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware



# 引入全局配置

from core.config import settings

# 引入 API 路由模块

from app.v1.api.endpoints.calculate import router as calculate_drainage



# 初始化 FastAPI 应用

app = FastAPI(

    title=settings.PROJECT_NAME,

    description="支持单/双洞隧道、高/低水位模型的智能排水计算后端",

    version="1.0.0",

    openapi_url=f"{settings.API_V1_STR}/openapi.json"

)



# 注入 CORS 中间件，解决前后端分离部署的跨域问题

if settings.BACKEND_CORS_ORIGINS:

    app.add_middleware(

        CORSMiddleware,

        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],

        allow_credentials=True,

        allow_methods=["*"],

        allow_headers=["*"],

    )



# 注册计算模块路由，统一添加前缀 /api/v1/calculate

app.include_router(

    calculate_drainage, 

    prefix=f"{settings.API_V1_STR}/calculate", 

    tags=["计算引擎"]

)



@app.get("/", tags=["系统管理"])

def health_check():

    """服务状态检查"""

    return {"status": "running", "service": settings.PROJECT_NAME}



if __name__ == "__main__":

    # 启动 Uvicorn 服务器

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

```

# tunnel-drainage-platform\backend\app\core\config.py

```python
from typing import List
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    全局配置类：管理环境变量、API版本及跨域策略
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "隧道智能排水自适应平台"
    
    # CORS 跨域配置：允许前端开发环境（Vite/Vue）及 Tauri 容器访问
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ]

    class Config:
        # 区分大小写设置
        case_sensitive = True

# 实例化配置对象供全局调用
settings = Settings()
```

# tunnel-drainage-platform\backend\app\api\v1\endpoints\calculate.py

```python

# backend/app/api/calculate.py



from fastapi import APIRouter, HTTPException

from typing import Union

from app.models.schemas import SingleTubeSchema, DoubleTubeSchema



# 引入实际的底层计算引擎

from app.services.drainage_engine import run_calculation 



router = APIRouter()



@router.post("/drainage", summary="执行隧道多维协同智能排水自适应优化计算")

async def calculate_drainage(data: Union[SingleTubeSchema, DoubleTubeSchema]):

    """

    排水计算核心接口：

    1. 接收单洞(38参数)或双洞(41参数)模型数据。

    2. 自动分发对应的双洞/单洞、高/低水位模型计算。

    3. 透传包括内力、应力节点在内的所有 Echarts 作图计算结果。

    """

    try:

        # 执行计算并直接返回完整的透传数据字典

        result = run_calculation(data)

        return result

    except Exception as e:

        raise HTTPException(status_code=500, detail=f"计算引擎内部错误: {str(e)}")



```

# SourceData

## 项目技术架构





### 一、 总体系统架构



平台采用前后端分离架构，确保计算逻辑与表现层解耦，支持跨端部署。



* **前端渲染层 (Web & 3D)**：采用 Vue 3 + TypeScript 框架。2D UI 组件库选用 Element Plus 或 Ant Design Vue，保障表单重负载场景下的性能；3D 渲染引擎选用 Three.js，支持轻量化且高定制化的 WebGL 图形展示。

* **桌面端容器 (客户端套壳)**：选用 Tauri 或 Electron。Tauri 基于 Rust 开发，打包体积更小、内存占用更低，符合轻量化客户端需求；Electron 生态更为成熟。两者均可完美封装 HTML5 前端页面。

* **后端 API 服务层**：采用 Python FastAPI 框架。由于底层计算模型已完全由 Python 函数构建，FastAPI 可实现原生无缝集成。FastAPI 具备极高的并发性能，且自动生成 OpenAPI (Swagger) 接口文档，直接满足向第三方输出 POST API 请求的要求。



### 二、 核心模块技术实现



#### 1. API 接口与数据流转 

* **请求规范**：计算请求统一通过 `POST /api/v1/calculate/drainage` 触发。

* **报文结构**：采用 JSON 格式。请求体包含 `tunnel_type` (单洞/双洞) 及对应的参数字典。

* **第三方调用**：通过标准 RESTful API 及 Bearer Token 鉴权，支持外部系统（如综合管廊平台、BIM 平台）直接 POST 传参并获取间距、孔径等优化布置结果。



#### 2. 参数输入与 UI 交互设计 

针对前端 33/34 个高密度参数，核心设计逻辑为“分区分级、逐步披露”，降低用户的认知负荷。



* **分模块折叠面板 (Accordion)**：将参数按工程逻辑物理隔离。例如分为“地质水文参数”、“结构尺寸参数”、“材料属性参数”。

* **参数分级与默认值封装**：

    * **核心输入区**：直接展示 15/16 个核心输入参数及 6 个复选参数。

    * **高级设置区**：将其余 12 个默认参数折叠隐藏，默认填入规范推荐值或经验值。用户如需修改，展开“高级设置”面板即可干预。

* **典型案例库 (一键赋值)**：开发“预设模板”功能。内置如“标准岩溶发育区双洞”、“高水压富水断层单洞”等工程案例。用户下拉选择对应案例后，表单 33 个参数瞬间完成自动赋值。

* **批量数据 IO**：依托前端 `xlsx` 库或后端 Pandas 解析，支持下载标准 Excel 模板，用户在本地填好参数后一键导入；同样支持将当前表单的参数组合导出为 `.json` 或 `.xlsx` 存档。



#### 3. 3D 模型构建与可视化交互 

3D 模块的核心是**参数化生成**与**数据双向绑定**，无需导入外部庞大的 BIM 模型。



* **低参数隧道构建 (逐环生成)**：

    * 在 Three.js 中定义基础“计算单元（一环）”的几何体（如圆柱壳体或马蹄形截面）。

    * 基于传入的隧道总长度和单环长度，使用 `THREE.InstancedMesh` (实例化网格) 技术进行线性阵列复制。这能确保在生成数百环隧道时，依然保持 60FPS 的渲染帧率。

* **3D 交互控制 (旋转/剖切/隐藏)**：

    * **旋转与缩放**：引入 `OrbitControls` 实现鼠标拖拽旋转、滚轮缩放。

    * **剖切功能**：利用 Three.js 的 `ClippingPlanes` 特性，设置横向或纵向的剪裁平面，通过 UI 滑块实时调整剖切深度，查看隧道内部。

    * **局部隐藏**：将隧道衬砌、初支、围岩、排水管分为不同的 `Group` 或 `Layer`。通过 UI 树形图（图层管理器）控制各图层的 `visible` 属性，实现局部隐藏。

* **计算结果映射与拾取 (参数反显)**：

    * 后端计算返回间距、孔径数据后，前端根据这些数据，在 3D 空间内的特定坐标点生成排水管网格模型。

    * 引入 `Raycaster` (射线拾取)。用户在 3D 模型中点击某段排水管时，高亮该管段，并在鼠标位置弹出 HTML 浮窗 (Tooltip)，精准显示该管段的“间距：XX m，孔径：XX mm”。

* **多方案 3D 对比机制**：

    * 支持“分屏对比 (Split Screen)”模式。在一个 WebGL Canvas 中设置两个独立的 Camera 和 Viewport，左侧显示方案 A 的 3D 结果，右侧显示方案 B 的结果。

    * 两侧视角支持联动（同步旋转/缩放），直观暴露不同计算参数下，排水管网空间布置密度的视觉差异。



#### 4. 3D模型美化

- 注浆圈 (Grouting Ring)：



几何生成：无需创建复杂的实体模型。基于隧道断面曲线，通过 THREE.RingGeometry 或 THREE.CylinderGeometry 的半径差（内径=隧道外径，外径=隧道外径+注浆厚度）进行程序化生成。



视觉美化：采用半透明材质（Transparent: true, Opacity: 0.4~0.6），并配合噪点贴图或简单的着色器（Shader）模拟注浆后的非均匀扩散效果。



- 锚杆 (Anchors)：



几何生成：将锚杆简化为具有长度和直径的线段或极细的圆柱体（THREE.CylinderGeometry）。



参数化排布：基于极坐标计算。给定锚杆环向间距（角度间隔）和纵向间距，利用 sin 和 cos 函数自动定位锚杆的起点（隧道内表面）与终点（指向围岩深处）。



性能优化：由于锚杆数量众多，必须使用 THREE.InstancedMesh（实例化网格）技术，只需一次渲染调用即可绘制成千上万根锚杆，确保低性能设备下依然流畅。



针对 WebGL (Three.js) 渲染的工程类轻量化模型，在不增加外部模型体积的前提下，可以从**材质表现、光影后期、工程风格**三个维度进行低开销的视觉升级：



**1. PBR 材质与程序化纹理（消除塑料感）**

* **表面微观细节：** 放弃纯色材质，采用 `MeshStandardMaterial`。通过向着色器中注入轻量级的程序化噪声（如 Perlin Noise），动态生成围岩或混凝土衬砌的凹凸感（法线）与粗糙度，完全不需要加载外部高清贴图。

* **潮湿/水流物理模拟：** 作为排水平台，在底部中央排水沟或盲管位置，降低材质的粗糙度（Roughness）以增强高光反射。配合 UV 坐标的简单平移循环动画，能够以极低的性能开销模拟出“潮湿表面”和“水流滑动”的视觉特征。



**2. 后期处理管道（增强空间与交互质感）**

* **SSAO（屏幕空间环境光遮蔽）：** 隧道内部结构紧凑，开启 SSAO 后，排水管与隧道壁的接合处、多层注浆圈的交界处会自动产生真实的接触暗部阴影，大幅增强 3D 场景的厚重感和空间层次。

* **Outline/Bloom Pass（泛光描边）：** 优化鼠标拾取（Hover/Click）交互。当用户选中某段排水管查看间距、孔径参数时，停用生硬的整体变色，改用边缘发光描边（Outline）或局部泛光（Bloom），UI 反馈更具现代感。



**3. 引入“科技蓝图 / X光”着色器（契合专业审美）**

* **菲涅尔透视（Fresnel Shader）：** 原生的半透明材质在叠加多层结构（隧道壁、注浆圈、内部管网）时易产生深度排序冲突。通过自定义菲涅尔着色器，使几何体边缘发亮、中心高透。

* **线框叠加融合：** 结合 `WireframeGeometry`，让外围结构呈现“科技线框 + 边缘发光”的透视状态。视觉焦点将自然收束在内部实体的排水管网上，呈现出类似 CAD 或 BIM 软件的专业高级感。



**4. 粒子轨迹演示（动态数据可视化）**

* **轻量级水流示意：** 在得出最优排水管孔径和间距后，沿排水管网的空间路径实例化生成少量 `THREE.Points`（粒子）。通过简单的循环动画演示水滴汇集并沿管道排出的轨迹，让静态的计算结果具备直观的动态验证效果。



### 三、工程文件目录架构



基于前述确定的 Vue 3 + Three.js (前端)、FastAPI (后端) 及 Tauri (桌面端) 技术栈，以下为面向落地的标准 Monorepo (单体仓库) 工程目录结构。该结构物理隔离了计算逻辑、UI 交互与 3D 渲染模块，确保代码的可维护性。



```text

tunnel-drainage-platform/

├── backend/                              # Python FastAPI 后端服务

│   ├── app/

│   │   ├── api/

│   │   │   └── v1/

│   │   │       └── endpoints/

│   │   │           └── calculate.py      # POST API 路由 (/api/v1/calculate/drainage)

│   │   ├── core/

│   │   │   └── config.py                 # 全局配置 (CORS, 环境变量)

│   │   ├── models/

│   │   │   └── schemas.py                # Pydantic 数据验证模型 (严格定义33/34个参数及默认值)

│   │   └── services/

│   │       └── drainage_engine.py        # 核心：封装已有的 Python 排水计算模型函数

│   ├── requirements.txt                  # 后端依赖声明

│   └── main.py                           # FastAPI 启动入口

│

├── frontend/                             # Vue 3 + TS + Three.js 前端应用

│   ├── src/

│   │   ├── api/

│   │   │   └── index.ts                  # Axios 请求封装，对接后端计算 API

│   │   ├── assets/

│   │   │   └── shaders/                  # 自定义着色器代码 (菲涅尔透视、水流模拟)

│   │   ├── components/

│   │   │   ├── ui/                       # 2D 交互组件库

│   │   │   │   ├── ParameterForm.vue     # 高密度参数表单 (分区分级折叠面板)

│   │   │   │   └── CaseSelector.vue      # 典型案例一键赋值组件

│   │   │   └── three/                    # 3D 渲染核心模块

│   │   │       ├── Viewer3D.vue          # 3D 画布容器

│   │   │       ├── TunnelGenerator.ts    # 隧道主体及管网参数化生成逻辑 (InstancedMesh)

│   │   │       ├── Reinforcement.ts      # 注浆圈与锚杆生成逻辑

│   │   │       └── PostProcessing.ts     # 后期处理管道 (SSAO, OutlinePass)

│   │   ├── store/

│   │   │   └── parameterStore.ts         # Pinia 状态管理 (集中维护33/34个参数及响应式联动)

│   │   ├── utils/

│   │   │   ├── excelIO.ts                # 封装 SheetJS，支持参数批量导入/导出

│   │   │   └── math.ts                   # 前端辅助计算工具

│   │   ├── views/

│   │   │   ├── Dashboard.vue             # 主控工作台界面

│   │   │   └── CompareView.vue           # 3D 分屏对比视图

│   │   ├── App.vue

│   │   └── main.ts                       # Vue 启动入口

│   ├── package.json                      # 前端依赖 (vue, three, element-plus 等)

│   └── vite.config.ts                    # 构建配置

│

└── desktop/                              # Tauri 桌面端套壳容器 (轻量级)

    ├── src-tauri/

    │   ├── src/

    │   │   └── main.rs                   # Rust 入口，管理原生系统级 API 和窗口

    │   ├── tauri.conf.json               # Tauri 配置文件 (定义窗口尺寸、打包配置)

    │   └── Cargo.toml                    # Rust 依赖声明

    └── build.rs                          # Tauri 构建脚本

```



### 关键目录设计说明



1. **`backend/app/models/schemas.py`**: 利用 Pydantic 构建严格的输入验证层。在此处定义 15/16 个必填输入参数，6 个复选参数的枚举值，并直接写入 12 个默认参数的基础值。拦截前端的异常请求。

2. **`backend/app/services/drainage_engine.py`**: 原有 Python 排水计算函数直接作为 Service 层接入，无需重构核心代码。

3. **`frontend/src/store/parameterStore.ts`**: 前端唯一的数据真相源。管理海量表单状态，当用户选择“典型案例”或上传 Excel 时，直接覆写此 Store，触发 Vue 响应式更新 UI 与 3D 模型。

4. **`frontend/src/components/three/`**: 将 Three.js 逻辑彻底组件化。UI 层仅负责传递参数字典给 3D 容器，`TunnelGenerator` 与 `Reinforcement` 接收到参数变化后，在底层重新计算几何体或更新材质，避免与 DOM 逻辑耦合。

