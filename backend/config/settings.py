import os

class Settings:
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "GravityX Workspace Engine"
    
    # Allowed origins for CORS connections
    BACKEND_CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

settings = Settings()
