"""Operational endpoints."""

from fastapi import APIRouter

from ..dependencies import SettingsDep
from ..models import HealthResponse

router = APIRouter(prefix="/health", tags=["system"])


@router.get("", response_model=HealthResponse)
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(
        status="ready",
        application=settings.app_name,
        environment=settings.environment,
    )
