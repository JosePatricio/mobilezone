"""Security ports used by the use cases. Implemented in infrastructure/security."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


class PasswordHasher(ABC):
    @abstractmethod
    def hash(self, password: str) -> str: ...

    @abstractmethod
    def verify(self, password: str, password_hash: str) -> bool: ...


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_at: datetime


class TokenService(ABC):
    @abstractmethod
    def create_access_token(self, user_id: int) -> AccessToken: ...

    @abstractmethod
    def decode_user_id(self, token: str) -> int:
        """Return the user id of a valid token or raise ``AuthenticationError``."""
