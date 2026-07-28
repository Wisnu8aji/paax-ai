import pathlib

CODE = """

class ProjectReference(Base):
    __tablename__ = "project_references"

    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    reference_key = Column(String, nullable=False, index=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_project_references_default", is_default, postgresql_where=text("is_default = true"), unique=True),
    )


class BootstrapLedger(Base):
    __tablename__ = "bootstrap_ledger"

    reference_key = Column(String, primary_key=True)
    fixture_version = Column(String, primary_key=True)
    fixture_hash = Column(String, nullable=False)
    applied_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    result = Column(JSON_DOCUMENT, nullable=False)


class ActorWorkspaceHead(Base):
    __tablename__ = "actor_workspace_head"

    actor_id = Column(String, primary_key=True)
    active_project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    active_module = Column(String)
    active_tab = Column(String)
    schema_version = Column(String, nullable=False, default="1.0")
    revision = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ProjectWorkspaceSession(Base):
    __tablename__ = "project_workspace_sessions"

    actor_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    active_document_id = Column(String)
    active_sheet_id = Column(String)
    selected_sheet_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    preferences = Column(JSON_DOCUMENT, nullable=False, default=dict)
    open_conflict_group = Column(String)
    quantity_mode = Column(String)
    last_viewed_job_id = Column(String)
    schema_version = Column(String, nullable=False, default="1.0")
    revision = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
"""

path = pathlib.Path(r"G:\paax-ai-contextual-integration\services\db\src\paax_db\models.py")
content = path.read_text(encoding="utf-8")
if "BootstrapLedger" not in content:
    path.write_text(content + CODE, encoding="utf-8")
    print("Appended models successfully.")
else:
    print("Models already appended.")
