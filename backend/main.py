"""ASGI entrypoint: ``uvicorn main:app --reload``."""
from app.presentation.api.factory import create_app

app = create_app()
