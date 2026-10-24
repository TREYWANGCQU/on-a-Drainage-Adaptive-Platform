# backend/app/db/init_db.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import select, text
import json
from app.db.session import engine, AsyncSessionLocal
from app.models.domain import Base, TunnelParameter, ProjectGroup
from app.models.schemas import DoubleTubeSchema

async def migrate_sqlite_columns():
    """
    针对 SQLite 的轻量平滑增量迁移：
    自动检查 tunnel_parameters 是否缺失 group_id, start_chainage, end_chainage 列，缺失则自动追加。
    """
    async with engine.begin() as conn:
        # 获取当前表结构列信息
        res = await conn.execute(text("PRAGMA table_info(tunnel_parameters)"))
        existing_cols = {row[1] for row in res.fetchall()}
        
        if existing_cols:
            if "group_id" not in existing_cols:
                await conn.execute(text("ALTER TABLE tunnel_parameters ADD COLUMN group_id INTEGER REFERENCES project_groups(id) ON DELETE CASCADE"))
            if "start_chainage" not in existing_cols:
                await conn.execute(text("ALTER TABLE tunnel_parameters ADD COLUMN start_chainage REAL DEFAULT 0.0"))
            if "end_chainage" not in existing_cols:
                await conn.execute(text("ALTER TABLE tunnel_parameters ADD COLUMN end_chainage REAL DEFAULT 0.0"))

async def init_models():
    """
    验证表结构；执行轻量增量迁移；若工程组或表为空，自动注入基准工程组与示范分段。
    """
    # 1. 自动创建所有定义的物理表结构 (含新表 project_groups)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. 检查并追加字段 (SQLite 兼容)
    await migrate_sqlite_columns()

    # 3. 验证并注入初始示范工程组与示范分段
    async with AsyncSessionLocal() as session:
        group_res = await session.execute(select(ProjectGroup).limit(1))
        first_group = group_res.scalars().first()

        if not first_group:
            # 创建初始默认工程组
            default_group = ProjectGroup(
                group_name="晏家隧道工程示范段",
                tunnel_type="公路",
                description="多维协同智能排水自适应示范工程，贯穿溶洞强富水灰岩地层，支持环向/纵向盲管变径自适应排泄。",
                start_chainage=0.0,
                end_chainage=47.0,
                segment_count=1,
                calculated_count=0,
                warning_count=0
            )
            session.add(default_group)
            await session.flush() # 获得 default_group.id

            # 检查是否有未分组的历史记录
            param_res = await session.execute(select(TunnelParameter))
            existing_params = param_res.scalars().all()

            if existing_params:
                # 将存量记录归入默认工程组并修复里程
                calc_count = 0
                warn_count = 0
                min_c = 0.0
                max_c = 0.0
                
                for idx, p in enumerate(existing_params):
                    p.group_id = default_group.id
                    try:
                        p_dict = json.loads(p.parameters_json) if p.parameters_json else {}
                    except Exception:
                        p_dict = {}
                    
                    p.start_chainage = float(p_dict.get("start_chainage", 0.0))
                    p.end_chainage = float(p_dict.get("end_chainage", p.start_chainage + 10.0))
                    
                    if idx == 0:
                        min_c = p.start_chainage
                        max_c = p.end_chainage
                    else:
                        min_c = min(min_c, p.start_chainage)
                        max_c = max(max_c, p.end_chainage)

                    if p.results_json:
                        calc_count += 1
                        try:
                            res_dict = json.loads(p.results_json)
                            if res_dict.get("critical_state"):
                                warn_count += 1
                        except Exception:
                            pass
                
                default_group.segment_count = len(existing_params)
                default_group.calculated_count = calc_count
                default_group.warning_count = warn_count
                default_group.start_chainage = min_c
                default_group.end_chainage = max_c
                await session.commit()
            else:
                # 初始数据库无任何记录时，构造基准示范段
                demo_params = DoubleTubeSchema(
                    tunnel_type="double",
                    k_r=0.15,
                    H=120.0,
                    p_mm=1000.0,
                    k_g=0.00864,
                    k_p=0.00864,
                    k_s=0.000864,
                    cn_condition="灌溉良好",
                    land_use="居住地",
                    grades=4,
                    r_0=7.95,
                    aspect_ratio=0.7,
                    r_s=8.35,
                    r_p=8.57,
                    r_g=8.57,
                    h_1=130.0,
                    start_chainage=0.0,
                    end_chainage=47.0,
                    concrete_grade="C35",
                    Ag=1000.0,
                    D_spacing=40.0,
                    I_long=0.02
                )

                demo_project = TunnelParameter(
                    group_id=default_group.id,
                    project_name="晏家隧道_K0+000~K0+047",
                    tunnel_type="公路",
                    parameters_json=demo_params.model_dump_json(),
                    start_chainage=0.0,
                    end_chainage=47.0
                )
                session.add(demo_project)
                await session.commit()
                print("Database Initialized and Seeded with ProjectGroup & TunnelParameter.")
        else:
            # 已存在工程组，检查是否有孤儿记录 (group_id 为空)
            orphan_res = await session.execute(select(TunnelParameter).where(TunnelParameter.group_id.is_(None)))
            orphans = orphan_res.scalars().all()
            if orphans:
                for o in orphans:
                    o.group_id = first_group.id
                await session.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan 事件管理器配置，供 main.py 挂载使用
    """
    await init_models()
    yield