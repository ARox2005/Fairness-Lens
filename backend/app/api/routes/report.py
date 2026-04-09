"""
Report Route — PDF Download

Endpoint:
- POST /api/report/pdf — Generate and download a complete bias audit PDF

Requires all 4 pipeline phases to have been run on the dataset.
Accepts the data from all phases in the request body and returns a PDF file.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import io

from app.services.pdf_report import generate_bias_audit_pdf
from app.services import dataset_manager

router = APIRouter(prefix="/api/report", tags=["Report"])


class ReportRequest(BaseModel):
    """Request body containing all pipeline phase data."""
    dataset_id: str
    dataset_name: Optional[str] = "Dataset"
    inspect_data: dict
    measure_data: dict
    flag_data: dict
    fix_data: dict


@router.post("/pdf")
async def download_pdf_report(request: ReportRequest):
    """
    Generate a comprehensive PDF bias audit report.

    The PDF covers all 4 pipeline phases:
    1. Inspect — dataset profile, distributions, proxy variables
    2. Measure — all fairness metrics with values and explanations
    3. Flag — risk assessment, compliance checks, flagged issues
    4. Fix — mitigation results with before/after comparisons

    Returns a downloadable PDF file.
    """
    try:
        pdf_bytes = generate_bias_audit_pdf(
            inspect_data=request.inspect_data,
            measure_data=request.measure_data,
            flag_data=request.flag_data,
            fix_data=request.fix_data,
            dataset_name=request.dataset_name,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {str(e)}"
        )

    filename = f"fairnesslens_bias_audit_{request.dataset_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )