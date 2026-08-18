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
    access_token_expire_minutes: int = 30            # short-lived; refresh renews it
    refresh_token_expire_minutes: int = 60 * 24 * 14  # 14 days
    jwt_algorithm: str = "HS256"
    default_currency: str = "SAR"

    # Auth cookies — the JWT is delivered as an httpOnly cookie so browser JS
    # (and therefore XSS) cannot read it. A Bearer Authorization header still
    # works for API clients and takes precedence when both are present.
    cookie_secure: bool = False        # set True in production (HTTPS only)
    cookie_samesite: str = "lax"       # "strict" | "lax" | "none"
    cookie_domain: str = ""            # blank -> host-only cookie
    access_cookie_name: str = "ath_access"
    refresh_cookie_name: str = "ath_refresh"
    csrf_cookie_name: str = "ath_csrf"

    # Session activity log — geolocation of login IPs is FULLY OFFLINE: a local
    # MaxMind-format City DB (.mmdb) mounted into the container, resolved
    # in-process. The backend makes NO outbound network calls for geolocation
    # (required for a no-egress / security-compliant environment). Blank or a
    # missing file -> IPs are classified only as "Local network" vs unknown.
    geoip_db_path: str = ""
    # Privacy: when False (the default), login IPs are NOT stored at all — only
    # device, coarse location, and timestamps. Recommended for a public shared
    # demo so one demo user can't see another's IP. Set True on a private,
    # single-tenant deployment where you want raw IPs for security forensics.
    session_store_ip: bool = False

    # Redis — token denylist (revocation) + caching + rate-limit counters.
    # Blank disables (no-op).
    redis_url: str = ""                # e.g. redis://redis:6379/0

    # Rate limiting (fixed window, Redis-backed). Active only when Redis is
    # configured; otherwise every request is allowed (dev/test no-op).
    rate_limit_enabled: bool = True
    rate_limit_ip_max: int = 300           # requests per IP per window
    rate_limit_ip_window: int = 60         # seconds
    rate_limit_tenant_max: int = 600       # requests per organization per window
    rate_limit_tenant_window: int = 60     # seconds

    # Antivirus — ClamAV daemon (clamd) for uploaded-file scanning. Blank host
    # disables scanning (dev/test no-op). When a host is set, uploads are scanned
    # and the flow fails CLOSED (reject) if the scanner can't be reached.
    clamav_host: str = ""              # e.g. "clamav"
    clamav_port: int = 3310
    clamav_timeout: int = 30           # seconds

    # Payments — Model A (pay to have a project reviewed). When disabled, the
    # entitlement gate is off (dev/test submit freely). Works fully in MOCK mode
    # with no gateway keys; setting TAP_SECRET_KEY auto-switches to real Tap.
    payments_enabled: bool = False
    payment_currency: str = "SAR"
    vat_rate: float = 0.15                     # KSA VAT (15%)
    # Prices in integer MINOR units (halalas). 15000 = 150.00 SAR.
    price_per_review_minor: int = 15000        # ex-VAT
    price_subscription_minor: int = 49900      # ex-VAT, per month
    subscription_period_days: int = 30
    # Where the gateway sends the customer back (frontend return page).
    payment_return_url: str = "http://localhost:3000/payments/return"
    # Tap gateway credentials — leave blank for MOCK mode. Real values come from
    # env / Secrets Manager only (never committed). Presence of the secret key
    # flips the provider from mock -> tap.
    tap_secret_key: str = ""
    tap_webhook_secret: str = ""
    tap_api_base: str = "https://api.tap.company/v2"

    # Async broker — when set, AI analysis is enqueued to RabbitMQ and executed
    # by a dramatiq worker (out of the web process). Blank -> the API runs it
    # in-process via FastAPI BackgroundTasks (dev/test fallback).
    rabbitmq_url: str = ""             # e.g. amqp://guest:guest@rabbitmq:5672/

    # Observability (OpenTelemetry). Off by default so dev/tests need no stack;
    # enabled in the observability compose profile. When on, the app emits
    # traces (OTLP -> collector -> Jaeger), a Prometheus /metrics endpoint, and
    # structured JSON logs with trace correlation.
    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str = ""   # e.g. http://otel-collector:4317
    otel_service_name: str = "athar-backend"

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
    anthropic_max_tokens: int = 8000

    # OpenAI-compatible (optional alternative provider)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    ai_chat_model: str = "gpt-4o-mini"

    # Embeddings are pluggable and independent of the chat provider.
    #   "st"     -> local multilingual sentence-transformer (SEMANTIC, offline,
    #               Arabic-capable). Default: real semantic retrieval, no external
    #               key. Downloads the model on first use.
    #   "local"  -> deterministic hashing embedding (lexical, zero-dependency
    #               fallback; works with no ML libs installed).
    #   "openai" -> hosted OpenAI embeddings API (requires openai_api_key).
    # NOTE: ai_embedding_dim MUST match the active provider's output dimension —
    #   st (paraphrase-multilingual-MiniLM-L12-v2)=384, openai(3-small)=1536.
    embedding_provider: str = "st"
    ai_st_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    ai_embedding_model: str = "text-embedding-3-small"
    ai_embedding_dim: int = 384

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
