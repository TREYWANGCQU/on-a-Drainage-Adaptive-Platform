import os
from typing import List
from pydantic_settings import BaseSettings

# 优先尝试导入编译期固化常量（由打包脚本在冻结时注入）
try:
    from app.core._build_constants import BUILTIN_AUTH_PASSWORD, BUILTIN_AUTH_MODE
except ImportError:
    BUILTIN_AUTH_PASSWORD = None
    BUILTIN_AUTH_MODE = None

class Settings(BaseSettings):
    """
    全局配置类：管理环境变量、API版本、存储路径及跨域策略
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "隧道智能排水自适应平台"
    
    # 数据库持久化路径，支持环境变量 DB_PATH 覆盖
    DB_PATH: str = os.getenv("DB_PATH", "./tunnel_params.db")

    # 日志输出目录
    LOG_DIR: str = os.getenv("LOG_DIR", "./logs")

    # 工程封面图片存储目录
    COVERS_DIR: str = os.getenv(
        "COVERS_DIR", 
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/uploads/covers"))
    )
    
    # CORS 跨域配置：允许前端开发环境（Vite/Vue）、Nginx 反代及 Tauri 容器 (tauri://localhost)
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8000",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "*"
    ]

    # 安全认证机制配置：编译期固化常量优先，其次读取系统环境变量，最后回退至出厂默认值
    PLATFORM_AUTH_PASSWORD: str = BUILTIN_AUTH_PASSWORD or os.getenv("PLATFORM_AUTH_PASSWORD", "chongqing123456")
    PLATFORM_AUTH_MODE: str = BUILTIN_AUTH_MODE or os.getenv("PLATFORM_AUTH_MODE", "server") # "server" | "desktop"
    PLATFORM_SECRET_KEY: str = os.getenv("PLATFORM_SECRET_KEY", "cqu_tunnel_platform_secret_key_2026_authtoken")
    PLATFORM_AUTH_ENABLED: bool = os.getenv("PLATFORM_AUTH_ENABLED", "true").lower() in ("true", "1", "yes")
    AUTH_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("AUTH_TOKEN_EXPIRE_MINUTES", "120"))

    class Config:
        case_sensitive = True

# 实例化配置对象供全局调用
settings = Settings()