import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database.connection import engine, Base
from .config.settings import settings
from .api.routes import router as api_router
from .terminal.websocket import ws_router as terminal_ws_router

# Initialize SQLite database tables dynamically on backend startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
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

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "GravityX Workspace Engine API",
        "documentation": "/api/docs"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
