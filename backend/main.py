import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database.connection import engine, Base
from .config.settings import settings
from .api.routes import router as api_router
from .api.agent_routes import agent_ws_router
from contextlib import asynccontextmanager
from .terminal.websocket import ws_router as terminal_ws_router
from .terminal.manager import terminal_manager


class _SafeStream:
    """Prevents OSError (Errno 22) when stdout/stderr pipe detaches on Windows."""

    def __init__(self, stream):
        self._stream = stream

    def write(self, data):
        try:
            return self._stream.write(data)
        except OSError:
            return len(data)

    def flush(self):
        try:
            self._stream.flush()
        except OSError:
            pass

    def __getattr__(self, name):
        return getattr(self._stream, name)


if sys.stdout is not None:
    sys.stdout = _SafeStream(sys.stdout)
if sys.stderr is not None:
    sys.stderr = _SafeStream(sys.stderr)

# Initialize SQLite database tables dynamically on backend startup
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    terminal_manager.close_all()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# Set up CORS middleware rules
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route mounting
app.include_router(api_router, prefix="/api")
app.include_router(terminal_ws_router)
app.include_router(agent_ws_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "GravityX Workspace Engine API",
        "documentation": "/api/docs"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
