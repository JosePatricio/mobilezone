from __future__ import annotations

import bcrypt

from app.application.services.security import PasswordHasher


class BcryptPasswordHasher(PasswordHasher):
    def __init__(self, rounds: int = 12) -> None:
        self.rounds = rounds

    def hash(self, password: str) -> str:
        # bcrypt only uses the first 72 bytes; truncate explicitly to avoid errors.
        return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(self.rounds)).decode("utf-8")

    def verify(self, password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
        except ValueError:
            return False
