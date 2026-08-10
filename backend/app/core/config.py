from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    secret_key: str = "dev-super-secret-change-me"
    environment: str = "development"
    access_token_expire_minutes: int = 720
    jwt_algorithm: str = "HS256"

    # Database
    database_url: str = "postgresql+psycopg://nppm:nppm@localhost:5432/nppm"

    # Object storage (S3 / MinIO)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "nppm-documents"
    s3_region: str = "us-east-1"

    # AI (OpenAI-compatible)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    ai_chat_model: str = "gpt-4o-mini"
    ai_embedding_model: str = "text-embedding-3-small"
    ai_embedding_dim: int = 1536

    # Seed
    seed_on_startup: bool = True
    seed_admin_email: str = "admin@demo.org"
    seed_admin_password: str = "Admin123!"
    seed_reviewer_email: str = "reviewer@demo.org"
    seed_reviewer_password: str = "Reviewer123!"
    seed_org_email: str = "org@demo.org"
    seed_org_password: str = "Org123!"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
