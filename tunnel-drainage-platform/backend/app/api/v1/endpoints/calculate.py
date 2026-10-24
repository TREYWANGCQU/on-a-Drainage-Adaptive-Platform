# backend/app/api/v1/endpoints/calculate.py

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
import time
from typing import Union
from app.models.schemas import SingleTubeSchema, DoubleTubeSchema

# 引入实际的底层计算引擎
from app.services.drainage_engine import run_calculation 

router = APIRouter()

@router.post("/drainage", summary="执行隧道多维协同智能排水自适应优化计算")
async def calculate_drainage(data: Union[SingleTubeSchema, DoubleTubeSchema]):
    """
    排水计算核心接口：
    1. 接收单洞(38参数)或双洞(40参数)模型数据。
    2. 自动分发对应的双洞/单洞、高/低水位模型计算。
    3. 委托工作线程池运行 CPU 密集型的有限元计算，消除 FastAPI 主事件循环阻塞。
    4. 透传包括内力、应力节点在内的所有 Echarts 作图计算结果与执行耗时 duration_ms。
    """
    try:
        t0 = time.perf_counter()
        # 委托工作线程池运行 CPU 密集型的有限元计算，不阻塞主事件循环
        result = await run_in_threadpool(run_calculation, data)
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        if isinstance(result, dict):
            result["duration_ms"] = duration_ms
        return result
    except AttributeError as e:
        # 针对 'module' object has not callable 的特定捕获
        raise HTTPException(status_code=500, detail=f"底层函数调用错误，请检查模块引入: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算引擎内部错误: {str(e)}")