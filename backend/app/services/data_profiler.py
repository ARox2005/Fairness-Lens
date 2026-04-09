"""
Data Profiler Service — Inspect Phase Implementation

From the document:
"When a file lands in Cloud Storage, the backend loads it with pandas and runs
four analyses:
1. Demographic detection — scan column names for protected attribute terms
2. Distribution analysis — value counts and proportions per protected group
3. Correlation detection — point-biserial and Cramér's V for proxy variables
4. Representation gap analysis — compare against population baselines"

Proxy threshold: |correlation| > 0.3 (from document)
"""

import numpy as np
import pandas as pd
from scipy import stats
from typing import Optional
from app.models.schemas import (
    ColumnProfile, GroupDistribution, ProxyVariable,
    RepresentationGap, InspectResponse
)


# Common protected attribute keywords for auto-detection
PROTECTED_ATTRIBUTE_KEYWORDS = {
    "gender", "sex", "male", "female", "race", "ethnicity", "ethnic",
    "age", "disability", "religion", "national_origin", "nationality",
    "marital_status", "marital", "color", "veteran", "pregnancy",
    "sexual_orientation", "citizen", "citizenship",
}

# US Census baseline proportions for representation gap analysis
POPULATION_BASELINES = {
    "sex": {"Male": 0.494, "Female": 0.506},
    "gender": {"Male": 0.494, "Female": 0.506},
    "race": {
        "White": 0.578,
        "Black": 0.134,
        "Asian-Pac-Islander": 0.063,
        "Amer-Indian-Eskimo": 0.013,
        "Other": 0.212,
    },
}

PROXY_CORRELATION_THRESHOLD = 0.3


