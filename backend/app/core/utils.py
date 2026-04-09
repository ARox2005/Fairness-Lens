"""
Shared utility functions for FairnessLens backend.
"""

import pandas as pd


def is_categorical_column(series: pd.Series) -> bool:
    """
    Check if a pandas Series contains categorical/string data.
    Compatible with both pandas 2.x (object dtype) and 3.x (StringDtype).
    """
    return (
        series.dtype == 'object'
        or series.dtype.name == 'category'
        or series.dtype.kind == 'O'
        or pd.api.types.is_string_dtype(series)
    )
