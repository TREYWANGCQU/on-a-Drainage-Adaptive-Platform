# backend/app/api/v1/endpoints/database.py
import os
import re
import uuid
import base64
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Literal
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.db.session import AsyncSessionLocal
from app.models.domain import TunnelParameter, ProjectGroup

router = APIRouter()

# 静态资源保存路径配置
COVERS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/uploads/covers"))
os.makedirs(COVERS_DIR, exist_ok=True)

# ---------------------------------------------------------
# 依赖注入：获取异步数据库会话
# ---------------------------------------------------------
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ---------------------------------------------------------
# 桩号格式化算法 (标准工程桩号推导器)
# ---------------------------------------------------------
def format_station(length_m: float) -> str:
    km = int(length_m // 1000)
    m = int(round(length_m % 1000))
    return f"K{km}+{m:03d}"

def generate_segment_name(
    group_name: str,
    start_chainage: float,
    end_chainage: float,
    index: int,
    pattern: str = "standard_station"
) -> str:
    st_start = format_station(start_chainage)
    st_end = format_station(end_chainage)
    if pattern == "metric_range":
        return f"{group_name} [{start_chainage:.1f}m~{end_chainage:.1f}m]"
    elif pattern == "indexed_station":
        return f"{group_name}_#{index + 1:02d}_{st_start}"
    else: # standard_station
        return f"{group_name}_{st_start}~{st_end}"

# ---------------------------------------------------------
# Pydantic 请求与响应模型 (DTO)
# ---------------------------------------------------------
class BatchSegmentItem(BaseModel):
    remark: str | None = Field(default=None, description="原始备注说明")
    start_chainage: float = Field(..., description="分段起点里程(m)")
    end_chainage: float = Field(..., description="分段终点里程(m)")
    parameters_json: Dict[str, Any] = Field(..., description="前端表单输入参数字典")
    results_json: Dict[str, Any] | None = Field(default=None, description="已完成的计算结果输出字典 (纯参数工况传入 None)")

class BatchArchiveRequest(BaseModel):
    group_name: str = Field(..., description="统一工程组名，如 '晏家隧道'")
    engineering_category: Literal["公路", "铁路", "城市道路", "城市轨道", "水工", "综合管廊", "其他"] = Field(
        default="公路", description="统一工程交通属性分类"
    )
    description: str | None = Field(default=None, description="工程概况与地质特征描述")
    naming_pattern: Literal["standard_station", "metric_range", "indexed_station"] = Field(
        default="standard_station", description="桩号自动命名规则模板"
    )
    conflict_mode: Literal["append", "overwrite", "create_new"] = Field(
        default="overwrite", description="若工程组重名时的处理策略"
    )
    segments: List[BatchSegmentItem] = Field(..., description="待入库的分段快照列表 (平权包含纯参数或带成果工况)")

class ParameterCreate(BaseModel):
    project_name: str = Field(..., description="工程命名，如 '某某隧道 K20+100段'")
    tunnel_type: str | None = Field(default=None, description="工程分类（公路/铁路/市政等）")
    engineering_category: Literal["公路", "铁路", "城市道路", "城市轨道", "水工", "综合管廊", "其他"] | None = Field(
        default=None, description="工程分类显式别名"
    )
    group_id: int | None = Field(default=None, description="关联既有工程组ID（可选）")
    parameters_json: Dict[str, Any] = Field(..., description="前端表单参数字典")
    results_json: Dict[str, Any] | None = Field(default=None, description="当前的计算结果字典（如有）")

class ParameterResponse(BaseModel):
    id: int
    group_id: int | None = None
    project_name: str
    tunnel_type: str
    start_chainage: float
    end_chainage: float
    parameters_json: str
    results_json: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

class ProjectGroupSummaryResponse(BaseModel):
    id: int
    group_name: str
    tunnel_type: str
    description: str | None = None
    cover_image_url: str | None = None
    start_chainage: float
    end_chainage: float
    segment_count: int
    calculated_count: int = Field(default=0, description="已完成计算分段数")
    warning_count: int = Field(default=0, description="预警分段数")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class ProjectGroupUpdate(BaseModel):
    group_name: str | None = None
    tunnel_type: Literal["公路", "铁路", "城市道路", "城市轨道", "水工", "综合管廊", "其他"] | None = None
    description: str | None = None

class CoverBase64Request(BaseModel):
    image_base64: str = Field(..., description="Data URL Base64 图片数据")

# ---------------------------------------------------------
# 工程组 (ProjectGroup) 端点
# ---------------------------------------------------------

@router.get("/projects", response_model=List[ProjectGroupSummaryResponse])
async def list_project_groups(
    search: str | None = Query(default=None, description="按工程组名模糊搜索"),
    tunnel_type: str | None = Query(default=None, description="按分类筛选"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """
    【获取工程组卡片列表】秒级直读微标统计信息，无需反序列化数百段参数。
    """
    stmt = select(ProjectGroup).order_by(ProjectGroup.updated_at.desc())
    if search:
        stmt = stmt.where(ProjectGroup.group_name.ilike(f"%{search}%"))
    if tunnel_type:
        stmt = stmt.where(ProjectGroup.tunnel_type == tunnel_type)
    
    stmt = stmt.offset(skip).limit(limit)
    res = await db.execute(stmt)
    return list(res.scalars().all())

@router.get("/projects/{project_id}", response_model=ProjectGroupSummaryResponse)
async def get_project_group(project_id: int, db: AsyncSession = Depends(get_db)):
    """
    【获取单工程组摘要】
    """
    res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == project_id))
    group = res.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="Project group not found")
    return group

