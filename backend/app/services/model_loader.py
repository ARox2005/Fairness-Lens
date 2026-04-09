"""
Model Loader Service — Custom Model Support

Supports two modes:
A) Upload a trained sklearn model (.pkl / .joblib) + test dataset CSV
   → Load model, run predictions, feed into fairness pipeline

B) Upload a predictions CSV (actual_label, predicted_label, predicted_score)
   → Skip model loading, directly audit the predictions

Also supports SHAP analysis on uploaded models (sklearn only).

Security note: pickle files can execute arbitrary code. In production,
use a sandboxed environment. For hackathon demo, this is acceptable.
"""

import io
import logging
import numpy as np
import pandas as pd
import joblib
import pickle
from typing import Optional, Tuple
from sklearn.preprocessing import LabelEncoder, StandardScaler

logger = logging.getLogger(__name__)


class ModelLoader:
    """Loads and wraps user-uploaded models for fairness analysis."""

    def __init__(self):
        self.model = None
        self.model_type = None  # "sklearn", "predictions_only"
        self.feature_columns = []
        self.label_encoders = {}
        self.scaler = None

    def load_sklearn_model(self, model_bytes: bytes, filename: str) -> dict:
        """
        Load a sklearn model from pickle or joblib bytes.

        Returns metadata about the loaded model.
        """
        try:
            model_buffer = io.BytesIO(model_bytes)

            if filename.endswith(".joblib"):
                self.model = joblib.load(model_buffer)
            else:
                self.model = pickle.load(model_buffer)

            self.model_type = "sklearn"

            # Extract model info
            model_class = type(self.model).__name__
            has_predict_proba = hasattr(self.model, "predict_proba")
            has_feature_names = hasattr(self.model, "feature_names_in_")

            feature_names = []
            if has_feature_names:
                feature_names = list(self.model.feature_names_in_)

            info = {
                "model_class": model_class,
                "model_type": "sklearn",
                "has_predict_proba": has_predict_proba,
                "feature_names": feature_names,
                "loaded": True,
            }

            logger.info(f"Loaded sklearn model: {model_class}")
            return info

        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise ValueError(f"Could not load model: {str(e)}")

    def predict(
        self,
        df: pd.DataFrame,
        label_column: str,
        protected_attributes: list[str],
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray], np.ndarray, dict]:
        """
        Run the uploaded model on the dataset.

        Returns: (y_true, y_pred, y_scores, X_processed, encoding_info)
        """
        if self.model is None:
            raise ValueError("No model loaded. Upload a model first.")

        df_work = df.copy()

        # Encode categoricals
        self.label_encoders = {}
        for col in df_work.columns:
            if df_work[col].dtype == "object" or df_work[col].dtype.kind == "O" or pd.api.types.is_string_dtype(df_work[col]):
                le = LabelEncoder()
                df_work[col] = le.fit_transform(df_work[col].astype(str))
                self.label_encoders[col] = le

        # Separate features and label
        feature_cols = [c for c in df_work.columns if c != label_column]
        self.feature_columns = feature_cols

        X = df_work[feature_cols].values.astype(float)
        y_true = df_work[label_column].values

        # Handle NaN
        X = np.nan_to_num(X, nan=0.0)

        # Scale
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Run predictions
        try:
            y_pred = self.model.predict(X_scaled)
        except Exception:
            # If scaling doesn't match, try without scaling
            try:
                y_pred = self.model.predict(X)
            except Exception as e:
                raise ValueError(
                    f"Model prediction failed. The model may expect different "
                    f"features or formats. Error: {str(e)}"
                )

        # Get probability scores if available
        y_scores = None
        try:
            if hasattr(self.model, "predict_proba"):
                y_scores = self.model.predict_proba(X_scaled)[:, 1]
        except Exception:
            pass

        encoding_info = {
            "label_encoders": {k: list(v.classes_) for k, v in self.label_encoders.items()},
            "feature_columns": feature_cols,
        }

        return y_true, y_pred, y_scores, X_scaled, encoding_info

    def get_model_for_shap(self):
        """Return the loaded model for SHAP analysis."""
        return self.model

    def get_model_for_counterfactual(self):
        """Return the model for counterfactual fairness testing."""
        return self.model


def parse_predictions_csv(
    file_bytes: bytes,
    filename: str,
) -> Tuple[pd.DataFrame, dict]:
    """
    Parse a predictions CSV file.

    Expected columns:
    - All original features
    - A column for actual labels (ground truth)
    - A column for predicted labels (model output)
    - Optionally: a column for predicted scores/probabilities

    Returns: (dataframe, detected_columns)
    """
    try:
        df = pd.read_csv(
            io.BytesIO(file_bytes),
            na_values=["?", "NA", "N/A", "", "null"],
        )
    except Exception as e:
        raise ValueError(f"Could not parse CSV: {str(e)}")

    if len(df) == 0:
        raise ValueError("Predictions CSV is empty")

    # Try to auto-detect prediction columns
    cols_lower = {c.lower(): c for c in df.columns}

    detected = {
        "actual_column": None,
        "predicted_column": None,
        "score_column": None,
    }

    # Detect actual/true label column
    for keyword in ["actual", "true", "ground_truth", "y_true", "label", "target"]:
        for cl, orig in cols_lower.items():
            if keyword in cl:
                detected["actual_column"] = orig
                break
        if detected["actual_column"]:
            break

    # Detect predicted label column
    for keyword in ["predicted", "pred", "y_pred", "prediction", "output"]:
        for cl, orig in cols_lower.items():
            if keyword in cl and "score" not in cl and "prob" not in cl:
                detected["predicted_column"] = orig
                break
        if detected["predicted_column"]:
            break

    # Detect score column
    for keyword in ["score", "probability", "prob", "confidence", "y_score"]:
        for cl, orig in cols_lower.items():
            if keyword in cl:
                detected["score_column"] = orig
                break
        if detected["score_column"]:
            break

    return df, detected


# In-memory storage for loaded models (per session)
_loaded_models: dict[str, ModelLoader] = {}


def store_model(dataset_id: str, loader: ModelLoader):
    """Store a model loader for a dataset."""
    _loaded_models[dataset_id] = loader


def get_model(dataset_id: str) -> Optional[ModelLoader]:
    """Retrieve a stored model loader."""
    return _loaded_models.get(dataset_id)