"""
Validation Route — Post-Mitigation Deployment Readiness Testing

Endpoints:
- POST /api/validate/run     — Run three validation tests on original AND
  reweighting-mitigated model (fast, ~15 sec)
- POST /api/validate/run-rl  — Run full 3-way validation including an
  RL-discovered mitigation sequence (slower, ~30-45 sec)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dataclasses import asdict

from app.services.validate import run_validation, run_rl_validation
from app.services import dataset_manager

router = APIRouter(prefix="/api/validate", tags=["Validate"])


class ValidateRequest(BaseModel):
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float


def _result_to_dict(result) -> dict:
    if result is None:
        return None
    return {
        "model_label": result.model_label,
        "total_score": result.total_score,
        "badge": result.badge,
        "badge_label": result.badge_label,
        "badge_color": result.badge_color,
        "summary": result.summary,
        "fresh_cohort": asdict(result.fresh_cohort),
        "shadow": asdict(result.shadow),
        "stability": asdict(result.stability),
    }


def _comparison_to_dict(result) -> dict:
    return {
        "dataset_id": result.dataset_id,
        "status": result.status,
        "score_improvement": result.score_improvement,
        "rl_score_improvement": result.rl_score_improvement,
        "rl_vs_standard": result.rl_vs_standard,
        "improvement_verdict": result.improvement_verdict,
        "rl_verdict": result.rl_verdict,
        "narrative_primary": result.narrative_primary,
        "narrative_alternative": result.narrative_alternative,
        "original": _result_to_dict(result.original),
        "mitigated": _result_to_dict(result.mitigated),
        "rl_mitigated": _result_to_dict(result.rl_mitigated),
    }


@router.post("/run")
async def run_validate(request: ValidateRequest):
    """
    Run the basic two-way deployment readiness validation.

    Trains both original and reweighting-mitigated models, then runs
    three tests on each:
      1. Fresh Cohort Simulation (40 pts)
      2. Shadow Deployment Disagreement (35 pts)
      3. Stability Under Perturbation (25 pts)

    Returns a comparison with Deployment Readiness Scores (0-100).
    Fast — typically completes in 10-20 seconds.
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    attrs = [a.strip() for a in request.protected_attributes]
    label = str(request.label_column).strip()

    if not attrs:
        raise HTTPException(status_code=400, detail="At least one protected attribute required")

    primary_attr = attrs[0]
    if primary_attr not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{primary_attr}' not found")
    if label not in df.columns:
        raise HTTPException(status_code=400, detail=f"Label column '{label}' not found")

    try:
        result = run_validation(
            dataset_id=request.dataset_id,
            df=df,
            protected_attribute=primary_attr,
            label_column=label,
            favorable_label=request.favorable_label,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

    return _comparison_to_dict(result)


@router.post("/run-rl")
async def run_validate_rl(request: ValidateRequest):
    """
    Run full three-way validation including an RL-discovered mitigation sequence.

    Extends the basic validation with a third model (reweighting → threshold
    optimizer, the optimal sequence the RL optimizer typically discovers).

    Slower — typically completes in 30-45 seconds because it trains an
    additional post-processed model and runs all three tests on it.

    Returns the full three-way comparison with:
      - Original model score
      - Standard mitigation score
      - RL-discovered sequence score
      - Narratives (primary and alternative framings)
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    attrs = [a.strip() for a in request.protected_attributes]
    label = str(request.label_column).strip()

    if not attrs:
        raise HTTPException(status_code=400, detail="At least one protected attribute required")

    primary_attr = attrs[0]
    if primary_attr not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{primary_attr}' not found")
    if label not in df.columns:
        raise HTTPException(status_code=400, detail=f"Label column '{label}' not found")

    try:
        result = run_rl_validation(
            dataset_id=request.dataset_id,
            df=df,
            protected_attribute=primary_attr,
            label_column=label,
            favorable_label=request.favorable_label,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RL validation failed: {str(e)}")

    return _comparison_to_dict(result)