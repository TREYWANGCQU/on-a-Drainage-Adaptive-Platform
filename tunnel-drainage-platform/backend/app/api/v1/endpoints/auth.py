# tunnel-drainage-platform/backend/app/api/v1/endpoints/auth.py

from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.core.config import settings
from app.services.auth_service import (
    rate_limiter,
    verify_operator_password,
    generate_operator_token
)

router = APIRouter()

class AuthVerifyRequest(BaseModel):
    password: str
    remember_me: Optional[bool] = False

@router.get("/status", summary="查询平台当前部署模式与安全认证策略")
async def get_auth_status():
    """
    返回当前后端认证策略，供前端初始化环境自适应感知：
    - auth_required: 是否强制开启操作认证
    - auth_mode: 当前运行模式 (server | desktop | disabled)
    - session_timeout_minutes: 默认令牌超时分钟数
    - has_custom_secret: 是否已配置非出厂默认密码
    """
    effective_mode = settings.PLATFORM_AUTH_MODE if settings.PLATFORM_AUTH_ENABLED else "disabled"
    return {
        "auth_required": settings.PLATFORM_AUTH_ENABLED,
        "auth_mode": effective_mode,
        "session_timeout_minutes": settings.AUTH_TOKEN_EXPIRE_MINUTES,
        "has_custom_secret": settings.PLATFORM_AUTH_PASSWORD != "chongqing123456"
    }

@router.post("/verify", summary="核验操作密码并签发会话令牌")
async def verify_auth(req: AuthVerifyRequest, request: Request):
    """
    操作员身份认证端点：
    1. 实施 IP 级滑动窗口防爆破限流，超过 5 次连续失败锁定 300 秒；
    2. 常量时间核对操作密码；
    3. 核对通过后签发包含时效的 HMAC-SHA256 会话令牌。
    """
    client_ip = request.client.host if request.client else "unknown"

    # 1. 检查防爆破限流状态
    is_locked, remaining_seconds = rate_limiter.check_rate_limit(client_ip)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"密码错误次数过多，请在 {remaining_seconds} 秒后再试"
        )

    # 2. 核验密码
    if not verify_operator_password(req.password):
        remaining_attempts, lock_duration = rate_limiter.record_failure(client_ip)
        if remaining_attempts <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"密码错误次数过多，账户已被锁定 {lock_duration} 秒"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"认证密码错误，还剩 {remaining_attempts} 次尝试机会"
            )

    # 3. 密码正确，重置失败计数
    rate_limiter.reset(client_ip)

    # 4. 计算过期时长（普通会话为设定分钟数，记住我扩展为 24 小时）
    if req.remember_me:
        duration_seconds = 24 * 3600
    else:
        duration_seconds = max(settings.AUTH_TOKEN_EXPIRE_MINUTES * 60, 300)

    token, expires_at = generate_operator_token(
        sub="operator",
        expires_in_seconds=duration_seconds,
        mode=settings.PLATFORM_AUTH_MODE
    )

    return {
        "code": 200,
        "message": "认证成功",
        "data": {
            "token": token,
            "expires_at": expires_at,
            "expires_in_seconds": duration_seconds,
            "auth_mode": settings.PLATFORM_AUTH_MODE
        }
    }
