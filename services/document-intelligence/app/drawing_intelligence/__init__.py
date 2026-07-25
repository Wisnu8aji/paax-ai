"""Kreo-inspired, evidence-first Drawing Intelligence runtime for PAAX.

The package coordinates deterministic PDF/vector tools, DEM observations and
human review.  It deliberately does not calculate final RAB or schedule values.
"""

from .models import DrawingPackageAnalysis
from .pipeline import analyze_drawing_package

__all__ = ["DrawingPackageAnalysis", "analyze_drawing_package"]
