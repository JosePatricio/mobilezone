from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.application.services.security import AccessToken, TokenService
from app.domain.exceptions import AuthenticationError


class JwtTokenService(TokenService):
    def __init__(self, secret_key: str, algorithm: str = "HS256", expire_minutes: int = 60) -> None:
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.expire_minutes = expire_minutes

    def create_access_token(self, user_id: int) -> AccessToken:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=self.expire_minutes)
        payload = {"sub": str(user_id), "iat": now, "exp": expires_at, "type": "access"}
        return AccessToken(token=jwt.encode(payload, self.secret_key, algorithm=self.algorithm), expires_at=expires_at)

    def decode_user_id(self, token: str) -> int:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm], options={"require": ["exp", "sub"]})
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationError("La sesión ha expirado.", code="TOKEN_EXPIRED") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthenticationError("Token inválido.", code="INVALID_TOKEN") from exc
        if payload.get("type") != "access":
            raise AuthenticationError("Token inválido.", code="INVALID_TOKEN")
        try:
            return int(payload["sub"])
        except (TypeError, ValueError) as exc:
            raise AuthenticationError("Token inválido.", code="INVALID_TOKEN") from exc
