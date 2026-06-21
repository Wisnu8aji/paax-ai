from pydantic import BaseModel
from typing import List

class ElementCandidate(BaseModel):
    type: str
    confidence: float

class RoomCandidate(BaseModel):
    name: str
    area_m2: float

class DrawingExtraction(BaseModel):
    file_id: str
    elements: List[ElementCandidate]
    rooms: List[RoomCandidate]
