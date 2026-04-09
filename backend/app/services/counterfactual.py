"""
Counterfactual Fairness Explainer

For any individual prediction, generates a counterfactual:
"What is the minimal feature change that would flip the outcome?"

Key insight: Protected attributes (sex, race) are LOCKED — only
non-protected features are allowed to change. So if flipping
'marital_status' from 'Married' to 'Never-married' flips a woman's
rejection to acceptance, it reveals proxy discrimination through
marital status.

Example output:
"Priya Sharma was rejected. If her name had been Peter Smith —
same education, same experience — she would have been selected."

Uses a greedy perturbation approach (DiCE-inspired) without
requiring the DiCE library as a dependency.
"""

import numpy as np
import pandas as pd
import logging
from typing import Optional
from dataclasses import dataclass, field
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════

@dataclass
class CounterfactualCase:
    """A single counterfactual explanation for one individual."""
    individual_id: int
    original_profile: dict          # original feature values
    counterfactual_profile: dict    # modified feature values
    original_prediction: str        # "rejected" or "selected"
    counterfactual_prediction: str  # flipped prediction
    changed_features: list          # [{feature, original, counterfactual, importance}]
    protected_attributes: dict      # {sex: "Female", race: "Black"} — these stayed locked
    narrative: str                  # plain-English story
    proxy_features_identified: list # features that act as proxies


@dataclass
class CounterfactualReport:
    """Full counterfactual analysis report."""
    dataset_id: str
    total_rejected: int
    total_analyzed: int
    cases: list[CounterfactualCase]
    aggregate_proxy_features: dict   # {feature: count of times it appeared as a flip trigger}
    summary: str
    status: str = "completed"


# ═══════════════════════════════════════
#  INDIAN NAME GENERATOR (for narrative)
# ═══════════════════════════════════════

NAMES = {
    "Female": [
        "Priya Sharma", "Ananya Patel", "Sneha Reddy", "Kavya Nair",
        "Isha Gupta", "Meera Joshi", "Riya Singh", "Diya Verma",
        "Aisha Khan", "Nandini Rao",
    ],
    "Male": [
        "Arjun Mehta", "Rohan Kapoor", "Vikram Iyer", "Aditya Deshmukh",
        "Karan Malhotra", "Rahul Tiwari", "Siddharth Bose", "Varun Choudhary",
        "Aarav Pandey", "Dev Saxena",
    ],
    "default": [
        "Alex Morgan", "Sam Taylor", "Jordan Lee", "Riley Chen",
        "Casey Kim", "Drew Patel", "Jamie Cruz", "Quinn Brown",
    ],
}

COUNTER_NAMES = {
    "Female": NAMES.get("Male", NAMES["default"]),
    "Male": NAMES.get("Female", NAMES["default"]),
}


def _get_name(sex_value, index=0):
    """Get a representative name based on sex."""
    sex_str = str(sex_value).strip().capitalize()
    name_list = NAMES.get(sex_str, NAMES["default"])
    return name_list[index % len(name_list)]


def _get_counter_name(sex_value, index=0):
    """Get a counterfactual name (opposite gender)."""
    sex_str = str(sex_value).strip().capitalize()
    name_list = COUNTER_NAMES.get(sex_str, NAMES["default"])
    return name_list[index % len(name_list)]


# ═══════════════════════════════════════
#  COUNTERFACTUAL GENERATOR
# ═══════════════════════════════════════

def _generate_counterfactual(
    model,
    scaler,
    x_original: np.ndarray,
    feature_names: list[str],
    protected_indices: list[int],
    favorable_label,
    df_original_row: pd.Series,
    feature_values_map: dict,
    max_changes: int = 5,
) -> Optional[tuple]:
    """
    Find the minimal feature changes to flip a prediction.

    Strategy (DiCE-inspired greedy):
    1. Get model's prediction probabilities for the original
    2. For each non-protected feature, try perturbing it to
       values that would push the probability toward favorable
    3. Greedily pick the change with highest probability gain
    4. Repeat until prediction flips or max_changes reached

    Protected attributes remain LOCKED throughout.
    """
    x = x_original.copy()
    original_pred = model.predict(x.reshape(1, -1))[0]

    if original_pred == favorable_label:
        return None  # Already favorable, no counterfactual needed

    changes = []
    used_features = set()

    for _ in range(max_changes):
        best_gain = -1
        best_feature_idx = -1
        best_value = None
        best_x = None

        # Try perturbing each non-protected feature
        for feat_idx in range(len(feature_names)):
            if feat_idx in protected_indices:
                continue  # LOCKED — never change protected attributes
            if feat_idx in used_features:
                continue

            feat_name = feature_names[feat_idx]

            # Get candidate values for this feature
            if feat_name in feature_values_map:
                candidates = feature_values_map[feat_name]
            else:
                # For numeric: try ±1, ±2 standard deviations
                current = x[feat_idx]
                candidates = [current + d for d in [-2, -1, -0.5, 0.5, 1, 2]]

            for val in candidates:
                if val == x[feat_idx]:
                    continue

                x_trial = x.copy()
                x_trial[feat_idx] = val

                try:
                    proba = model.predict_proba(x_trial.reshape(1, -1))[0]
                    # Find probability of favorable class
                    fav_idx = list(model.classes_).index(favorable_label)
                    gain = proba[fav_idx]
                except Exception:
                    continue

                if gain > best_gain:
                    best_gain = gain
                    best_feature_idx = feat_idx
                    best_value = val
                    best_x = x_trial.copy()

        if best_feature_idx == -1:
            break  # No improvement possible

        # Apply the best change
        changes.append({
            "feature_idx": best_feature_idx,
            "feature": feature_names[best_feature_idx],
            "original_scaled": float(x[best_feature_idx]),
            "counterfactual_scaled": float(best_value),
        })
        x = best_x
        used_features.add(best_feature_idx)

        # Check if prediction flipped
        new_pred = model.predict(x.reshape(1, -1))[0]
        if new_pred == favorable_label:
            return x, changes, True  # Successfully flipped!

    # Didn't flip but made changes
    if changes:
        return x, changes, False

    return None


