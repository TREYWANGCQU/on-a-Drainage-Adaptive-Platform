# backend/app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# 采用 SQLite 作为本地轻量化关系型数据库
DATABASE_URL = "sqlite+aiosqlite:///./tunnel_params.db"

# 创建异步引擎
engine = create_async_engine(
    DATABASE_URL,
    echo=True,  # 生产环境可关闭 SQL 语句打印以提升性能
    future=True,
    connect_args={"check_same_thread": False}  # SQLite 多线程支持配置
)

# 异步会话工厂配置
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)