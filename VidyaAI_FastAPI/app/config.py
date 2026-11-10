from urllib.parse import quote_plus, urlparse

from pydantic import computed_field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-change-in-production"
    openai_api_key: str = ""
    database_url: str = ""
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_db_password: str = ""
    # IPv4-compatible pooler host from Supabase Dashboard → Connect → Session pooler
    supabase_db_host: str = ""
    supabase_db_port: int = 5432
    upload_dir: str = "./uploads"
    audio_dir: str = "./uploads/audio"
    images_dir: str = "./uploads/images"
    max_upload_size_mb: int = 500
    s3_bucket_name: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "ap-south-1"
    cors_origins: str = "http://localhost:3000"
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_days: int = 30
    words_per_minute: int = 150
    target_lecture_minutes: int = 40
    max_lecture_minutes: int = 60
    lecture_model: str = "gpt-4.1"
    classification_model: str = "gpt-4o-mini"
    visual_model: str = "gpt-4.1"
    image_model: str = "gpt-image-1"
    max_visual_frames: int = 6
    lecture_max_tokens: int = 16384
    lecture_max_continuations: int = 4
    tts_provider: str = "polly"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    polly_voice_id: str = "Kajal"
    # generative = most natural (conversational); neural = fallback in unsupported regions
    polly_engine: str = "generative"
    # Generative is not available in ap-south-1 — use ap-southeast-1 or us-east-1 when needed
    polly_region: str = ""
    polly_use_ssml: bool = True
    polly_speech_rate: str = "95%"
    polly_pause_ms: int = 700
    polly_max_workers: int = 4
    embedding_model: str = "text-embedding-3-small"
    vector_chunk_chars: int = 1800
    vector_chunk_overlap: int = 200
    vector_embed_batch_size: int = 32
    run_startup_backfill: bool = False
    # Postgres/Supabase: run ALTER TABLE on API boot only when explicitly enabled.
    # Prefer backend/scripts/supabase_schema.sql in the Supabase SQL editor instead.
    run_startup_ddl: bool = False
    # Return exception messages in 500 JSON responses (disable in production)
    expose_error_details: bool = True

    # WhatsApp (Meta Cloud API) — parent report cards after practice/mock completion
    whatsapp_enabled: bool = False
    whatsapp_provider: str = "meta"  # meta | log
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_api_version: str = "v21.0"
    whatsapp_default_country_code: str = "91"

    # Razorpay (India individual subscriptions)
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    billing_dev_bypass: bool = False  # local only: skip Razorpay and activate plan

    # Hostinger SMTP — OTP / transactional mail (do not use Gmail)
    smtp_host: str = "smtp.hostinger.com"
    smtp_port: int = 465
    smtp_use_ssl: bool = True
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = "VidyaAI"
    otp_ttl_minutes: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"

    @staticmethod
    def _supabase_project_ref(url: str) -> str:
        host = urlparse(url.strip()).netloc
        return host.split(".")[0]

    def _supabase_pooler_database_url(self, ref: str, password: str) -> str:
        host = self.supabase_db_host.strip()
        port = self.supabase_db_port
        user = quote_plus(f"postgres.{ref}")
        return (
            f"postgresql+psycopg2://{user}:{password}@{host}:{port}/postgres"
            f"?sslmode=require"
        )

    def _supabase_direct_database_url(self, ref: str, password: str) -> str:
        return (
            f"postgresql+psycopg2://postgres:{password}@db.{ref}.supabase.co:5432/postgres"
            f"?sslmode=require"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_database_url(self) -> str:
        # Prefer Supabase env vars so passwords with @, !, etc. are URL-encoded correctly.
        if self.supabase_url and self.supabase_db_password:
            ref = self._supabase_project_ref(self.supabase_url)
            password = quote_plus(self.supabase_db_password)
            if self.supabase_db_host:
                return self._supabase_pooler_database_url(ref, password)
            return self._supabase_direct_database_url(ref, password)
        if self.database_url and "postgres" in self.database_url.lower():
            return self._normalize_postgres_url(self.database_url)
        if self.database_url:
            return self.database_url
        return "sqlite:///./vidyaai.db"

    @staticmethod
    def _normalize_postgres_url(url: str) -> str:
        """Accept Supabase dashboard URLs (postgresql://...) for SQLAlchemy."""
        normalized = url.strip()
        if normalized.startswith("postgres://"):
            normalized = "postgresql+psycopg2://" + normalized[len("postgres://") :]
        elif normalized.startswith("postgresql://") and "+psycopg2" not in normalized:
            normalized = normalized.replace("postgresql://", "postgresql+psycopg2://", 1)
        if "sslmode=" not in normalized and "supabase.co" in normalized:
            normalized += "&sslmode=require" if "?" in normalized else "?sslmode=require"
        return normalized

    @property
    def is_sqlite(self) -> bool:
        return self.resolved_database_url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return "postgres" in self.resolved_database_url.lower()

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    @property
    def s3_configured(self) -> bool:
        return bool(
            self.s3_bucket_name.strip()
            and self.s3_access_key_id.strip()
            and self.s3_secret_access_key.strip()
        )


settings = Settings()
