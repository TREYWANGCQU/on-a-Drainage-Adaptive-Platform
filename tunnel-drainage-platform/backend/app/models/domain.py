# backend/app/models/domain.py
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class TunnelParameter(Base):
    """
    隧道输入参数数据库物理表模型
    """
    __tablename__ = "tunnel_parameters"

    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键 ID")
    project_name = Column(String(255), nullable=False, index=True, comment="工程命名")
    tunnel_type = Column(String(50), nullable=False, comment="隧道分类（市政/公路/铁路）")
    
    # 用于存储符合 schemas.py 中 SingleTubeSchema 或 DoubleTubeSchema 校验规则的 JSON 序列化字符串
    parameters_json = Column(Text, nullable=False, comment="参数字典序列化文本 (输入)")
    results_json = Column(Text, nullable=True, comment="计算结果序列化文本 (输出，未计算则为空)")
    engine_version = Column(String(50), default="1.0.0", comment="计算时的核心引擎版本号")
    
    # 修正：使用 timezone-aware 的 UTC 时间，并通过 lambda 确保每次插入时动态求值
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间戳")