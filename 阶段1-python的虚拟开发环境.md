以下为 Python 内置虚拟环境（`venv`）的底层逻辑与跨平台落地操作指南。工程开发中，虚拟环境的物理隔离是确保系统依赖版本受控的核心步骤。

### 一、 命令解析：`python -m venv venv`

此命令由三个独立部分组成，执行后将在当前项目根目录生成一个独立的 Python 运行时副本。

* **`python`**: 调用全局安装的 Python 解释器。
* **`-m venv`**: 指示解释器以脚本模式（`-m`）运行内置的 `venv`（Virtual Environment）标准库模块。
* **`venv` (最后一部分)**: 这是**目标文件夹的名称**。执行后，系统会在当前目录下创建一个名为 `venv` 的文件夹。该文件夹内部包含独立的 Python 可执行文件、`pip` 工具以及独立的 `site-packages`（依赖包存放目录）。

---

### 二、 环境激活（分操作系统隔离）

创建文件夹后，必须进行“激活”（Activate）操作，将当前命令行的环境变量（`PATH`）临时劫持到该虚拟环境的目录。

#### 1. Windows 系统执行路径

**标准激活命令：**
```powershell
.\venv\Scripts\activate
```

**工程排坑（权限阻断）：**
在 Windows PowerShell 环境下执行激活脚本时，常遇到系统抛出红字错误：`无法加载文件...因为在此系统上禁止运行脚本`。
**原因**：Windows 默认执行策略限制。
**解决方案**：以管理员身份运行 PowerShell，或只针对当前用户临时放开权限，执行以下命令后再重新激活：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### 2. macOS / Linux 系统执行路径

基于 Unix 的系统路径层级与 Windows 不同，且需使用 `source` 命令加载环境变量。

**标准激活命令：**
```bash
source venv/bin/activate
```

---

### 三、 状态验证与生命周期管理

落实可验证性，激活后需进行状态确认。

**1. 视觉验证**
激活成功后，您的命令行终端前缀会强制增加环境名称标识，例如：
`(venv) C:\Projects\tunnel-drainage-platform\backend>`

**2. 路径验证（确保依赖不污染全局）**
在终端输入以下命令验证 Python 解释器的实际指向：
* **Windows**: 输入 `where python`，输出的首行路径必须在 `venv\Scripts` 目录下。
* **macOS/Linux**: 输入 `which python`，输出路径必须在 `venv/bin` 目录下。

**3. 退出隔离环境**
完成开发或需要切换项目时，执行挂起命令即可恢复全局环境变量：
```bash
deactivate
```

**4. 销毁环境**
虚拟环境属于纯临时产物。如需彻底重建环境，无需任何卸载命令，直接物理删除 `venv` 文件夹，重新执行创建命令即可。