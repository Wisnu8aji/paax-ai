"""
PAAX Core Engine - FastAPI Application
Deterministic calculation service for RAB, Schedule, Validation, and Export.
All numerical computations happen here — never in the LLM layer.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health_routes import router as health_router
from app.api.rab_routes import router as rab_router
from app.api.schedule_routes import router as schedule_router
from app.api.export_routes import router as export_router
from app.api.validation_routes import router as validation_router

app = FastAPI(
    title="PAAX Core Engine",
    description=(
        "Deterministic calculation backend for PAAX AI civil engineering workspace. "
        "Handles RAB generation, schedule planning, validation, and Excel export. "
        "Angka final dihitung oleh core-engine, bukan LLM."
    ),
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, tags=["Health"])
app.include_router(rab_router, prefix="/rab", tags=["RAB"])
app.include_router(schedule_router, prefix="/schedule", tags=["Schedule"])
app.include_router(export_router, prefix="/export", tags=["Export"])
app.include_router(validation_router, prefix="/validation", tags=["Validation"])


@app.on_event("startup")
async def startup_event() -> None:
    """Log startup and initialise shared resources."""
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("paax.core")
    logger.info("PAAX Core Engine v0.3.0 started")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
