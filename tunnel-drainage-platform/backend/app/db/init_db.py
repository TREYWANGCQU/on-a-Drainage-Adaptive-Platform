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
                K=0.08,
                h=25.0,
                p_mm=1100.0,
                Kg=0.005,
                K1=0.02,
                K2=0.0001,
                ha=3.0,
                cn_condition="灌溉良好",
                land_use="商业用地",
                grades=4,
                r=6.0,
                aspect_ratio=0.75,
                r1=6.6,
                r2=7.2,
                rg=10.0,
                c=40.0,
                start_chainage=0.0,
                end_chainage=1200.0,
                concrete_grade="C35",
                rebar_type="HRB400",
                Ag=0.0025,
                D_spacing=45.0,
                beta2=0.85,
                P_crit=0.0,
                I_long=0.02,
                double_side=True
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