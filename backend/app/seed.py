"""Idempotent demo seed: one admin, one reviewer, one organization + sample project."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Organization, Project, ProjectStatus, User, UserRole


def _get_or_create_user(
    db: Session, email: str, password: str, full_name: str, role: UserRole,
    organization_id: str | None = None,
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role=role,
        organization_id=organization_id,
    )
    db.add(user)
    db.flush()
    return user


def seed() -> None:
    if not settings.seed_on_startup:
        return
    db = SessionLocal()
    try:
        _get_or_create_user(
            db, settings.seed_admin_email, settings.seed_admin_password,
            "Platform Admin", UserRole.admin,
        )
        _get_or_create_user(
            db, settings.seed_reviewer_email, settings.seed_reviewer_password,
            "Internal Reviewer", UserRole.reviewer,
        )

        org = db.scalar(select(Organization).where(Organization.name == "Hope Foundation"))
        if not org:
            org = Organization(
                name="Hope Foundation",
                description="Community development NGO focused on education and relief.",
                country="Jordan",
                website="https://example.org",
            )
            db.add(org)
            db.flush()

        org_user = _get_or_create_user(
            db, settings.seed_org_email, settings.seed_org_password,
            "Org Manager", UserRole.organization, organization_id=org.id,
        )

        existing = db.scalar(select(Project).where(Project.organization_id == org.id))
        if not existing:
            db.add(
                Project(
                    title="Digital Literacy for Rural Schools",
                    summary="Equip 10 rural schools with digital learning labs and teacher training.",
                    category="Education",
                    status=ProjectStatus.draft,
                    problem_statement=(
                        "Rural schools in the target region lack access to computers and "
                        "internet, leaving students without basic digital skills required "
                        "for further education and employment."
                    ),
                    goals=(
                        "1) Establish 10 computer labs. 2) Train 60 teachers. "
                        "3) Deliver a digital literacy curriculum to 3,000 students in year one."
                    ),
                    kpis="# labs operational, # teachers certified, # students completing curriculum, attendance rate",
                    target_beneficiaries=3000,
                    beneficiary_description="Students aged 10-16 and their teachers in 10 rural schools.",
                    requested_budget=250000,
                    currency="USD",
                    duration_months=12,
                    location="Northern rural districts",
                    organization_id=org.id,
                    owner_id=org_user.id,
                )
            )

        db.commit()
    finally:
        db.close()
