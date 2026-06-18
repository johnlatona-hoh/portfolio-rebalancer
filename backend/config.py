from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://localhost/rebalancer"
    GEMINI_API_KEY: str = ""              # optional — AI features no-op when absent
    SNAPSHOT_ENCRYPTION_KEY: str = ""     # Fernet key for encrypting saved snapshots
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
