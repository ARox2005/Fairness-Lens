"""
Red Team Route — Multi-Agent Adversarial Bias Discovery

Endpoints:
- POST /api/red-team/run       — Start a red team session
- GET  /api/red-team/{id}      — Get session status and results
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from dataclasses import asdict

from app.services.redteam import run_red_team, get_redteam_session

router = APIRouter(prefix="/api/red-team", tags=["Red Team"])


class RedTeamRequest(BaseModel):
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float
    max_rounds: Optional[int] = 3


@router.post("/run")
async def start_red_team(request: RedTeamRequest):
    """
    Start a multi-agent red team adversarial bias test.

    Two AI agents work in an adversarial loop:
    - Attacker generates synthetic edge-case profiles
    - Auditor evaluates model predictions and identifies bias hotspots
    """
    import uuid
    session_id = f"rt_{uuid.uuid4().hex[:8]}"

    attrs = [a.strip() for a in request.protected_attributes]
    label = request.label_column.strip()
    fav = str(request.favorable_label).strip()

    session = await run_red_team(
        session_id=session_id,
        dataset_id=request.dataset_id,
        protected_attributes=attrs,
        label_column=label,
        favorable_label=fav,
        max_rounds=request.max_rounds or 3,
    )

    return {
        "session_id": session_id,
        "status": session.status,
        "total_rounds": len(session.rounds),
        "worst_subgroup": session.worst_overall_subgroup,
        "worst_di": session.worst_overall_di,
        "root_cause": session.root_cause,
        "final_summary": session.final_summary,
        "conversation_trace": session.conversation_trace,
        "rounds": [
            {
                "round_num": r.round_num,
                "target_subgroup": r.target_subgroup,
                "profiles_generated": r.profiles_generated,
                "attacker_strategy": r.attacker_strategy,
                "subgroup_results": r.subgroup_results,
                "worst_subgroup": r.worst_subgroup,
                "worst_di": r.worst_di,
                "worst_severity": r.worst_severity,
                "root_cause_features": r.root_cause_features,
                "auditor_analysis": r.auditor_analysis,
                "done": r.done,
            }
            for r in session.rounds
        ],
    }


@router.get("/{session_id}")
async def get_red_team_status(session_id: str):
    """Get red team session status and results."""
    session = get_redteam_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Red team session not found")

    return {
        "session_id": session_id,
        "status": session.status,
        "total_rounds": len(session.rounds),
        "worst_subgroup": session.worst_overall_subgroup,
        "worst_di": session.worst_overall_di,
        "root_cause": session.root_cause,
        "final_summary": session.final_summary,
        "conversation_trace": session.conversation_trace,
        "rounds": [
            {
                "round_num": r.round_num,
                "target_subgroup": r.target_subgroup,
                "profiles_generated": r.profiles_generated,
                "attacker_strategy": r.attacker_strategy,
                "subgroup_results": r.subgroup_results,
                "worst_subgroup": r.worst_subgroup,
                "worst_di": r.worst_di,
                "worst_severity": r.worst_severity,
                "root_cause_features": r.root_cause_features,
                "auditor_analysis": r.auditor_analysis,
                "done": r.done,
            }
            for r in session.rounds
        ],
    }