class DataProfiler:
    """Profiles datasets for the Inspect phase of the pipeline."""

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.row_count = len(df)
        self.column_count = len(df.columns)

    def profile_columns(self) -> list[ColumnProfile]:
        """Generate a profile for every column in the dataset."""
        profiles = []
        for col in self.df.columns:
            is_protected = self._is_protected_attribute(col)
            profiles.append(ColumnProfile(
                name=col,
                dtype=str(self.df[col].dtype),
                unique_count=int(self.df[col].nunique()),
                null_count=int(self.df[col].isnull().sum()),
                null_percentage=round(
                    self.df[col].isnull().mean() * 100, 2
                ),
                is_protected_attribute=is_protected,
                sample_values=self.df[col].dropna().unique()[:5].tolist(),
            ))
        return profiles

    def detect_protected_attributes(self) -> list[str]:
        """
        Auto-detect protected attribute columns by scanning column names
        against known protected attribute keywords.
        """
        detected = []
        for col in self.df.columns:
            col_lower = col.lower().replace("_", " ").replace("-", " ")
            for keyword in PROTECTED_ATTRIBUTE_KEYWORDS:
                if keyword in col_lower or col_lower in keyword:
                    detected.append(col)
                    break
        return detected

    def compute_group_distributions(
        self,
        protected_attributes: list[str],
        label_column: Optional[str] = None,
        favorable_label=None,
    ) -> list[GroupDistribution]:
        """
        Compute value counts and proportions for each protected group.
        If label_column is provided, also compute positive (favorable) rate.
        """
        distributions = []
        for attr in protected_attributes:
            if attr not in self.df.columns:
                continue
            value_counts = self.df[attr].value_counts()
            total = len(self.df)

            for value, count in value_counts.items():
                positive_rate = 0.0
                if label_column and favorable_label is not None:
                    group_mask = self.df[attr] == value
                    group_data = self.df[group_mask]
                    if len(group_data) > 0:
                        positive_rate = (
                            group_data[label_column] == favorable_label
                        ).mean()

                distributions.append(GroupDistribution(
                    attribute=attr,
                    group=str(value),
                    count=int(count),
                    proportion=round(count / total, 4),
                    positive_rate=round(positive_rate, 4),
                ))

        return distributions

    def detect_proxy_variables(
        self,
        protected_attributes: list[str],
    ) -> list[ProxyVariable]:
        """
        Detect proxy variables by computing correlations between every
        feature and each protected attribute.

        Uses:
        - Point-biserial correlation for numeric vs binary protected attr
        - Cramér's V for categorical vs categorical

        Threshold: |correlation| > 0.3 (from document)
        """
        proxies = []

        for attr in protected_attributes:
            if attr not in self.df.columns:
                continue

            attr_series = self.df[attr]

            # Skip if too many unique values (not a clean protected attribute)
            if attr_series.nunique() > 20:
                continue

            for col in self.df.columns:
                if col == attr or col in protected_attributes:
                    continue

                try:
                    corr, corr_type = self._compute_correlation(
                        self.df[col], attr_series
                    )
                    if corr is not None and not np.isnan(corr):
                        proxies.append(ProxyVariable(
                            feature=col,
                            protected_attribute=attr,
                            correlation=round(abs(corr), 4),
                            correlation_type=corr_type,
                            is_proxy=abs(corr) > PROXY_CORRELATION_THRESHOLD,
                        ))
                except Exception:
                    continue

        # Sort by correlation strength (descending)
        proxies.sort(key=lambda p: abs(p.correlation), reverse=True)
        return proxies

    def compute_representation_gaps(
        self,
        protected_attributes: list[str],
    ) -> list[RepresentationGap]:
        """
        Compare dataset demographics against known population baselines.
        """
        gaps = []
        for attr in protected_attributes:
            if attr not in self.df.columns:
                continue

            value_counts = self.df[attr].value_counts(normalize=True)
            baseline = POPULATION_BASELINES.get(attr.lower(), {})

            for value, proportion in value_counts.items():
                baseline_prop = baseline.get(str(value))
                gap = None
                if baseline_prop is not None:
                    gap = round(proportion - baseline_prop, 4)

                gaps.append(RepresentationGap(
                    attribute=attr,
                    group=str(value),
                    dataset_proportion=round(proportion, 4),
                    baseline_proportion=baseline_prop,
                    gap=gap,
                ))

        return gaps

    def run_full_inspection(
        self,
        dataset_id: str,
        protected_attributes: Optional[list[str]] = None,
        label_column: Optional[str] = None,
        favorable_label=None,
    ) -> InspectResponse:
        """
        Run the complete Inspect phase pipeline.
        Returns a full InspectResponse.
        """
        # Step 1: Profile all columns
        columns = self.profile_columns()

        # Step 2: Auto-detect protected attributes if not provided
        detected_attrs = self.detect_protected_attributes()
        if protected_attributes:
            all_attrs = list(set(protected_attributes + detected_attrs))
        else:
            all_attrs = detected_attrs

        # Step 3: Group distributions
        distributions = self.compute_group_distributions(
            all_attrs, label_column, favorable_label
        )

        # Step 4: Proxy variable detection
        proxies = self.detect_proxy_variables(all_attrs)

        # Step 5: Representation gaps
        rep_gaps = self.compute_representation_gaps(all_attrs)

        # Generate warnings
        warnings = self._generate_warnings(
            distributions, proxies, rep_gaps
        )

        return InspectResponse(
            dataset_id=dataset_id,
            row_count=self.row_count,
            column_count=self.column_count,
            columns=columns,
            detected_protected_attributes=all_attrs,
            group_distributions=distributions,
            proxy_variables=proxies,
            representation_gaps=rep_gaps,
            warnings=warnings,
        )

    # ──────────────────────────────────────
    #  Private helpers
    # ──────────────────────────────────────

    def _is_protected_attribute(self, col_name: str) -> bool:
        """Check if column name matches protected attribute keywords."""
        col_lower = col_name.lower().replace("_", " ").replace("-", " ")
        return any(kw in col_lower for kw in PROTECTED_ATTRIBUTE_KEYWORDS)

    def _compute_correlation(
        self,
        feature: pd.Series,
        protected: pd.Series,
    ) -> tuple[Optional[float], str]:
        """
        Compute correlation between a feature and a protected attribute.

        - Numeric feature + binary protected: point-biserial
        - Categorical feature + categorical protected: Cramér's V
        """
        feature_clean = feature.dropna()
        protected_clean = protected[feature_clean.index].dropna()
        common_idx = feature_clean.index.intersection(protected_clean.index)

        if len(common_idx) < 10:
            return None, ""

        feat = feature_clean[common_idx]
        prot = protected_clean[common_idx]

        # If feature is numeric and protected is binary
        if pd.api.types.is_numeric_dtype(feat) and prot.nunique() == 2:
            # Encode protected as 0/1
            prot_encoded = pd.Categorical(prot).codes
            corr, _ = stats.pointbiserialr(prot_encoded, feat)
            return corr, "point_biserial"

        # If both are categorical, use Cramér's V
        if feat.nunique() <= 50 and prot.nunique() <= 20:
            return self._cramers_v(feat, prot), "cramers_v"

        return None, ""

    @staticmethod
    def _cramers_v(x: pd.Series, y: pd.Series) -> float:
        """Compute Cramér's V for two categorical variables."""
        confusion = pd.crosstab(x, y)
        chi2 = stats.chi2_contingency(confusion)[0]
        n = confusion.sum().sum()
        min_dim = min(confusion.shape) - 1
        if min_dim == 0 or n == 0:
            return 0.0
        return np.sqrt(chi2 / (n * min_dim))

    def _generate_warnings(
        self,
        distributions: list[GroupDistribution],
        proxies: list[ProxyVariable],
        rep_gaps: list[RepresentationGap],
    ) -> list[str]:
        """Generate human-readable warnings from inspection results."""
        warnings = []

        # Check for severe imbalances
        for dist in distributions:
            if dist.proportion > 0.85:
                warnings.append(
                    f"Severe imbalance: '{dist.group}' in '{dist.attribute}' "
                    f"represents {dist.proportion * 100:.1f}% of the data."
                )
            if dist.proportion < 0.05:
                warnings.append(
                    f"Underrepresentation: '{dist.group}' in '{dist.attribute}' "
                    f"represents only {dist.proportion * 100:.1f}% of the data."
                )

        # Check for proxy variables
        strong_proxies = [p for p in proxies if p.is_proxy]
        if strong_proxies:
            for proxy in strong_proxies[:3]:  # top 3
                warnings.append(
                    f"Proxy variable detected: '{proxy.feature}' has "
                    f"|correlation| = {proxy.correlation:.3f} with "
                    f"'{proxy.protected_attribute}'. This feature may encode "
                    f"protected information even if the attribute is removed."
                )

        # Check for large representation gaps
        for gap in rep_gaps:
            if gap.gap is not None and abs(gap.gap) > 0.15:
                direction = "overrepresented" if gap.gap > 0 else "underrepresented"
                warnings.append(
                    f"Representation gap: '{gap.group}' in '{gap.attribute}' is "
                    f"{direction} by {abs(gap.gap) * 100:.1f}% compared to "
                    f"population baseline."
                )

        return warnings
