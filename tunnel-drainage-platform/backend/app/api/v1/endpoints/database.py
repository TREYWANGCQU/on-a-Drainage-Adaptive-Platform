# backend/app/api/v1/endpoints/database.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Literal
import json
from datetime import datetime

from app.db.session import AsyncSessionLocal
from app.models.domain import TunnelParameter

router = APIRouter()

# ---------------------------------------------------------
# 依赖注入：获取异步数据库会话
# ---------------------------------------------------------
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ---------------------------------------------------------
# Pydantic 请求与响应模型 (DTO)
# ---------------------------------------------------------
class ParameterCreate(BaseModel):
    project_name: str = Field(..., description="工程命名，如 '某某隧道 K20+100段'")
    tunnel_type: Literal["城市道路", "城市轨道", "公路", "铁路", "水工", "综合管廊", "其他"] = Field(..., description="隧道分类（城市道路/城市轨道/公路/铁路/水工/综合管廊/其他）")
    parameters_json: Dict[str, Any] = Field(..., description="38/40个前端表单参数字典")
    results_json: Dict[str, Any] | None = Field(default=None, description="当前的计算结果字典（如有）")

class ParameterResponse(BaseModel):
    id: int
    project_name: str
    tunnel_type: str
    parameters_json: str
    results_json: str | None = None
    created_at: datetime

    # Pydantic V2 语法，允许从 SQLAlchemy ORM 模型解析数据
    model_config = {"from_attributes": True}

# ---------------------------------------------------------
# CRUD 接口路由定义
# ---------------------------------------------------------

@router.post("/parameters", response_model=ParameterResponse, status_code=status.HTTP_201_CREATED)
async def create_parameter(param_in: ParameterCreate, db: AsyncSession = Depends(get_db)):
    """
    【创建】另存为并命名：将前端当前的工程参数配置存入数据库，实现跨项目复用沉淀。
    """
    # 将前端传来的字典显式序列化为 JSON 字符串入库
    db_obj = TunnelParameter(
        project_name=param_in.project_name,
        tunnel_type=param_in.tunnel_type,
        parameters_json=json.dumps(param_in.parameters_json, ensure_ascii=False),
        results_json=json.dumps(param_in.results_json, ensure_ascii=False) if param_in.results_json else None
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.get("/parameters", response_model=List[ParameterResponse])
async def list_parameters(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    """
    【检索列表】获取参数数据库中的所有存档列表，按创建时间倒序排列（用于填充左侧下拉列表或台账表格）。
    """
    result = await db.execute(
        select(TunnelParameter)
        .order_by(TunnelParameter.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    parameters = result.scalars().all()
    return list(parameters)

@router.get("/parameters/{param_id}", response_model=ParameterResponse)
async def get_parameter(param_id: int, db: AsyncSession = Depends(get_db)):
    """
    【获取详情】根据 ID 获取特定的工程参数数据字典，用于一键覆盖恢复到前端 Store。
    """
    result = await db.execute(select(TunnelParameter).where(TunnelParameter.id == param_id))
    parameter = result.scalars().first()
    if not parameter:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return parameter

@router.delete("/parameters/{param_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_parameter(param_id: int, db: AsyncSession = Depends(get_db)):
    """
    【删除】删除指定的工程参数存档。
    """
    result = await db.execute(select(TunnelParameter).where(TunnelParameter.id == param_id))
    parameter = result.scalars().first()
    if not parameter:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    await db.delete(parameter)
    await db.commit()