import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Database path is configured locally within the workspace directory
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "workspace.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Configure sqlite engine with thread safety and write timeout locks
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False, "timeout": 30}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
