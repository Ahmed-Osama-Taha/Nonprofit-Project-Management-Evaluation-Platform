"""S3 / MinIO object storage wrapper."""

from __future__ import annotations

import io

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings

_client = None


def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
        )
    return _client


def ensure_bucket() -> None:
    s3 = _s3()
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        s3.create_bucket(Bucket=settings.s3_bucket)


def upload_bytes(key: str, data: bytes, content_type: str | None = None) -> None:
    s3 = _s3()
    s3.upload_fileobj(
        io.BytesIO(data),
        settings.s3_bucket,
        key,
        ExtraArgs={"ContentType": content_type} if content_type else None,
    )


def download_bytes(key: str) -> bytes:
    s3 = _s3()
    buf = io.BytesIO()
    s3.download_fileobj(settings.s3_bucket, key, buf)
    return buf.getvalue()


def presigned_url(key: str, expires: int = 3600) -> str:
    """Generate a browser-facing download URL using the public endpoint."""
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.s3_public_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )
