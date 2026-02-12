from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKER_APP_ROOT = REPO_ROOT / "apps" / "worker"

sys.path.insert(0, str(WORKER_APP_ROOT))
