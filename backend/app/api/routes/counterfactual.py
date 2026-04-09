"""
Counterfactual Fairness Route

Endpoint:
- POST /api/counterfactual/explain — Generate individual counterfactual stories
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from dataclasses import asdict

from app.services.counterfactual import generate_counterfactuals
from app.services import dataset_manager

router = APIRouter(prefix="/api/counterfactual", tags=["Counterfactual"])


class CounterfactualRequest(BaseModel):
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float
    max_cases: Optional[int] = 8


@router.post("/explain")
async def explain_counterfactuals(request: CounterfactualRequest):
    """
    Generate counterfactual fairness explanations.

    For rejected candidates from unprivileged groups, finds the minimal
    feature changes (with protected attributes LOCKED) that would flip
    the prediction. Reveals proxy discrimination.
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    attrs = [a.strip() for a in request.protected_attributes]
    label = str(request.label_column).strip()
    fav = str(request.favorable_label).strip()

    for col in attrs + [label]:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")

    report = generate_counterfactuals(
        dataset_id=request.dataset_id,
        df=df,
        protected_attributes=attrs,
        label_column=label,
        favorable_label=request.favorable_label,
        max_cases=request.max_cases or 8,
    )

    return {
        "dataset_id": report.dataset_id,
        "status": report.status,
        "total_rejected": report.total_rejected,
        "total_analyzed": report.total_analyzed,
        "summary": report.summary,
        "aggregate_proxy_features": report.aggregate_proxy_features,
        "cases": [
            {
                "individual_id": c.individual_id,
                "original_profile": c.original_profile,
                "counterfactual_profile": c.counterfactual_profile,
                "original_prediction": c.original_prediction,
                "counterfactual_prediction": c.counterfactual_prediction,
                "changed_features": c.changed_features,
                "protected_attributes": c.protected_attributes,
                "narrative": c.narrative,
                "proxy_features_identified": c.proxy_features_identified,
            }
            for c in report.cases
        ],
    }