"""
main.py
-------
FastAPI application entry point for the Carbon Credit Analytics platform.

Startup sequence:
  1. Create all SQLite tables (idempotent).
  2. Seed 6 months of carbon credit price history if the DB is empty.
  3. Mount all four routers under /api/v1.

Run with:
    uvicorn main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal, init_db, seed_database
from routes.prices      import router as prices_router
from routes.portfolio   import router as portfolio_router
from routes.footprint   import router as footprint_router
from routes.forecasting import router as forecasting_router
from routes.compat      import router as compat_router

load_dotenv()   # load .env before any route code reads env vars


# ---------------------------------------------------------------------------
# Lifespan — replaces deprecated @app.on_event("startup")
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield
    # nothing to tear down for SQLite


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Carbon Credit Analytics API",
    description=(
        "Backend for a corporate carbon credit platform. "
        "Features: price tracking, portfolio management, "
        "CO₂ footprint calculator, and AI-powered forecasting."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow the React frontend (adjust origins in production)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Create React App
        "http://localhost:5173",   # Vite
        "http://localhost:4173",   # Vite preview
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

API_PREFIX = "/api/v1"

app.include_router(prices_router,      prefix=API_PREFIX)
app.include_router(portfolio_router,   prefix=API_PREFIX)
app.include_router(footprint_router,   prefix=API_PREFIX)
app.include_router(forecasting_router, prefix=API_PREFIX)
app.include_router(compat_router)   # /api/* — matches frontend's hardcoded URLs


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "carbon-credit-api"}


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "Carbon Credit Analytics API",
        "docs": "/docs",
        "version": "1.0.0",
    }
