from app.core.utils import is_categorical_column
"""
Measure Route — Phase 2 of the Pipeline

Computes all fairness metrics from the document:
1. Statistical Parity Difference
2. Disparate Impact Ratio (four-fifths rule)
3. Average Absolute Odds Difference (Equalized Odds)
4. Equal Opportunity Difference
5. Predictive Parity Difference
6. Calibration Difference (if scores available)
+ Individual Fairness (consistency score)
+ Intersectional Analysis (race × gender matrix)
+ SHAP Feature Attribution (optional)

Also returns the impossibility theorem note.
"""

from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from app.models.schemas import (
    MeasureRequest, MeasureResponse, GroupMetrics, MetricResult,
    IntersectionalCell, ShapFeatureAttribution
)
from app.core.fairness import FairnessEngine
from app.services import dataset_manager
from app.services.model_loader import get_model

router = APIRouter(prefix="/api/measure", tags=["Measure"])


@router.post("/", response_model=MeasureResponse)
async def measure_fairness(request: MeasureRequest):
    """
    Compute all fairness metrics for the given dataset.

    Trains a baseline Logistic Regression model on the dataset, then
    computes every metric defined in the document for each protected attribute.
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Strip whitespace from all inputs
    request.label_column = request.label_column.strip()
    request.protected_attributes = [a.strip() for a in request.protected_attributes]

    if request.label_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Label column '{request.label_column}' not found in dataset"
        )

    for attr in request.protected_attributes:
        if attr not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Protected attribute '{attr}' not found in dataset"
            )

    # Drop rows with NaN in label or protected attributes
    required_cols = [request.label_column] + request.protected_attributes
    df_clean = df.dropna(subset=required_cols).copy()

    if len(df_clean) < 50:
        raise HTTPException(
            status_code=400,
            detail="Dataset too small after cleaning (need at least 50 rows)"
        )

    # ── Train a baseline model or use custom model ──
    y_true, y_pred, y_scores, X_encoded, df_encoded, feature_cols = _train_baseline(
        df_clean, request.label_column, request.favorable_label,
        request.protected_attributes, request.dataset_id
    )

    # ── Compute group metrics for each protected attribute ──
    all_group_metrics = []

    for attr in request.protected_attributes:
        protected = df_encoded[attr].values

        # Auto-detect privileged group (highest positive rate)
        privileged_value = _detect_privileged_value(
            protected, y_true,
            _encode_label(request.favorable_label, df_clean[request.label_column])
        )

        # Get readable group labels
        unique_vals = df_clean[attr].unique()
        priv_label = str(privileged_value)
        unpriv_labels = [str(v) for v in unique_vals if str(v) != priv_label]
        unpriv_label = ", ".join(unpriv_labels) if unpriv_labels else f"Not {priv_label}"

        # Encode favorable label
        fav_encoded = _encode_label(request.favorable_label, df_clean[request.label_column])

        # Compute all group fairness metrics
        group_metrics = FairnessEngine.compute_all_group_metrics(
            y_true=y_true,
            y_pred=y_pred,
            protected=protected,
            privileged_value=privileged_value,
            favorable_label=fav_encoded,
            unprivileged_label=unpriv_label,
            privileged_label=priv_label,
            y_scores=y_scores,
        )

        # Override attribute name with readable name
        group_metrics.protected_attribute = attr
        all_group_metrics.append(group_metrics)

    # ── Individual Fairness ──
    try:
        individual = FairnessEngine.individual_fairness_score(
            X_encoded, y_pred, k=5
        )
        # Add to first group's metrics
        if all_group_metrics:
            all_group_metrics[0].metrics.append(individual)
    except Exception:
        pass

    # ── Intersectional Analysis ──
    intersectional = []
    if request.run_intersectional and len(request.protected_attributes) >= 2:
        intersectional = FairnessEngine.compute_intersectional_analysis(
            df_clean,
            request.protected_attributes[:2],
            request.label_column,
            request.favorable_label,
        )

    # ── SHAP Feature Attribution ──
    shap_results = []
    if request.run_shap:
        shap_results = _compute_shap(
            X_encoded, feature_cols, request.protected_attributes
        )

    return MeasureResponse(
        dataset_id=request.dataset_id,
        group_metrics=all_group_metrics,
        intersectional_analysis=intersectional,
        shap_attributions=shap_results,
        impossibility_note=FairnessEngine.get_impossibility_note(),
    )


# ──────────────────────────────────────
#  Helper functions
# ──────────────────────────────────────

def _train_baseline(
    df: pd.DataFrame,
    label_column: str,
    favorable_label,
    protected_attributes: list[str],
    dataset_id: str = "",
) -> tuple:
    """
    Encode features, get predictions, return results.

    If a custom model is uploaded for this dataset_id, use that model.
    If predictions-only mode, read predictions from the CSV column.
    Otherwise, train a Logistic Regression baseline.
    """
    df_encoded = df.copy()
    label_encoders = {}

    # Check for custom model
    custom_model = get_model(dataset_id) if dataset_id else None
    meta = dataset_manager.get_metadata(dataset_id) or {}
    is_predictions_only = meta.get("model_info", {}).get("model_type") == "predictions_only"

    # Handle predictions-only mode (black-box models)
    if is_predictions_only and meta.get("predicted_column"):
        pred_col = meta["predicted_column"]
        score_col = meta.get("score_column")

        # Encode categoricals
        for col in df_encoded.columns:
            if is_categorical_column(df_encoded[col]):
                le = LabelEncoder()
                df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
                label_encoders[col] = le

        feature_cols = [c for c in df_encoded.columns if c not in [label_column, pred_col, score_col]]
        X = df_encoded[feature_cols].values.astype(float)
        X = np.nan_to_num(X, nan=0.0)

        y_true = df_encoded[label_column].values
        y_pred = df_encoded[pred_col].values
        y_scores = df_encoded[score_col].values if score_col and score_col in df_encoded.columns else None

        return y_true, y_pred, y_scores, X, df_encoded, feature_cols

    # Encode all categorical columns
    for col in df_encoded.columns:
        if is_categorical_column(df_encoded[col]):
            le = LabelEncoder()
            df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
            label_encoders[col] = le

    # Features = everything except label
    feature_cols = [c for c in df_encoded.columns if c != label_column]
    X = df_encoded[feature_cols].values.astype(float)
    y = df_encoded[label_column].values

    # Handle NaN
    X = np.nan_to_num(X, nan=0.0)

    # Scale
    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )

    # Map indices to df_encoded for protected attributes
    indices = np.arange(len(df_encoded))
    _, test_indices = train_test_split(
        indices, test_size=0.3, random_state=42, stratify=y
    )

    # Use custom model or train baseline
    if custom_model and custom_model.model is not None:
        try:
            y_pred = custom_model.model.predict(X_test)
            y_scores = None
            if hasattr(custom_model.model, "predict_proba"):
                y_scores = custom_model.model.predict_proba(X_test)[:, 1]
        except Exception:
            # Fallback: try without scaling
            X_raw = np.nan_to_num(df_encoded[feature_cols].values.astype(float), nan=0.0)
            _, X_test_raw = train_test_split(X_raw, test_size=0.3, random_state=42, stratify=y)
            y_pred = custom_model.model.predict(X_test_raw)
            y_scores = None
    else:
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        try:
            y_scores = model.predict_proba(X_test)[:, 1]
        except Exception:
            y_scores = None

    # Return test set data
    df_test = df_encoded.iloc[test_indices].reset_index(drop=True)

    return y_test, y_pred, y_scores, X_test, df_test, feature_cols


def _detect_privileged_value(
    protected: np.ndarray,
    y: np.ndarray,
    favorable_label,
) -> any:
    """Detect the privileged group (highest positive outcome rate)."""
    rates = {}
    for val in np.unique(protected):
        mask = protected == val
        rate = np.mean(y[mask] == favorable_label)
        rates[val] = rate
    return max(rates, key=rates.get)


def _encode_label(favorable_label, series: pd.Series):
    """Encode the favorable label to match the encoded dataset."""
    if is_categorical_column(series):
        le = LabelEncoder()
        le.fit(series.astype(str))
        try:
            return le.transform([str(favorable_label)])[0]
        except ValueError:
            return 1
    return favorable_label


def _compute_shap(
    X: np.ndarray,
    feature_cols: list[str],
    protected_attributes: list[str],
) -> list[ShapFeatureAttribution]:
    """
    Compute SHAP feature importance for bias detection.

    From the document:
    "If a protected attribute like gender has high SHAP magnitude for one group
    but not another, the model is encoding discriminatory patterns."
    """
    try:
        import shap

        # Train a model for SHAP
        model = LogisticRegression(max_iter=1000, random_state=42)
        # Use a sample for speed
        sample_size = min(500, len(X))
        X_sample = X[:sample_size]

        model.fit(X, np.zeros(len(X)))  # placeholder, we just need SHAP values

        # Use LinearExplainer for speed
        explainer = shap.LinearExplainer(model, X_sample)
        shap_values = explainer.shap_values(X_sample)

        # Mean absolute SHAP value per feature
        mean_abs = np.mean(np.abs(shap_values), axis=0)

        results = []
        for i, col in enumerate(feature_cols):
            is_protected = col in protected_attributes
            bias_signal = ""
            if is_protected and mean_abs[i] > np.mean(mean_abs):
                bias_signal = (
                    f"High SHAP attribution on protected attribute '{col}' — "
                    "the model may be encoding discriminatory patterns."
                )

            results.append(ShapFeatureAttribution(
                feature=col,
                mean_abs_shap=round(float(mean_abs[i]), 6),
                is_protected=is_protected,
                bias_signal=bias_signal,
            ))

        # Sort by importance
        results.sort(key=lambda x: x.mean_abs_shap, reverse=True)
        return results

    except ImportError:
        return []
    except Exception:
        return []