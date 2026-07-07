from sqlalchemy import Column, String, Integer, Numeric, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    location = Column(String)
    client = Column(String)
    type = Column(String)
    status = Column(String, nullable=False, default="active")
    description = Column(String)
    rab_value = Column(Numeric)
    progress = Column(Integer, nullable=False, default=0)
    warnings = Column(Integer, nullable=False, default=0)
    health = Column(Integer, nullable=False, default=100)
    last_activity = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class RabDraft(Base):
    __tablename__ = "rab_drafts"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    payload = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class TkgRecord(Base):
    __tablename__ = "tkg_records"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    payload = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
