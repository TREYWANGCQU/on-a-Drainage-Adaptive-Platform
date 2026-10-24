# backend/app/models/domain.py
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class ProjectGroup(Base):
    """
    隧道工程分组物理表 (聚合真实隧道工程百级分段资产)
    """
    __tablename__ = "project_groups"

    id = Column(Integer, primary_key=True, autoincrement=True, comment="工程组主键 ID")
    group_name = Column(String(255), nullable=False, unique=True, index=True, comment="工程组名，如 '晏家隧道'")
    tunnel_type = Column(String(50), nullable=False, default="公路", comment="工程分类（公路/铁路/城市道路/城市轨道/水工/综合管廊/其他）")
    description = Column(Text, nullable=True, comment="工程详细描述/地质水文概况")
    cover_image_url = Column(String(500), nullable=True, comment="工程封面图相对路径或外部URL")
    
    # 里程统一声明为 Float，避免精度截断
    start_chainage = Column(Float, default=0.0, comment="全线起点里程(m)")
    end_chainage = Column(Float, default=0.0, comment="全线终点里程(m)")
    
    # 状态聚合统计缓存列 (支撑前端卡片秒级渲染，避免全量拉取反序列化造成雪崩)
    segment_count = Column(Integer, default=0, comment="包含的计算分段数量缓存")
    calculated_count = Column(Integer, default=0, comment="已完成计算的分段数量缓存 (status='done')")
    warning_count = Column(Integer, default=0, comment="处于预警/临界加固的分段数量缓存")
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间戳")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), comment="最后更新时间")

    # 1:N 级联关系：删除工程组时自动级联删除其下的所有计算分段
    parameters = relationship("TunnelParameter", back_populates="group", cascade="all, delete-orphan", lazy="selectin")


class TunnelParameter(Base):
    """
    隧道输入参数与计算分段物理表 (平权支持纯参数工况与带成果工况)
    """
    __tablename__ = "tunnel_parameters"

    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键 ID")
    group_id = Column(Integer, ForeignKey("project_groups.id", ondelete="CASCADE"), nullable=True, index=True, comment="所属工程组ID（为空表示默认未分组资产）")
    
    project_name = Column(String(255), nullable=False, index=True, comment="分段工程命名，如 '晏家隧道_K0+000~K0+100'")
    tunnel_type = Column(String(50), nullable=False, comment="工程分类（公路/铁路等，继承自所属工程组）")
    
    # 用于存储参数字典序列化文本
    parameters_json = Column(Text, nullable=False, comment="参数字典序列化文本 (输入，内含单双洞 tunnel_type='single'|'double')")
    results_json = Column(Text, nullable=True, comment="计算结果序列化文本 (输出，纯参数工况为 None，包含 Q, 临界管径, 间距, 安全系数 Fs 等)")
    engine_version = Column(String(50), default="1.0.0", comment="计算核心引擎版本号")
    
    start_chainage = Column(Float, default=0.0, index=True, comment="该段起点里程(m)")
    end_chainage = Column(Float, default=0.0, index=True, comment="该段终点里程(m)")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="入库时间戳")

    group = relationship("ProjectGroup", back_populates="parameters")