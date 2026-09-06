import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# 解析数据库路径并确保父目录存在
db_file_path = os.path.abspath(settings.DB_PATH)
db_dir = os.path.dirname(db_file_path)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

# 格式化 SQLite aiosqlite 连接字符串 (标准化处理 Windows 路径反斜杠)
clean_db_path = db_file_path.replace("\\", "/")
DATABASE_URL = f"sqlite+aiosqlite:///{clean_db_path}"

# 创建异步引擎
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # 生产环境关闭详细 SQL echo
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