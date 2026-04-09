"""
Inspect Route — Phase 1 of the Pipeline

Endpoints:
- POST /api/inspect/upload      — Upload a CSV and run inspection
- POST /api/inspect/demo/{id}   — Load a demo dataset and run inspection
- GET  /api/inspect/{dataset_id} — Re-run inspection on a stored dataset
- GET  /api/inspect/demos       — List available demo datasets
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.schemas import InspectRequest, InspectResponse, DemoDatasetListResponse
from app.services.data_profiler import DataProfiler
from app.services import dataset_manager

router = APIRouter(prefix="/api/inspect", tags=["Inspect"])


@router.get("/demos", response_model=DemoDatasetListResponse)
async def list_demos():
    """List all available demo datasets."""
    return DemoDatasetListResponse(datasets=dataset_manager.list_demo_datasets())


@router.post("/demo/{demo_id}", response_model=InspectResponse)
async def inspect_demo(
    demo_id: str,
    protected_attributes: Optional[str] = None,
    label_column: Optional[str] = None,
    favorable_label: Optional[str] = None,
):
    """
    Load a demo dataset and run the full Inspect pipeline.
    This is the "Try Demo" button endpoint.
    """
    try:
        dataset_id, df, metadata = dataset_manager.load_demo_dataset(demo_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Use metadata defaults if not overridden
    attrs = (
        protected_attributes.split(",") if protected_attributes
        else metadata.get("protected_attributes", [])
    )
    label = label_column or metadata.get("label_column", "")
    fav = favorable_label or metadata.get("favorable_label")

    profiler = DataProfiler(df)
    result = profiler.run_full_inspection(
        dataset_id=dataset_id,
        protected_attributes=attrs,
        label_column=label,
        favorable_label=fav,
    )
    return result


@router.post("/upload", response_model=InspectResponse)
async def inspect_upload(
    file: UploadFile = File(...),
    protected_attributes: Optional[str] = Form(None),
    label_column: Optional[str] = Form(None),
    favorable_label: Optional[str] = Form(None),
):
    """
    Upload a CSV file and run the full Inspect pipeline.

    - file: CSV file (multipart upload)
    - protected_attributes: comma-separated column names (optional, auto-detected)
    - label_column: name of the target/label column
    - favorable_label: the value considered favorable (e.g., ">50K", "1")
    """
    if not file.filename.endswith(('.csv', '.CSV')):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported. Please upload a .csv file."
        )

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    try:
        dataset_id, df = dataset_manager.load_from_csv(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    attrs = [a.strip() for a in protected_attributes.split(",")] if protected_attributes else []
    label_col = label_column.strip() if label_column else ""
    fav_label = favorable_label.strip() if favorable_label else None

    profiler = DataProfiler(df)
    result = profiler.run_full_inspection(
        dataset_id=dataset_id,
        protected_attributes=attrs,
        label_column=label_col,
        favorable_label=fav_label,
    )
    return result


@router.get("/{dataset_id}", response_model=InspectResponse)
async def re_inspect(
    dataset_id: str,
    protected_attributes: Optional[str] = None,
    label_column: Optional[str] = None,
    favorable_label: Optional[str] = None,
):
    """Re-run inspection on an already loaded dataset."""
    df = dataset_manager.get_dataset(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    metadata = dataset_manager.get_metadata(dataset_id) or {}
    attrs = (
        protected_attributes.split(",") if protected_attributes
        else metadata.get("protected_attributes", [])
    )
    label = label_column or metadata.get("label_column", "")
    fav = favorable_label or metadata.get("favorable_label")

    profiler = DataProfiler(df)
    result = profiler.run_full_inspection(
        dataset_id=dataset_id,
        protected_attributes=attrs,
        label_column=label,
        favorable_label=fav,
    )
    return result