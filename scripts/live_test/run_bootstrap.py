"""Run Phase 09E bootstrap to ensure DB is seeded with real PLHUT dataset before service launch."""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "live_test"))

from seed_plhut_real import seed_real_plhut

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Executing Phase 09E bootstrap...")
    try:
        status = await seed_real_plhut()
        print(json.dumps({"status": "SUCCESS", "bootstrap": status}, ensure_ascii=False, indent=2))
    except Exception as e:
        logger.error(f"Bootstrap failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
