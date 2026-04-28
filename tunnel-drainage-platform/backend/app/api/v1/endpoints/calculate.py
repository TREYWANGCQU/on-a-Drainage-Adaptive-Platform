# backend/app/api/calculate.py

from fastapi import APIRouter, HTTPException
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
    3. 透传包括内力、应力节点在内的所有 Echarts 作图计算结果。
    """
    try:
        # 执行计算并直接返回完整的透传数据字典
        # 增加日志或简单的 print 辅助定位输入数据问题
        result = run_calculation(data)
        return result
    except AttributeError as e:
        # 针对 'module' object has not callable 的特定捕获
        raise HTTPException(status_code=500, detail=f"底层函数调用错误，请检查模块引入: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算引擎内部错误: {str(e)}")