@router.get("/projects/{project_id}/parameters", response_model=List[ParameterResponse])
async def list_group_parameters(project_id: int, db: AsyncSession = Depends(get_db)):
    """
    【下钻抽屉查询】获取指定工程组名下的全部分段参数与计算状态列表。
    """
    res = await db.execute(
        select(TunnelParameter)
        .where(TunnelParameter.group_id == project_id)
        .order_by(TunnelParameter.start_chainage.asc())
    )
    return list(res.scalars().all())

@router.put("/projects/{project_id}", response_model=ProjectGroupSummaryResponse)
async def update_project_group(
    project_id: int,
    group_in: ProjectGroupUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    【再编辑工程信息】更新工程组名称、工程分类与地质水文概况描述。若更新分类，级联更新其下分段分类。
    """
    res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == project_id))
    group = res.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="Project group not found")

    if group_in.group_name is not None and group_in.group_name != group.group_name:
        # 检查重名
        dup = await db.execute(
            select(ProjectGroup).where(
                ProjectGroup.group_name == group_in.group_name,
                ProjectGroup.id != project_id
            )
        )
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail="该工程组名已存在，请换一个名称")
        group.group_name = group_in.group_name

    if group_in.tunnel_type is not None:
        group.tunnel_type = group_in.tunnel_type
        # 级联更新子段工程分类
        params_res = await db.execute(select(TunnelParameter).where(TunnelParameter.group_id == project_id))
        for p in params_res.scalars().all():
            p.tunnel_type = group_in.tunnel_type

    if group_in.description is not None:
        group.description = group_in.description

    group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(group)
    return group

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_group(project_id: int, db: AsyncSession = Depends(get_db)):
    """
    【删除工程组】级联清理工程组实体与其名下全部计算分段，并删除本地孤立封面文件。
    """
    res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == project_id))
    group = res.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="Project group not found")

    # 尝试物理清理封面图片文件
    if group.cover_image_url and group.cover_image_url.startswith("/static/covers/"):
        filename = os.path.basename(group.cover_image_url)
        local_cover_path = os.path.join(COVERS_DIR, filename)
        if os.path.exists(local_cover_path):
            try:
                os.remove(local_cover_path)
            except Exception:
                pass

    await db.delete(group)
    await db.commit()

@router.post("/projects/{project_id}/cover")
async def upload_project_cover(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    【上传工程封面图片】验证格式与大小，持久化并更新 cover_image_url。
    """
    res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == project_id))
    group = res.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="Project group not found")

    content_type = file.content_type or ""
    if not any(t in content_type for t in ["image/jpeg", "image/png", "image/webp"]):
        raise HTTPException(status_code=400, detail="只支持 JPG / PNG / WebP 格式的图片")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="封面图片大小不能超过 5MB")

    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"

    filename = f"cover_{project_id}_{uuid.uuid4().hex[:8]}{ext}"
    target_path = os.path.join(COVERS_DIR, filename)
    with open(target_path, "wb") as f:
        f.write(content)

    group.cover_image_url = f"/static/covers/{filename}"
    group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"cover_image_url": group.cover_image_url}

