import os
from functools import lru_cache


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./landconnect.db")
    # Render and Heroku hand out postgres:// URLs; SQLAlchemy wants an explicit driver.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class Settings:
    def __init__(self) -> None:
        self.database_url = _database_url()
        self.jwt_secret = os.getenv("JWT_SECRET", "dev-only-change-me")
        self.jwt_ttl_hours = int(os.getenv("JWT_TTL_HOURS", "168"))
        self.livekit_url = os.getenv("LIVEKIT_URL", "")
        self.livekit_api_key = os.getenv("LIVEKIT_API_KEY", "")
        self.livekit_api_secret = os.getenv("LIVEKIT_API_SECRET", "")
        self.ring_timeout_seconds = int(os.getenv("RING_TIMEOUT_SECONDS", "45"))
        self.seed_demo_data = os.getenv("SEED_DEMO_DATA", "true").lower() == "true"
        self.max_image_bytes = int(os.getenv("MAX_IMAGE_BYTES", str(2 * 1024 * 1024)))

    @property
    def livekit_enabled(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
