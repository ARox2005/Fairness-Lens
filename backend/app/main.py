"""
FairnessLens API — Main Entry Point

A production-grade AI fairness auditing platform built for
Google Solution Challenge 2026 India (Unbiased AI Decision theme).

Pipeline: Inspect → Measure → Flag → Fix

Tech stack: FastAPI + AIF360 + Fairlearn + Gemini API
Deployed on: Google Cloud Run + Firebase
"""

import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import inspect, measure, flag, fix, report, model, agent, redteam, counterfactual
from app.api.routes import rl_fix, validate

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fairness-lens")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("FairnessLens API starting up...")
    logger.info(f"Environment: {os.getenv('APP_ENV', 'development')}")
    logger.info(f"Gemini API: {'configured' if os.getenv('GOOGLE_API_KEY') else 'not configured'}")
    yield
    logger.info("FairnessLens API shutting down...")


# ── Create FastAPI app ──
app = FastAPI(
    title="FairnessLens API",
    description=(
        "AI Bias Detection & Mitigation Platform. "
        "Inspect, Measure, Flag, and Fix bias in datasets and ML models. "
        "Built with FastAPI, AIF360, Fairlearn, and Google Gemini API."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS Configuration ──
# In production, set CORS_ORIGINS env var in Render dashboard to your Vercel URL
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
cors_origins = [o.strip() for o in cors_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # allow any vercel preview URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ──
app.include_router(inspect.router)
app.include_router(measure.router)
app.include_router(flag.router)
app.include_router(fix.router)
app.include_router(report.router)
app.include_router(model.router)
app.include_router(agent.router)
app.include_router(redteam.router)
app.include_router(counterfactual.router)
app.include_router(rl_fix.router)
app.include_router(validate.router)


# ── Health Check ──
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "FairnessLens API",
        "version": "1.0.0",
        "status": "healthy",
        "pipeline": ["inspect", "measure", "flag", "fix"],
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "gemini_configured": bool(os.getenv("GOOGLE_API_KEY")),
        "environment": os.getenv("APP_ENV", "development"),
    }


# ── Run with uvicorn ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("APP_ENV") == "development",
    )