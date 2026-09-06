import os
import sys
import time
import argparse
import threading
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 引入全局配置
from app.core.config import settings
# 引入 API 路由模块
from app.api.v1.endpoints.calculate import router as calculate_drainage
from app.api.v1.endpoints.database import router as database_router
from app.api.v1.endpoints.calculation_book import router as calculation_book_router

# 引入数据库初始化生命周期事件
from app.db.init_db import lifespan

# 初始化 FastAPI 应用
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="支持单/双洞隧道、高/低水位模型的智能排水计算后端",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# 注入 CORS 中间件，放行所有本地回环与常见开发端口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册计算模块路由
app.include_router(
    calculate_drainage, 
    prefix=f"{settings.API_V1_STR}/calculate", 
    tags=["计算引擎"]
)

# 注册参数数据库路由
app.include_router(
    database_router, 
    prefix=f"{settings.API_V1_STR}/database", 
    tags=["参数数据库台账"]
)

# 注册 Typst 计算书导出路由
app.include_router(
    calculation_book_router,
    prefix=f"{settings.API_V1_STR}/calculation-books",
    tags=["计算书导出引擎 (Typst)"]
)

@app.get("/", tags=["系统管理"])
@app.get("/health", tags=["系统管理"])
def health_check():
    """服务状态检查探针"""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "db_path": settings.DB_PATH,
        "version": "1.0.0"
    }

def start_parent_watchdog(parent_pid: int):
    """
    启动双向心跳看门狗：监控父进程(Tauri/终端)生命周期
    若父进程意外退出或崩溃，本伴生子进程在 3 秒内主动安全自毁，杜绝孤儿进程残留
    """
    def _watch():
        while True:
            time.sleep(3)
            try:
                if sys.platform == "win32":
                    import ctypes
                    SYNCHRONIZE = 0x00100000
                    handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, parent_pid)
                    if not handle:
                        os._exit(0)
                    # 检查父进程是否仍然存活
                    res = ctypes.windll.kernel32.WaitForSingleObject(handle, 0)
                    ctypes.windll.kernel32.CloseHandle(handle)
                    # WAIT_TIMEOUT = 0x00000102 表示仍在运行；否则说明父进程已终止
                    if res != 0x00000102:
                        os._exit(0)
                else:
                    os.kill(parent_pid, 0)
            except Exception:
                os._exit(0)

    thread = threading.Thread(target=_watch, daemon=True)
    thread.start()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="隧道智能排水自适应平台 - 计算引擎")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="绑定监听地址")
    parser.add_argument("--port", type=int, default=8000, help="绑定监听端口")
    parser.add_argument("--db-dir", type=str, default=None, help="自定义数据库目录路径")
    parser.add_argument("--secret", type=str, default=None, help="会话临时安全鉴权凭据")
    parser.add_argument("--parent-pid", type=int, default=None, help="父进程 PID (用于看门狗心跳销毁)")
    args = parser.parse_args()

    # 动态定制数据库存储路径 (用于桌面单机隔离至 %APPDATA%/TunnelDrainagePlatform)
    if args.db_dir:
        os.makedirs(args.db_dir, exist_ok=True)
        settings.DB_PATH = os.path.join(args.db_dir, "tunnel_params.db")

    # 挂载看门狗守护
    if args.parent_pid:
        start_parent_watchdog(args.parent_pid)

    # 启动 Uvicorn (以 app 实例直接运行，全面兼容 PyInstaller 冻结打包)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")