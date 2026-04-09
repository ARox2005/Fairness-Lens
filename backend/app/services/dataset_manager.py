"""
Dataset Manager Service

Handles:
1. Loading pre-built demo datasets (UCI Adult, German Credit, COMPAS)
2. User CSV uploads with validation
3. In-memory dataset storage for the session

From the document:
"Include a prominent 'Try Demo' button on the landing page that loads
the UCI Adult dataset and runs the full pipeline with pre-computed results
— judges should experience your entire product in under 60 seconds."
"""

import os
import uuid
import logging
import pandas as pd
import numpy as np
from typing import Optional
from app.models.schemas import DemoDataset

logger = logging.getLogger(__name__)

# In-memory storage for uploaded/loaded datasets
_datasets: dict[str, pd.DataFrame] = {}
_dataset_metadata: dict[str, dict] = {}


def get_dataset(dataset_id: str) -> Optional[pd.DataFrame]:
    """Retrieve a loaded dataset by ID."""
    return _datasets.get(dataset_id)


def get_metadata(dataset_id: str) -> Optional[dict]:
    """Retrieve metadata for a loaded dataset."""
    return _dataset_metadata.get(dataset_id)


def store_dataset(
    df: pd.DataFrame,
    dataset_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> str:
    """Store a dataset in memory and return its ID."""
    if dataset_id is None:
        dataset_id = str(uuid.uuid4())[:8]
    _datasets[dataset_id] = df
    _dataset_metadata[dataset_id] = metadata or {}
    return dataset_id


def list_demo_datasets() -> list[DemoDataset]:
    """Return the list of available demo datasets."""
    return [
        DemoDataset(
            id="adult",
            name="UCI Adult / Census Income",
            description=(
                "~48,000 records from the 1994 US Census. Predict whether income "
                "exceeds $50K/year. Contains well-documented gender and race bias — "
                "men are 2x more likely to earn >$50K than women."
            ),
            row_count=32561,
            column_count=15,
            protected_attributes=["sex", "race"],
            label_column="income",
            favorable_label=">50K",
            domain="hiring",
        ),
        DemoDataset(
            id="german_credit",
            name="German Credit Dataset",
            description=(
                "1,000 loan applicants from a southern German bank (1973-75). "
                "Classify credit risk as good or bad. Protected attributes: "
                "gender and age (over/under 25)."
            ),
            row_count=1000,
            column_count=21,
            protected_attributes=["sex", "age"],
            label_column="credit",
            favorable_label=1,
            domain="lending",
        ),
        DemoDataset(
            id="compas",
            name="ProPublica COMPAS Recidivism",
            description=(
                "~7,000 criminal defendants from Broward County, FL. "
                "Predict recidivism risk. ProPublica found Black defendants were "
                "nearly 2x as likely to be falsely flagged high-risk (45% vs 23% FPR)."
            ),
            row_count=6907,
            column_count=9,
            protected_attributes=["sex", "race"],
            label_column="two_year_recid",
            favorable_label=0,
            domain="criminal_justice",
        ),
    ]


def load_demo_dataset(demo_id: str) -> tuple[str, pd.DataFrame, dict]:
    """
    Load a demo dataset and return (dataset_id, dataframe, metadata).

    For the MVP, we generate synthetic data matching the statistical
    properties of each real dataset. In production, load from CSV files
    in the datasets/ directory or fetch via AIF360 built-in loaders.
    """
    if demo_id == "adult":
        return _load_adult_dataset()
    elif demo_id == "german_credit":
        return _load_german_credit_dataset()
    elif demo_id == "compas":
        return _load_compas_dataset()
    else:
        raise ValueError(f"Unknown demo dataset: {demo_id}")


def load_from_csv(
    file_content: bytes,
    filename: str,
) -> tuple[str, pd.DataFrame]:
    """
    Load a user-uploaded CSV file.
    Returns (dataset_id, dataframe).
    """
    import io

    try:
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                df = pd.read_csv(
                    io.BytesIO(file_content),
                    encoding=encoding,
                    na_values=['?', 'NA', 'N/A', '', 'null', 'NULL'],
                )
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not decode file with any supported encoding")

        # Basic validation
        if len(df) == 0:
            raise ValueError("Dataset is empty")
        if len(df.columns) < 2:
            raise ValueError("Dataset must have at least 2 columns")

        # Clean column names
        df.columns = [c.strip().replace(' ', '_') for c in df.columns]

        # Generate dataset ID
        dataset_id = f"upload_{uuid.uuid4().hex[:8]}"

        # Store
        store_dataset(df, dataset_id, {
            "source": "upload",
            "filename": filename,
            "row_count": len(df),
            "column_count": len(df.columns),
        })

        return dataset_id, df

    except Exception as e:
        logger.error(f"CSV load error: {e}")
        raise ValueError(f"Failed to load CSV: {str(e)}")


# ──────────────────────────────────────
#  Demo Dataset Generators
# ──────────────────────────────────────

def _load_adult_dataset() -> tuple[str, pd.DataFrame, dict]:
    """
    Load UCI Adult dataset.

    Try to load from local CSV first; if not available,
    generate a statistically representative synthetic version.

    Key properties to reproduce:
    - 2:1 male/female ratio
    - ~31% of men earn >50K vs ~11% of women
    - Race distribution: ~85% White, ~10% Black, ~5% other
    """
    csv_path = os.path.join(
        os.path.dirname(__file__), '..', '..', '..', 'datasets', 'adult.csv'
    )

    if os.path.exists(csv_path):
        df = pd.read_csv(csv_path, na_values=['?', ' ?'])
        df.columns = [c.strip() for c in df.columns]
    else:
        # Generate synthetic data matching Adult dataset statistics
        np.random.seed(42)
        n = 32561

        sex = np.random.choice(
            ['Male', 'Female'], size=n, p=[0.669, 0.331]
        )
        race = np.random.choice(
            ['White', 'Black', 'Asian-Pac-Islander', 'Amer-Indian-Eskimo', 'Other'],
            size=n, p=[0.854, 0.096, 0.032, 0.010, 0.008]
        )
        age = np.clip(
            np.random.normal(38.5, 13.6, n).astype(int), 17, 90
        )
        education_num = np.clip(
            np.random.normal(10.0, 2.6, n).astype(int), 1, 16
        )
        hours_per_week = np.clip(
            np.random.normal(40.4, 12.3, n).astype(int), 1, 99
        )
        workclass = np.random.choice(
            ['Private', 'Self-emp-not-inc', 'Local-gov', 'State-gov',
             'Federal-gov', 'Self-emp-inc'],
            size=n, p=[0.70, 0.08, 0.07, 0.04, 0.04, 0.07]
        )
        occupation = np.random.choice(
            ['Prof-specialty', 'Craft-repair', 'Exec-managerial',
             'Adm-clerical', 'Sales', 'Other-service', 'Machine-op-inspct',
             'Transport-moving', 'Handlers-cleaners', 'Tech-support'],
            size=n
        )
        marital_status = np.random.choice(
            ['Married-civ-spouse', 'Never-married', 'Divorced',
             'Separated', 'Widowed'],
            size=n, p=[0.46, 0.33, 0.14, 0.03, 0.04]
        )
        relationship = np.random.choice(
            ['Husband', 'Not-in-family', 'Own-child', 'Unmarried',
             'Wife', 'Other-relative'],
            size=n, p=[0.40, 0.26, 0.15, 0.11, 0.05, 0.03]
        )

        # Generate income with documented bias
        # ~31% of men earn >50K vs ~11% of women
        income_prob = np.where(
            sex == 'Male',
            0.31 + (education_num - 10) * 0.03 + (age - 38) * 0.005,
            0.11 + (education_num - 10) * 0.025 + (age - 38) * 0.003,
        )
        # Race effect
        income_prob = np.where(race == 'White', income_prob + 0.03, income_prob - 0.02)
        income_prob = np.clip(income_prob, 0.02, 0.95)
        income = np.where(
            np.random.random(n) < income_prob, '>50K', '<=50K'
        )

        df = pd.DataFrame({
            'age': age,
            'workclass': workclass,
            'education_num': education_num,
            'marital_status': marital_status,
            'occupation': occupation,
            'relationship': relationship,
            'race': race,
            'sex': sex,
            'hours_per_week': hours_per_week,
            'income': income,
        })

    metadata = {
        "source": "demo",
        "name": "UCI Adult / Census Income",
        "protected_attributes": ["sex", "race"],
        "label_column": "income",
        "favorable_label": ">50K",
        "domain": "hiring",
    }

    dataset_id = "adult"
    store_dataset(df, dataset_id, metadata)
    return dataset_id, df, metadata


def _load_german_credit_dataset() -> tuple[str, pd.DataFrame, dict]:
    """
    Load German Credit dataset (synthetic version matching statistics).
    1,000 rows, protected attributes: sex, age.
    """
    np.random.seed(42)
    n = 1000

    sex = np.random.choice(['male', 'female'], size=n, p=[0.69, 0.31])
    age = np.clip(np.random.normal(35, 11, n).astype(int), 19, 75)
    age_group = np.where(age > 25, 'Old', 'Young')

    duration = np.clip(np.random.normal(20.9, 12.1, n).astype(int), 4, 72)
    credit_amount = np.clip(
        np.random.lognormal(7.8, 0.8, n).astype(int), 250, 20000
    )
    installment_rate = np.random.choice([1, 2, 3, 4], size=n, p=[0.14, 0.23, 0.28, 0.35])
    employment = np.random.choice(
        ['unemployed', '<1yr', '1-4yr', '4-7yr', '>7yr'],
        size=n, p=[0.06, 0.17, 0.34, 0.17, 0.26]
    )
    housing = np.random.choice(['own', 'rent', 'free'], size=n, p=[0.71, 0.18, 0.11])
    purpose = np.random.choice(
        ['car_new', 'car_used', 'furniture', 'radio_tv', 'education',
         'business', 'repairs', 'vacation'],
        size=n
    )
    savings = np.random.choice(
        ['<100', '100-500', '500-1000', '>1000', 'unknown'],
        size=n, p=[0.60, 0.10, 0.06, 0.05, 0.19]
    )

    # Credit decision with gender and age bias
    credit_prob = np.full(n, 0.70)
    credit_prob = np.where(sex == 'female', credit_prob - 0.12, credit_prob)
    credit_prob = np.where(age < 25, credit_prob - 0.15, credit_prob)
    credit_prob = np.where(
        np.isin(employment, ['unemployed', '<1yr']), credit_prob - 0.20, credit_prob
    )
    credit_prob = np.clip(credit_prob, 0.1, 0.95)
    credit = np.where(np.random.random(n) < credit_prob, 1, 2)

    df = pd.DataFrame({
        'duration': duration,
        'credit_amount': credit_amount,
        'installment_rate': installment_rate,
        'age': age,
        'age_group': age_group,
        'sex': sex,
        'employment': employment,
        'housing': housing,
        'savings': savings,
        'purpose': purpose,
        'credit': credit,
    })

    metadata = {
        "source": "demo",
        "name": "German Credit",
        "protected_attributes": ["sex", "age_group"],
        "label_column": "credit",
        "favorable_label": 1,
        "domain": "lending",
    }

    dataset_id = "german_credit"
    store_dataset(df, dataset_id, metadata)
    return dataset_id, df, metadata


def _load_compas_dataset() -> tuple[str, pd.DataFrame, dict]:
    """
    Load COMPAS recidivism dataset (synthetic version).
    ~7,000 rows, protected attributes: sex, race.

    Key bias to reproduce:
    - Black defendants ~45% FPR vs White ~23% FPR
    """
    np.random.seed(42)
    n = 6907

    sex = np.random.choice(['Male', 'Female'], size=n, p=[0.81, 0.19])
    race = np.random.choice(
        ['Caucasian', 'African-American', 'Hispanic', 'Other'],
        size=n, p=[0.34, 0.51, 0.09, 0.06]
    )
    age_cat = np.random.choice(
        ['Less than 25', '25 - 45', 'Greater than 45'],
        size=n, p=[0.22, 0.52, 0.26]
    )
    priors_count = np.clip(
        np.random.exponential(3.2, n).astype(int), 0, 38
    )
    juv_fel_count = np.clip(
        np.random.exponential(0.1, n).astype(int), 0, 10
    )
    charge_degree = np.random.choice(['F', 'M'], size=n, p=[0.57, 0.43])

    # Recidivism with racial bias (replicating COMPAS findings)
    recid_prob = np.full(n, 0.45)
    recid_prob = np.where(race == 'African-American', recid_prob + 0.10, recid_prob)
    recid_prob = np.where(race == 'Caucasian', recid_prob - 0.08, recid_prob)
    recid_prob = np.where(age_cat == 'Less than 25', recid_prob + 0.10, recid_prob)
    recid_prob = np.where(age_cat == 'Greater than 45', recid_prob - 0.15, recid_prob)
    recid_prob += priors_count * 0.02
    recid_prob = np.clip(recid_prob, 0.05, 0.90)
    two_year_recid = np.where(np.random.random(n) < recid_prob, 1, 0)

    df = pd.DataFrame({
        'sex': sex,
        'race': race,
        'age_cat': age_cat,
        'priors_count': priors_count,
        'juv_fel_count': juv_fel_count,
        'c_charge_degree': charge_degree,
        'two_year_recid': two_year_recid,
    })

    metadata = {
        "source": "demo",
        "name": "ProPublica COMPAS",
        "protected_attributes": ["sex", "race"],
        "label_column": "two_year_recid",
        "favorable_label": 0,  # 0 = no recidivism (favorable)
        "domain": "criminal_justice",
    }

    dataset_id = "compas"
    store_dataset(df, dataset_id, metadata)
    return dataset_id, df, metadata
