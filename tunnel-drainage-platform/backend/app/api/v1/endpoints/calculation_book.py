# backend/app/api/v1/endpoints/calculation_book.py
"""
计算书 Typst 编译与导出 API 路由模块
提供单份高保真 A4 矢量 PDF 导出与多快照并发 ZIP 压缩包下载
"""

import io
from urllib.parse import quote
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import Response, StreamingResponse

from app.services.typst_exporter import (
    compile_calculation_book_pdf,
    batch_compile_calculation_books_zip
)

router = APIRouter()


class BatchExportPayload(BaseModel):
    snapshots: List[Dict[str, Any]]
    project_name: Optional[str] = "隧道工程"
    max_workers: Optional[int] = 4


@router.post("/export-pdf", summary="导出单份 A4 计算书矢量 PDF")
async def export_calculation_book_pdf_endpoint(
    payload: Dict[str, Any] = Body(...)
):
    """
    单份计算书编译导出：
    接收 Snapshot 结构或已生成的 CalculationBookData，
    通过 Typst 编译引擎生成 100% 纯矢量、可检索、高精度的 PDF 文档。
    """
    try:
        pdf_bytes, filename = compile_calculation_book_pdf(payload)
        encoded_filename = quote(filename)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Typst 计算书 PDF 编译失败: {str(e)}"
        )


@router.post("/batch-export", summary="批量导出计算书为 ZIP 压缩包")
async def batch_export_calculation_books_endpoint(
    payload: BatchExportPayload
):
    """
    多快照批量并发编译与 ZIP 打包归档：
    接收快照列表，通过 Python 多线程调用 Typst 编译器并行生成独立 PDF，
    并在内存中直接流式打包为标准 ZIP 交付。
    """
    if not payload.snapshots:
        raise HTTPException(
            status_code=400,
            detail="快照列表不能为空"
        )
        
    try:
        zip_bytes, zip_filename = batch_compile_calculation_books_zip(
            snapshots=payload.snapshots,
            project_name=payload.project_name or "隧道工程",
            max_workers=payload.max_workers or 4
        )
        encoded_filename = quote(zip_filename)
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"批量计算书生成与 ZIP 打包失败: {str(e)}"
        )
