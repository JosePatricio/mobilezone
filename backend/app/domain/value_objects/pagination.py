from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Generic, TypeVar

T = TypeVar("T")

MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class PageRequest:
    page: int = 1
    size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


@dataclass
class Page(Generic[T]):
    items: list[T] = field(default_factory=list)
    total: int = 0
    page: int = 1
    size: int = 20

    @property
    def pages(self) -> int:
        return math.ceil(self.total / self.size) if self.size else 0