@router.post("/projects/{project_id}/cover-base64")
async def save_project_cover_base64(
    project_id: int,
    payload: CoverBase64Request,
    db: AsyncSession = Depends(get_db)
):
    """
    【3D 视口画布截屏一键转封面】接收前端 canvas base64 数据并保存为静态图片。
    """
    res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == project_id))
    group = res.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="Project group not found")

    base64_str = payload.image_base64
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]

    try:
        img_bytes = base64.b64decode(base64_str)
    except Exception:
        raise HTTPException(status_code=400, detail="非法的 Base64 图片数据")

    if len(img_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="截屏文件过大(>5MB)")

    filename = f"canvas_cover_{project_id}_{uuid.uuid4().hex[:8]}.png"
    target_path = os.path.join(COVERS_DIR, filename)
    with open(target_path, "wb") as f:
        f.write(img_bytes)

    group.cover_image_url = f"/static/covers/{filename}"
    group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"cover_image_url": group.cover_image_url}

# ---------------------------------------------------------
# 参数分段 (TunnelParameter) 批量与单条持久化端点
# ---------------------------------------------------------

@router.post("/parameters/batch", status_code=status.HTTP_201_CREATED)
async def batch_archive_parameters(
    req: BatchArchiveRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    【百段批量入库核心端点】
    1. 事务性维护 ProjectGroup；
    2. 按桩号算法自动推导各分段命名；
    3. 平权保存纯计算参数工况与带成果工况；
    4. 自动维护 segment_count / calculated_count / warning_count / start_chainage / end_chainage 统计列。
    """
    if not req.segments:
        raise HTTPException(status_code=400, detail="分段列表不能为空")

    # 1. 查找或创建 ProjectGroup
    target_group_name = req.group_name.strip()
    exist_res = await db.execute(select(ProjectGroup).where(ProjectGroup.group_name == target_group_name))
    existing_group = exist_res.scalars().first()

    group: ProjectGroup
    if existing_group:
        if req.conflict_mode == "overwrite":
            # 覆盖模式：清空现有分段并复用该工程组
            group = existing_group
            group.tunnel_type = req.engineering_category
            if req.description:
                group.description = req.description
            await db.execute(delete(TunnelParameter).where(TunnelParameter.group_id == group.id))
        elif req.conflict_mode == "create_new":
            # 新建副本
            suffix = datetime.now().strftime("%Y%m%d%H%M%S")
            new_name = f"{target_group_name}_{suffix}"
            group = ProjectGroup(
                group_name=new_name,
                tunnel_type=req.engineering_category,
                description=req.description
            )
            db.add(group)
            await db.flush()
        else: # append
            group = existing_group
    else:
        group = ProjectGroup(
            group_name=target_group_name,
            tunnel_type=req.engineering_category,
            description=req.description
        )
        db.add(group)
        await db.flush()

    # 2. 批量构建并插入 TunnelParameter
    calc_count = 0
    warn_count = 0
    all_starts = []
    all_ends = []

    for idx, seg in enumerate(req.segments):
        # 智能命名
        seg_name = generate_segment_name(
            group_name=target_group_name,
            start_chainage=seg.start_chainage,
            end_chainage=seg.end_chainage,
            index=idx,
            pattern=req.naming_pattern
        )

        has_results = bool(seg.results_json and (seg.results_json.get("original_state") or seg.results_json.get("critical_state")))
        if has_results:
            calc_count += 1
            if seg.results_json.get("critical_state"):
                warn_count += 1

        all_starts.append(seg.start_chainage)
        all_ends.append(seg.end_chainage)

        param_record = TunnelParameter(
            group_id=group.id,
            project_name=seg_name,
            tunnel_type=req.engineering_category,
            parameters_json=json.dumps(seg.parameters_json, ensure_ascii=False),
            results_json=json.dumps(seg.results_json, ensure_ascii=False) if seg.results_json else None,
            start_chainage=seg.start_chainage,
            end_chainage=seg.end_chainage
        )
        db.add(param_record)

    await db.flush()

    # 3. 统计汇总并更新工程组缓存字段
    if req.conflict_mode == "append" and existing_group:
        # 重新全量统计
        count_res = await db.execute(
            select(
                func.count(TunnelParameter.id),
                func.min(TunnelParameter.start_chainage),
                func.max(TunnelParameter.end_chainage)
            ).where(TunnelParameter.group_id == group.id)
        )
        total_segs, min_s, max_e = count_res.first() or (0, 0.0, 0.0)
        group.segment_count = total_segs
        group.start_chainage = min_s if min_s is not None else 0.0
        group.end_chainage = max_e if max_e is not None else 0.0
        # 计算已算数
        calc_res = await db.execute(
            select(func.count(TunnelParameter.id))
            .where(TunnelParameter.group_id == group.id, TunnelParameter.results_json.isnot(None))
        )
        group.calculated_count = calc_res.scalar() or 0
    else:
        group.segment_count = len(req.segments)
        group.calculated_count = calc_count
        group.warning_count = warn_count
        group.start_chainage = min(all_starts) if all_starts else 0.0
        group.end_chainage = max(all_ends) if all_ends else 0.0

    group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(group)

    return {
        "message": "批量入库成功",
        "group_id": group.id,
        "group_name": group.group_name,
        "segment_count": group.segment_count,
        "calculated_count": group.calculated_count,
        "start_chainage": group.start_chainage,
        "end_chainage": group.end_chainage
    }

@router.post("/parameters", response_model=ParameterResponse, status_code=status.HTTP_201_CREATED)
async def create_parameter(param_in: ParameterCreate, db: AsyncSession = Depends(get_db)):
    """
    【单段入库兼容】支持关联既有工程组或归入默认组，同步更新工程组统计字段。
    """
    target_category = param_in.engineering_category or param_in.tunnel_type or "公路"
    start_c = float(param_in.parameters_json.get("start_chainage", 0.0))
    end_c = float(param_in.parameters_json.get("end_chainage", start_c + 10.0))

    group_id = param_in.group_id
    if not group_id:
        # 寻找或创建默认工程组
        g_res = await db.execute(select(ProjectGroup).limit(1))
        def_group = g_res.scalars().first()
        if not def_group:
            def_group = ProjectGroup(
                group_name="默认未分组工程",
                tunnel_type=target_category,
                description="系统默认工程组",
                start_chainage=start_c,
                end_chainage=end_c
            )
            db.add(def_group)
            await db.flush()
        group_id = def_group.id
        target_category = def_group.tunnel_type

    has_results = bool(param_in.results_json and (param_in.results_json.get("original_state") or param_in.results_json.get("critical_state")))

    db_obj = TunnelParameter(
        group_id=group_id,
        project_name=param_in.project_name,
        tunnel_type=target_category,
        parameters_json=json.dumps(param_in.parameters_json, ensure_ascii=False),
        results_json=json.dumps(param_in.results_json, ensure_ascii=False) if param_in.results_json else None,
        start_chainage=start_c,
        end_chainage=end_c
    )
    db.add(db_obj)
    await db.flush()

    # 更新工程组缓存
    group_res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == group_id))
    group = group_res.scalars().first()
    if group:
        group.segment_count = (group.segment_count or 0) + 1
        if has_results:
            group.calculated_count = (group.calculated_count or 0) + 1
            if param_in.results_json.get("critical_state"):
                group.warning_count = (group.warning_count or 0) + 1
        group.start_chainage = min(group.start_chainage or 0.0, start_c)
        group.end_chainage = max(group.end_chainage or 0.0, end_c)
        group.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.get("/parameters", response_model=List[ParameterResponse])
async def list_parameters(skip: int = 0, limit: int = 500, db: AsyncSession = Depends(get_db)):
    """
    【检索列表】获取所有参数记录列表（扁平台账兼容）。
    """
    result = await db.execute(
        select(TunnelParameter)
        .order_by(TunnelParameter.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())

@router.get("/parameters/{param_id}", response_model=ParameterResponse)
async def get_parameter(param_id: int, db: AsyncSession = Depends(get_db)):
    """
    【获取详情】根据 ID 获取特定分段记录。
    """
    result = await db.execute(select(TunnelParameter).where(TunnelParameter.id == param_id))
    parameter = result.scalars().first()
    if not parameter:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return parameter

@router.delete("/parameters/{param_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_parameter(param_id: int, db: AsyncSession = Depends(get_db)):
    """
    【删除】删除单条分段记录，并更新所属工程组统计。
    """
    result = await db.execute(select(TunnelParameter).where(TunnelParameter.id == param_id))
    parameter = result.scalars().first()
    if not parameter:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    group_id = parameter.group_id
    has_results = bool(parameter.results_json)

    await db.delete(parameter)
    await db.flush()

    if group_id:
        group_res = await db.execute(select(ProjectGroup).where(ProjectGroup.id == group_id))
        group = group_res.scalars().first()
        if group:
            group.segment_count = max(0, (group.segment_count or 1) - 1)
            if has_results:
                group.calculated_count = max(0, (group.calculated_count or 1) - 1)
            group.updated_at = datetime.now(timezone.utc)

    await db.commit()