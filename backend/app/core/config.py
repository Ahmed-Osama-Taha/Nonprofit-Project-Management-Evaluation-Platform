from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Identity
    app_name: str = "Athar"
    app_name_ar: str = "أثر"
    app_tagline: str = "Nonprofit Project Management & Evaluation Platform"
    app_tagline_ar: str = "منصة إدارة وتقييم مشاريع المنظمات غير الربحية"

    # Core
    secret_key: str = "dev-super-secret-change-me"
    environment: str = "development"
    access_token_expire_minutes: int = 720
    jwt_algorithm: str = "HS256"
    default_currency: str = "SAR"

    # Database
    database_url: str = "postgresql+psycopg://nppm:nppm@localhost:5432/nppm"

    # Object storage (S3 / MinIO)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "nppm-documents"
    s3_region: str = "us-east-1"

    # Audit: every API request is journaled to S3 as newline-delimited JSON
    audit_to_s3: bool = True
    audit_s3_prefix: str = "audit"

    # ------------------------------------------------------------------ AI
    # Provider for the LLM (analysis + Q&A). Anthropic Claude is the default.
    ai_provider: str = "anthropic"  # "anthropic" | "openai"

    # Anthropic (Claude)
    anthropic_api_key: str = ""
    anthropic_base_url: str = ""  # blank -> SDK default
    anthropic_model: str = "claude-opus-5"
    anthropic_max_tokens: int = 4096

    # OpenAI-compatible (optional alternative provider)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    ai_chat_model: str = "gpt-4o-mini"

    # Embeddings are pluggable and independent of the chat provider.
    #   "local"  -> deterministic hashing embedding, works offline with only a
    #               Claude key (Anthropic has no embeddings endpoint).
    #   "openai" -> OpenAI embeddings API (requires openai_api_key).
    embedding_provider: str = "local"
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
        if self.ai_provider == "anthropic":
            return bool(self.anthropic_api_key)
        return bool(self.openai_api_key)

    @property
    def ai_model_name(self) -> str:
        return self.anthropic_model if self.ai_provider == "anthropic" else self.ai_chat_model


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
