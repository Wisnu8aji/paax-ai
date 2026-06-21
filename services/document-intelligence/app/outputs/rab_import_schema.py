from pydantic import BaseModel
from typing import List

class QuantityCandidate(BaseModel):
    item_name: str
    quantity: float
    unit: str

class RabImport(BaseModel):
    project_id: str
    quantities: List[QuantityCandidate]
