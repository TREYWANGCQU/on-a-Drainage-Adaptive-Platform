# -*- mode: python ; coding: utf-8 -*-
# backend/packaging/sidecar.spec
# 隧道工程多维协同智能排水自适应平台 - 本地独立 Sidecar 引擎 PyInstaller 规范配置

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

SPEC_DIR = Path(SPECPATH)
BACKEND_ROOT = SPEC_DIR.parent
TEMPLATES_DIR = BACKEND_ROOT / "app" / "templates" / "typst"

# 静态资源与模板映射列表
datas = [
    (str(TEMPLATES_DIR), "app/templates/typst"),
]
# 收集 typst 核心库资源
datas += collect_data_files("typst")

# 深度隐式依赖模块收集
hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.lifespans",
    "uvicorn.lifespans.on",
    "aiosqlite",
    "sqlite3",
    "sqlalchemy",
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    "pydantic",
    "pydantic_settings",
    "pypdf",
    "pandas",
    "numpy",
    "typst",
    "typst._typst",
]
hiddenimports += collect_submodules("typst")
hiddenimports += collect_submodules("app")

a = Analysis(
    [str(BACKEND_ROOT / "main.py")],
    pathex=[str(BACKEND_ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "IPython", "jupyter"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="tunnel-backend-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True, # 桌面端子进程建议保留 console=True 或通过 CREATE_NO_WINDOW 隐藏窗口
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
