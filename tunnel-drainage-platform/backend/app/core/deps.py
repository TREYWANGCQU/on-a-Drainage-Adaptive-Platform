# tunnel-drainage-platform/backend/app/core/deps.py

from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status
from app.core.config import settings
from app.services.auth_service import verify_operator_token

async def require_operator_auth(
    x_operator_token: Optional[str] = Header(None, alias="X-Operator-Token"),
    authorization: Optional[str] = Header(None, alias="Authorization")
) -> Dict[str, Any]:
    """
    操作员权限依赖注入守卫：
    1. 若系统环境配置 PLATFORM_AUTH_ENABLED=False（单机免密模式），直接放行；
    2. 优先提取自定义 Header: X-Operator-Token；
    3. 次选提取标准 Authorization: Bearer <token>；
    4. 若未提供任何凭证，返回 401 Unauthorized；
    5. 若签名不符或时间戳已过期，返回 401 Unauthorized 并阻断敏感操作。
    """
    if not settings.PLATFORM_AUTH_ENABLED:
        return {"sub": "operator", "mode": "disabled", "status": "bypass"}

    token = x_operator_token
    if not token and authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少操作授权凭证，操作被拒绝",
            headers={"WWW-Authenticate": "Bearer"}
        )

    is_valid, err_msg, payload = verify_operator_token(token)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"操作授权凭证无效或已过期 ({err_msg})",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return payload or {}