def generate_counterfactuals(
    dataset_id: str,
    df: pd.DataFrame,
    protected_attributes: list[str],
    label_column: str,
    favorable_label,
    max_cases: int = 10,
) -> CounterfactualReport:
    """
    Generate counterfactual explanations for rejected individuals
    from unprivileged groups.

    Steps:
    1. Train a model on the dataset
    2. Find rejected individuals from unprivileged groups
    3. For each, find minimal feature changes to flip prediction
    4. Generate plain-English narratives
    """
    df_clean = df.dropna(subset=[label_column] + protected_attributes).copy()

    # Encode
    label_encoders = {}
    df_encoded = df_clean.copy()

    for col in df_encoded.columns:
        if df_encoded[col].dtype == "object" or pd.api.types.is_string_dtype(df_encoded[col]) or df_encoded[col].dtype.kind == "O":
            le = LabelEncoder()
            df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
            label_encoders[col] = le

    # Get favorable label encoded
    if label_column in label_encoders:
        try:
            fav_encoded = label_encoders[label_column].transform([str(favorable_label)])[0]
        except ValueError:
            fav_encoded = 1
    else:
        fav_encoded = favorable_label

    feature_cols = [c for c in df_encoded.columns if c != label_column]
    protected_indices = [feature_cols.index(a) for a in protected_attributes if a in feature_cols]

    X = df_encoded[feature_cols].values.astype(float)
    y = df_encoded[label_column].values
    X = np.nan_to_num(X, nan=0.0)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Split and train
    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X_scaled, y, np.arange(len(df_clean)), test_size=0.3, random_state=42, stratify=y
    )

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    # Build feature value candidates (encoded values for categoricals)
    feature_values_map = {}
    for col in feature_cols:
        if col in label_encoders:
            # Categorical: use all encoded values
            n_classes = len(label_encoders[col].classes_)
            feature_values_map[col] = list(range(n_classes))

    # Find rejected individuals from unprivileged groups
    rejected_mask = y_pred != fav_encoded

    # Identify unprivileged group (lower positive rate)
    primary_attr = protected_attributes[0] if protected_attributes else None
    if primary_attr and primary_attr in feature_cols:
        attr_idx = feature_cols.index(primary_attr)
        attr_values = X_test[:, attr_idx]
        unique_vals = np.unique(attr_values)

        rates = {}
        for v in unique_vals:
            mask = attr_values == v
            rates[v] = np.mean(y_pred[mask] == fav_encoded) if np.sum(mask) > 0 else 0
        priv_val = max(rates, key=rates.get)
        unpriv_mask = attr_values != priv_val

        # Prioritize rejected individuals from unprivileged group
        target_mask = rejected_mask & unpriv_mask
    else:
        target_mask = rejected_mask

    target_indices = np.where(target_mask)[0]

    if len(target_indices) == 0:
        return CounterfactualReport(
            dataset_id=dataset_id,
            total_rejected=int(np.sum(rejected_mask)),
            total_analyzed=0,
            cases=[],
            aggregate_proxy_features={},
            summary="No rejected individuals found in the unprivileged group.",
        )

    # Generate counterfactuals
    cases = []
    proxy_feature_counts = {}
    np.random.seed(42)
    sample_indices = np.random.choice(
        target_indices, size=min(max_cases, len(target_indices)), replace=False
    )

    for case_num, test_idx in enumerate(sample_indices):
        original_df_idx = idx_test[test_idx]
        original_row = df_clean.iloc[original_df_idx]
        x_original = X_test[test_idx]

        result = _generate_counterfactual(
            model=model,
            scaler=scaler,
            x_original=x_original,
            feature_names=feature_cols,
            protected_indices=protected_indices,
            favorable_label=fav_encoded,
            df_original_row=original_row,
            feature_values_map=feature_values_map,
            max_changes=4,
        )

        if result is None:
            continue

        x_counter, changes, flipped = result

        # Decode changes back to original values
        decoded_changes = []
        for ch in changes:
            feat = ch["feature"]
            orig_val = original_row[feat] if feat in original_row.index else ch["original_scaled"]
            if feat in label_encoders:
                le = label_encoders[feat]
                try:
                    counter_val = le.inverse_transform([int(round(ch["counterfactual_scaled"]))])[0]
                except (ValueError, IndexError):
                    counter_val = ch["counterfactual_scaled"]
            else:
                # Inverse scale for numeric
                feat_idx = feature_cols.index(feat)
                counter_val = round(
                    ch["counterfactual_scaled"] * scaler.scale_[feat_idx] + scaler.mean_[feat_idx], 1
                )

            decoded_changes.append({
                "feature": feat,
                "original": str(orig_val),
                "counterfactual": str(counter_val),
                "importance": round(abs(ch["counterfactual_scaled"] - ch["original_scaled"]), 4),
            })

            # Track proxy features
            if feat not in protected_attributes:
                proxy_feature_counts[feat] = proxy_feature_counts.get(feat, 0) + 1

        # Build profile dicts
        original_profile = {col: str(original_row[col]) for col in feature_cols if col in original_row.index}
        counter_profile = original_profile.copy()
        for ch in decoded_changes:
            counter_profile[ch["feature"]] = ch["counterfactual"]

        # Protected attribute values
        protected_vals = {}
        for attr in protected_attributes:
            if attr in original_row.index:
                protected_vals[attr] = str(original_row[attr])

        # Generate narrative
        sex_val = protected_vals.get("sex", protected_vals.get("gender", ""))
        name = _get_name(sex_val, case_num)
        counter_name = _get_counter_name(sex_val, case_num)

        if flipped and decoded_changes:
            change_descriptions = []
            for ch in decoded_changes:
                change_descriptions.append(f"{ch['feature']} from '{ch['original']}' to '{ch['counterfactual']}'")

            changes_text = ", ".join(change_descriptions)

            if len(decoded_changes) == 1:
                narrative = (
                    f"{name} was rejected by the model. However, if only their "
                    f"{changes_text} — with everything else identical including their "
                    f"{', '.join(f'{k}: {v}' for k, v in protected_vals.items())} — "
                    f"they would have been selected. This suggests the model uses "
                    f"'{decoded_changes[0]['feature']}' as a proxy for discrimination."
                )
            else:
                narrative = (
                    f"{name} was rejected. Changing just {len(decoded_changes)} feature(s) "
                    f"({changes_text}) — while keeping {', '.join(f'{k}: {v}' for k, v in protected_vals.items())} "
                    f"unchanged — would flip the decision to selected. "
                    f"These features may act as proxies for the protected attributes."
                )
        else:
            narrative = (
                f"{name} was rejected. Even after modifying {len(decoded_changes)} non-protected "
                f"feature(s), the model still rejects them — indicating deep structural bias "
                f"against candidates with {', '.join(f'{k}={v}' for k, v in protected_vals.items())}."
            )

        case = CounterfactualCase(
            individual_id=int(original_df_idx),
            original_profile=original_profile,
            counterfactual_profile=counter_profile,
            original_prediction="rejected",
            counterfactual_prediction="selected" if flipped else "still rejected",
            changed_features=decoded_changes,
            protected_attributes=protected_vals,
            narrative=narrative,
            proxy_features_identified=[ch["feature"] for ch in decoded_changes if ch["feature"] not in protected_attributes],
        )
        cases.append(case)

    # Aggregate summary
    total_flipped = sum(1 for c in cases if c.counterfactual_prediction == "selected")
    top_proxies = sorted(proxy_feature_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    summary = (
        f"Analyzed {len(cases)} rejected candidates from the unprivileged group. "
        f"{total_flipped} out of {len(cases)} could be flipped to 'selected' by changing "
        f"only non-protected features (protected attributes were locked). "
        f"{'Top proxy features: ' + ', '.join(f'{f} ({c}×)' for f, c in top_proxies) + '.' if top_proxies else ''}"
    )

    return CounterfactualReport(
        dataset_id=dataset_id,
        total_rejected=int(np.sum(rejected_mask)),
        total_analyzed=len(cases),
        cases=cases,
        aggregate_proxy_features=proxy_feature_counts,
        summary=summary,
    )