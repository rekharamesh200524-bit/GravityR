from sqlalchemy import Column, String, Integer, Boolean, Float, ForeignKey
from .connection import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    path = Column(String, unique=True, nullable=False)
    framework = Column(String, nullable=True)
    language = Column(String, nullable=True)
    total_files = Column(Integer, default=0)
    total_folders = Column(Integer, default=0)
    size_bytes = Column(Integer, default=0)
    created_at = Column(String, nullable=True)
    last_opened = Column(String, nullable=True)

class RecentProject(Base):
    __tablename__ = "recent_projects"

    path = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    last_opened = Column(String, nullable=False)

class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)

class RepositoryIndex(Base):
    __tablename__ = "repository_index"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, index=True)
    path = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_folder = Column(Boolean, default=False)
    extension = Column(String, nullable=True)
    size_bytes = Column(Integer, default=0)
    modified_at = Column(Float, default=0.0) # st_mtime float representation
    encoding = Column(String, default="utf-8")
    language = Column(String, default="plaintext")
    parent_path = Column(String, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_history"

    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, index=True)
    prompt = Column(String)
    ai_response = Column(String)
    files_changed = Column(String) # JSON string representation
    approvals = Column(String)     # JSON string representation
    rejections = Column(String)    # JSON string representation
    execution_time = Column(Float)
    git_commit = Column(String, nullable=True)
    timestamp = Column(String)

class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, index=True)
    operation_type = Column(String)  # 'write', 'read', 'search', 'terminal', 'git', etc.
    details = Column(String)
    status = Column(String)          # 'success', 'warning', 'error'
    execution_time = Column(Float)
    timestamp = Column(String)
