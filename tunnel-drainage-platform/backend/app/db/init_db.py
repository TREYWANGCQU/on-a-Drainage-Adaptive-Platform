# backend/app/db/init_db.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import select
from app.db.session import engine, AsyncSessionLocal
from app.models.domain import Base, TunnelParameter
from app.models.schemas import DoubleTubeSchema

async def init_models():
    """
    验证表结构；若表为空，则自动创建并注入基准隧道工程参数。
    """
    # 自动创建所有定义的物理表结构
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 验证并注入初始示点数据
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(TunnelParameter).limit(1))
        first_record = result.scalars().first()

        if not first_record:
            # 构造基准工程参数，确保符合 schemas 严格校验
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
                project_name="晏家隧道-多维协同智能排水示范段",
                tunnel_type="公路",
                parameters_json=demo_params.model_dump_json() # Pydantic v2 序列化
            )

            session.add(demo_project)
            await session.commit()
            print("Database Initialized and Seeded.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan 事件管理器配置，供 main.py 挂载使用
    """
    await init_models()
    yield
    # 应用关闭时，可在此处加入 engine.dispose() 等资源清理逻辑