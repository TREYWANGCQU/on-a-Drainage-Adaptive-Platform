from typing import List
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    全局配置类：管理环境变量、API版本及跨域策略
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "隧道智能排水自适应平台"
    
    # CORS 跨域配置：允许前端开发环境（Vite/Vue）及 Tauri 容器访问,生产环境请根据实际部署域名调整
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8000",
        "http://localhost:1420"
    ]

    class Config:
        # 区分大小写设置
        case_sensitive = True

# 实例化配置对象供全局调用
settings = Settings()