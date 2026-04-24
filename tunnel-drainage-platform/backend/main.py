import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 引入全局配置
from app.core.config import settings
# 引入 API 路由模块
from app.api.v1.endpoints.calculate import router as calculate_drainage

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
        #allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origins=["*"],  # 开发阶段暂时允许所有来源，生产环境请严格限制
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