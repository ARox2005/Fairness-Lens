"""
Model Upload Route — Custom Model Support

Endpoints:
- POST /api/model/upload        — Upload a sklearn model (.pkl/.joblib) + dataset
- POST /api/model/predictions   — Upload a predictions CSV directly
- GET  /api/model/{dataset_id}  — Check if a custom model is loaded for a dataset
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import numpy as np

from app.services.model_loader import (
    ModelLoader, parse_predictions_csv,
    store_model, get_model,
)
from app.services import dataset_manager
from app.services.data_profiler import DataProfiler
from app.core.fairness import FairnessEngine
from app.models.schemas import InspectResponse, MeasureResponse, GroupMetrics

router = APIRouter(prefix="/api/model", tags=["Custom Model"])


@router.post("/upload")
async def upload_model(
    model_file: UploadFile = File(..., description="Sklearn model file (.pkl or .joblib)"),
    dataset_file: UploadFile = File(..., description="Test dataset CSV"),
    protected_attributes: str = Form(..., description="Comma-separated protected attribute column names"),
    label_column: str = Form(..., description="Name of the true label column"),
    favorable_label: str = Form(..., description="Value considered favorable (e.g., >50K, 1)"),
):
    """
    Upload a trained sklearn model + test dataset CSV.

    The system will:
    1. Load the model from the pickle/joblib file
    2. Load the test dataset from the CSV
    3. Run the model's predictions on the dataset
    4. Run the full Inspect phase on the dataset
    5. Return the inspection results + model info

    After this, you can use the same /api/measure, /api/flag, /api/fix
    endpoints with the returned dataset_id — they will automatically use
    your custom model's predictions instead of training a new one.
    """
    # Validate file types
    model_name = model_file.filename.lower()
    if not model_name.endswith((".pkl", ".pickle", ".joblib")):
        raise HTTPException(
            status_code=400,
            detail="Model file must be .pkl, .pickle, or .joblib format"
        )

    if not dataset_file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Dataset must be a .csv file")

    # Read files
    model_bytes = await model_file.read()
    dataset_bytes = await dataset_file.read()

    if len(model_bytes) > 100 * 1024 * 1024:  # 100MB limit for models
        raise HTTPException(status_code=400, detail="Model file too large (max 100MB)")

    # Load dataset
    try:
        dataset_id, df = dataset_manager.load_from_csv(dataset_bytes, dataset_file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Load model
    loader = ModelLoader()
    try:
        model_info = loader.load_sklearn_model(model_bytes, model_file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    attrs = [a.strip() for a in protected_attributes.split(",")]
    label_column = label_column.strip()
    favorable_label = favorable_label.strip()

    # Validate columns exist
    for col in attrs + [label_column]:
        if col not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col}' not found in dataset. Available: {list(df.columns)}"
            )

    # Try running predictions to validate compatibility
    try:
        y_true, y_pred, y_scores, X_proc, enc_info = loader.predict(
            df.dropna(subset=[label_column] + attrs),
            label_column, attrs
        )
        prediction_stats = {
            "total_predictions": len(y_pred),
            "unique_predictions": int(len(np.unique(y_pred))),
            "prediction_distribution": {
                str(val): int(count)
                for val, count in zip(*np.unique(y_pred, return_counts=True))
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store model and dataset metadata
    store_model(dataset_id, loader)
    dataset_manager._dataset_metadata[dataset_id].update({
        "has_custom_model": True,
        "model_info": model_info,
        "protected_attributes": attrs,
        "label_column": label_column,
        "favorable_label": favorable_label,
    })

    # Run inspection
    profiler = DataProfiler(df)
    inspect_result = profiler.run_full_inspection(
        dataset_id=dataset_id,
        protected_attributes=attrs,
        label_column=label_column,
        favorable_label=favorable_label,
    )

    return {
        "dataset_id": dataset_id,
        "model_info": model_info,
        "prediction_stats": prediction_stats,
        "inspect_result": inspect_result.model_dump(),
        "message": (
            f"Model loaded successfully ({model_info['model_class']}). "
            f"Dataset has {len(df)} rows. "
            f"You can now use /api/measure, /api/flag, /api/fix with dataset_id='{dataset_id}'."
        ),
    }


@router.post("/predictions")
async def upload_predictions(
    file: UploadFile = File(..., description="CSV with actual labels, predicted labels, and features"),
    protected_attributes: str = Form(..., description="Comma-separated protected attribute column names"),
    actual_column: Optional[str] = Form(None, description="Column name for actual/true labels"),
    predicted_column: Optional[str] = Form(None, description="Column name for predicted labels"),
    score_column: Optional[str] = Form(None, description="Column name for prediction scores/probabilities"),
    favorable_label: str = Form(..., description="Value considered favorable"),
):
    """
    Upload a predictions CSV for black-box model auditing.

    For models you can't export (proprietary APIs, cloud services),
    run your model externally, export results as CSV, and upload here.

    The CSV should contain:
    - Original features (including protected attributes)
    - A column with actual/true labels
    - A column with predicted labels from your model
    - Optionally: a column with prediction scores/probabilities
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    file_bytes = await file.read()

    try:
        df, detected = parse_predictions_csv(file_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Resolve column names (user-provided or auto-detected)
    act_col = actual_column or detected.get("actual_column")
    pred_col = predicted_column or detected.get("predicted_column")
    score_col = score_column or detected.get("score_column")

    if not act_col:
        raise HTTPException(
            status_code=400,
            detail="Could not detect actual label column. Please specify actual_column parameter. "
                   f"Available columns: {list(df.columns)}"
        )
    if not pred_col:
        raise HTTPException(
            status_code=400,
            detail="Could not detect predicted label column. Please specify predicted_column parameter. "
                   f"Available columns: {list(df.columns)}"
        )

    attrs = [a.strip() for a in protected_attributes.split(",")]

    # Validate
    for col in attrs + [act_col, pred_col]:
        if col not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col}' not found. Available: {list(df.columns)}"
            )

    # Store dataset
    import uuid
    dataset_id = f"pred_{uuid.uuid4().hex[:8]}"
    dataset_manager.store_dataset(df, dataset_id, {
        "source": "predictions_upload",
        "has_custom_model": True,
        "model_info": {"model_class": "External/Black-Box", "model_type": "predictions_only"},
        "protected_attributes": attrs,
        "label_column": act_col,
        "predicted_column": pred_col,
        "score_column": score_col,
        "favorable_label": favorable_label,
    })

    # Store a "model" that just returns the prediction column
    loader = ModelLoader()
    loader.model_type = "predictions_only"
    store_model(dataset_id, loader)

    # Run inspection
    profiler = DataProfiler(df)
    inspect_result = profiler.run_full_inspection(
        dataset_id=dataset_id,
        protected_attributes=attrs,
        label_column=act_col,
        favorable_label=favorable_label,
    )

    return {
        "dataset_id": dataset_id,
        "detected_columns": detected,
        "actual_column": act_col,
        "predicted_column": pred_col,
        "score_column": score_col,
        "row_count": len(df),
        "inspect_result": inspect_result.model_dump(),
        "message": (
            f"Predictions loaded ({len(df)} rows). "
            f"Use /api/measure, /api/flag, /api/fix with dataset_id='{dataset_id}'."
        ),
    }


@router.get("/{dataset_id}")
async def get_model_info(dataset_id: str):
    """Check if a custom model is loaded for a dataset."""
    meta = dataset_manager.get_metadata(dataset_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    has_model = meta.get("has_custom_model", False)
    model_info = meta.get("model_info", {})

    return {
        "dataset_id": dataset_id,
        "has_custom_model": has_model,
        "model_info": model_info,
        "model_type": model_info.get("model_type", "internal_baseline"),
    }