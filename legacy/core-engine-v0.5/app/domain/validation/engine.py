from typing import List, Dict, Any

def run_all_checks(rab_data: Dict[str, Any]) -> Dict[str, List[str]]:
    return {
        "errors": [],
        "warnings": ["Warning from validation engine"]
    }
