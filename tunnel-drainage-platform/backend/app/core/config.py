import os
from typing import List
from pydantic_settings import BaseSettings

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

    class Config:
        case_sensitive = True

# 实例化配置对象供全局调用
settings = Settings()