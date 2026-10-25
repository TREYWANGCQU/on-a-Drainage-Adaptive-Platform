# tunnel-drainage-platform/backend/app/services/auth_service.py

import base64
import hashlib
import hmac
import json
import time
import threading
from typing import Tuple, Dict, Any, Optional
from app.core.config import settings

class InMemoryRateLimiter:
    """
    内存级滑动窗口防爆破限流器：
    限制单 IP 错误尝试次数（默认 5 次），超限后锁定特定时长（默认 300 秒）。
    采用线程锁保障并发安全，无须引入外部 Redis。
    """
    def __init__(self, max_attempts: int = 5, lock_duration: int = 300):
        self.max_attempts = max_attempts
        self.lock_duration = lock_duration
        self._lock = threading.Lock()
        self._failures: Dict[str, list] = {}  # ip -> list of failure timestamps
        self._locked_until: Dict[str, float] = {}  # ip -> lock expiry timestamp

    def check_rate_limit(self, client_ip: str) -> Tuple[bool, int]:
        """
        检查是否被锁定
        返回: (是否锁定, 剩余锁定秒数)
        """
        now = time.time()
        with self._lock:
            lock_time = self._locked_until.get(client_ip, 0)
            if now < lock_time:
                remaining = int(lock_time - now) + 1
                return True, remaining
            elif client_ip in self._locked_until:
                # 锁定已过期，清理
                del self._locked_until[client_ip]
                self._failures.pop(client_ip, None)
            return False, 0

    def record_failure(self, client_ip: str) -> Tuple[int, int]:
        """
        记录一次密码错误
        返回: (剩余尝试次数, 锁定时长秒数[若被锁])
        """
        now = time.time()
        with self._lock:
            # 清理超过锁定窗口的历史记录
            history = [t for t in self._failures.get(client_ip, []) if now - t < self.lock_duration]
            history.append(now)
            self._failures[client_ip] = history

            if len(history) >= self.max_attempts:
                lock_until = now + self.lock_duration
                self._locked_until[client_ip] = lock_until
                return 0, self.lock_duration
            else:
                remaining_attempts = self.max_attempts - len(history)
                return remaining_attempts, 0

    def reset(self, client_ip: str):
        """认证成功后重置该 IP 的失败记录"""
        with self._lock:
            self._failures.pop(client_ip, None)
            self._locked_until.pop(client_ip, None)


# 全局单例限流器
rate_limiter = InMemoryRateLimiter(max_attempts=5, lock_duration=300)


def _b64url_encode(data: bytes) -> str:
    """Base64Url 编码，去除尾部等号填充"""
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    """Base64Url 解码，自动补齐等号"""
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("utf-8"))


def generate_operator_token(sub: str = "operator", expires_in_seconds: int = 7200, mode: str = "server") -> Tuple[str, int]:
    """
    签发轻量无状态 HMAC-SHA256 签名时间戳令牌 (RFC 7519 标准子集)
    返回: (token, expires_at)
    """
    now = int(time.time())
    expires_at = now + expires_in_seconds

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": sub,
        "iat": now,
        "exp": expires_at,
        "mode": mode
    }

    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    secret_key = settings.PLATFORM_SECRET_KEY.encode("utf-8")
    signature = hmac.new(secret_key, signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    token = f"{header_b64}.{payload_b64}.{sig_b64}"
    return token, expires_at


def verify_operator_token(token: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    核验证书有效性 (签名与时间戳)
    返回: (是否合法, 错误描述, 解析出来的载荷)
    """
    if not token or not isinstance(token, str):
        return False, "凭证格式无效", None

    parts = token.split(".")
    if len(parts) != 3:
        return False, "凭证结构异常", None

    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    secret_key = settings.PLATFORM_SECRET_KEY.encode("utf-8")
    expected_sig = hmac.new(secret_key, signing_input, hashlib.sha256).digest()
    expected_sig_b64 = _b64url_encode(expected_sig)

    # 1. 常量时间签名比对，防范时序侧信道攻击
    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        return False, "凭证签名验证失败", None

    # 2. 解码 Payload 并验证时效
    try:
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return False, "凭证内容解析错误", None

    now = int(time.time())
    exp = payload.get("exp", 0)
    if now > exp:
        return False, "凭证已过期", None

    return True, "", payload


def verify_operator_password(password: str) -> bool:
    """
    使用常量时间核对操作密码，杜绝时序泄漏
    """
    if not password:
        return False
    configured_pwd = settings.PLATFORM_AUTH_PASSWORD
    return hmac.compare_digest(password.strip(), configured_pwd.strip())
