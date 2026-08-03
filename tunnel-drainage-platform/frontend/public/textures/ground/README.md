<!-- tunnel-drainage-platform/frontend/public/textures/ground/README.md -->
# 地表 PBR 贴图资源规范与下载指南 (Ground PBR Textures Guide)

本目录用于存放用于 3D 水文环境与地表网格渲染的高品质 PBR（Physical-Based Rendering）贴图资源。

---

## 1. 推荐下载渠道 (CC0 免费开源许可)

1. **Poly Haven**: [https://polyhaven.com/textures/ground](https://polyhaven.com/textures/ground)
   - 推荐款式：`rock_soil`（岩石土壤）、`dirt_ground_01`（泥土地表）、`aerial_ground_rock`（山体岩面）。
   - 下载建议：规格选择 **1K (1024x1024)** 或 **2K**，格式选择 **JPG**。
2. **ambientCG**: [https://ambientcg.com/list?category=Ground](https://ambientcg.com/list?category=Ground)
   - 分类筛选：Ground / Soil / Rock。

---

## 2. 贴图通道分类与标准命名映射

从上述开源网站下载的贴图压缩包解压后，请按下表关系重命名并放置于本目录 (`public/textures/ground/`) 下：

| 本项目目标文件名 | 通道含义 (PBR Channel) | Poly Haven 原始文件名 | ambientCG 原始文件名 | Three.js 材质映射属性 |
| :--- | :--- | :--- | :--- | :--- |
| **`ground_diffuse.jpg`** | 基础颜色 / 反照率 (Base Color / Diffuse) | `*_diff_1k.jpg` / `*_col_01_1k.jpg` | `*_Color.jpg` | `map` |
| **`ground_normal.jpg`** | 法线贴图 (Normal Map - **OpenGL**) | `*_nor_gl_1k.jpg` *(切勿选 `_nor_dx_`)* | `*_NormalGL.jpg` | `normalMap` |
| **`ground_roughness.jpg`** | 粗糙度贴图 (Roughness) | `*_rough_1k.jpg` | `*_Roughness.jpg` | `roughnessMap` |
| **`ground_ao.jpg`** | 环境光遮蔽 (Ambient Occlusion) | `*_ao_1k.jpg` / `*_arm_1k.jpg` | `*_AmbientOcclusion.jpg` | `aoMap` |

> [!IMPORTANT]
> **法线贴图格式注意事项**：Three.js 使用 OpenGL 格式法线贴图（+Y Up）。若选择 Poly Haven 下载，请务必挑选文件名带 `_nor_gl_` 的图片，避免使用 DirectX 格式（`_nor_dx_`），否则在 3D 渲染光影下会导致表面凹凸感倒置。

---

## 3. 操作流程示例

1. 登录 Poly Haven 打开 [dirt_ground_01](https://polyhaven.com/a/dirt_ground_01)。
2. 右侧选择 `1K` 分辨率及 `JPG` 格式，下载压缩包。
3. 解压获得 `dirt_ground_01_diff_1k.jpg`、`dirt_ground_01_nor_gl_1k.jpg`、`dirt_ground_01_rough_1k.jpg`、`dirt_ground_01_ao_1k.jpg`。
4. 重命名为 `ground_diffuse.jpg`、`ground_normal.jpg`、`ground_roughness.jpg`、`ground_ao.jpg` 并拷贝到本文件夹。

---

## 4. 自动降级与容灾机制

若本目录下未放置贴图文件，或贴图网络请求失败：
- 3D 渲染引擎（`Environment.ts`）将触发平滑降级，自动使用程序化动态生成高分辨率双色网格 Canvas 纹理。
- 确保系统在无静态图片资源时仍能维持无缝稳定运行与赛博科技风 UI 表达。
