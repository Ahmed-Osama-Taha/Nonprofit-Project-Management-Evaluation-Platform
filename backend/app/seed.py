"""Idempotent demo seed: admin + reviewer + a Saudi nonprofit and a portfolio
of Arabic project applications across categories and workflow states."""

from __future__ import annotations

from datetime import datetime, timezone

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


# Arabic project applications — Saudi/GCC nonprofit context, budgets in SAR.
_PROJECTS: list[dict] = [
    {
        "title": "تعليم رقمي للمدارس الريفية",
        "summary": "تجهيز 10 مدارس ريفية بمعامل تعلم رقمية وتدريب المعلمين.",
        "category": "التعليم",
        "status": ProjectStatus.submitted,
        "problem_statement": "تفتقر المدارس الريفية في المنطقة المستهدفة إلى الحواسيب والاتصال بالإنترنت، ما يحرم الطلاب من المهارات الرقمية الأساسية اللازمة للتعليم والعمل.",
        "goals": "1) إنشاء 10 معامل حاسب آلي. 2) تدريب 60 معلماً. 3) تقديم منهج للمهارات الرقمية لـ 3000 طالب في السنة الأولى.",
        "kpis": "عدد المعامل التشغيلية، عدد المعلمين المعتمدين، عدد الطلاب المكملين للمنهج، نسبة الحضور.",
        "target_beneficiaries": 3000,
        "beneficiary_description": "طلاب من عمر 10-16 عاماً ومعلموهم في 10 مدارس ريفية.",
        "requested_budget": 900000,
        "duration_months": 12,
        "location": "منطقة عسير",
    },
    {
        "title": "قوافل المياه النظيفة",
        "summary": "حفر آبار وتركيب محطات تنقية لخدمة القرى النائية.",
        "category": "الإغاثة",
        "status": ProjectStatus.approved,
        "problem_statement": "تعاني عدة قرى نائية من شح مصادر المياه الصالحة للشرب واعتمادها على مصادر ملوّثة.",
        "goals": "حفر 8 آبار وتركيب 8 محطات تنقية وتوفير مياه نظيفة لـ 12 قرية.",
        "kpis": "عدد الآبار العاملة، لترات المياه المنتجة يومياً، عدد المستفيدين، انخفاض الأمراض المنقولة بالمياه.",
        "target_beneficiaries": 8000,
        "beneficiary_description": "سكان 12 قرية نائية.",
        "requested_budget": 1250000,
        "duration_months": 10,
        "location": "منطقة جازان",
    },
    {
        "title": "تمكين اقتصادي للأسر المنتجة",
        "summary": "تدريب وتمويل صغير لدعم الأسر المنتجة وربطها بالأسواق.",
        "category": "التمكين الاقتصادي",
        "status": ProjectStatus.under_review,
        "problem_statement": "تمتلك كثير من الأسر مهارات إنتاجية لكنها تفتقر إلى التمويل والتسويق للوصول إلى الأسواق.",
        "goals": "تدريب 400 أسرة، وتقديم قروض حسنة صغيرة، وربطها بمنصات بيع إلكترونية.",
        "kpis": "عدد الأسر المدرّبة، متوسط الدخل الشهري، عدد المشاريع المستمرة بعد سنة.",
        "target_beneficiaries": 400,
        "beneficiary_description": "أسر منتجة بقيادة نساء في الأحياء ذات الدخل المحدود.",
        "requested_budget": 600000,
        "duration_months": 12,
        "location": "مدينة الرياض",
    },
    {
        "title": "رعاية صحية متنقلة",
        "summary": "عيادات متنقلة لتقديم الرعاية الأولية والفحوصات في المناطق النائية.",
        "category": "الصحة",
        "status": ProjectStatus.draft,
        "problem_statement": "بُعد المراكز الصحية عن التجمعات السكانية النائية يحدّ من وصول الخدمات الوقائية.",
        "goals": "تشغيل 3 عيادات متنقلة وتقديم 20 ألف زيارة رعاية أولية سنوياً.",
        "kpis": "عدد الزيارات، عدد حالات الاكتشاف المبكر، رضا المستفيدين.",
        "target_beneficiaries": 20000,
        "beneficiary_description": "سكان التجمعات النائية وكبار السن.",
        "requested_budget": 1800000,
        "duration_months": 18,
        "location": "منطقة تبوك",
    },
    {
        "title": "برنامج دعم ورعاية الأيتام",
        "summary": "كفالة تعليمية ونفسية واجتماعية للأيتام وأسرهم.",
        "category": "اجتماعي",
        "status": ProjectStatus.changes_requested,
        "problem_statement": "يحتاج الأيتام إلى دعم متكامل يتجاوز الجانب المالي ليشمل التعليم والصحة النفسية.",
        "goals": "كفالة 500 يتيم، وبرامج دعم نفسي، ومتابعة تعليمية دورية.",
        "kpis": "عدد المكفولين، التحصيل الدراسي، مؤشرات الصحة النفسية.",
        "target_beneficiaries": 500,
        "beneficiary_description": "أيتام في عمر المدرسة وأسرهم الحاضنة.",
        "requested_budget": 750000,
        "duration_months": 12,
        "location": "مدينة جدة",
    },
    {
        "title": "حاضنة مشاريع الشباب",
        "summary": "حاضنة أعمال لتأهيل رواد الأعمال الشباب وتسريع مشاريعهم.",
        "category": "التمكين الاقتصادي",
        "status": ProjectStatus.submitted,
        "problem_statement": "يواجه الشباب صعوبة في تحويل أفكارهم إلى مشاريع قابلة للنمو بسبب نقص الإرشاد والتمويل.",
        "goals": "تأهيل 200 رائد أعمال، واحتضان 40 مشروعاً، وربطهم بالمستثمرين.",
        "kpis": "عدد المشاريع المحتضنة، الوظائف المستحدثة، حجم التمويل المُجتذب.",
        "target_beneficiaries": 200,
        "beneficiary_description": "شباب من الجنسين في عمر 20-35 عاماً.",
        "requested_budget": 1100000,
        "duration_months": 14,
        "location": "المنطقة الشرقية",
    },
]


def seed() -> None:
    if not settings.seed_on_startup:
        return
    db = SessionLocal()
    try:
        _get_or_create_user(
            db, settings.seed_admin_email, settings.seed_admin_password,
            "مشرف المنصة", UserRole.admin,
        )
        _get_or_create_user(
            db, settings.seed_reviewer_email, settings.seed_reviewer_password,
            "مراجع داخلي", UserRole.reviewer,
        )

        org = db.scalar(select(Organization).where(Organization.name == "مؤسسة عطاء الخيرية"))
        if not org:
            org = Organization(
                name="مؤسسة عطاء الخيرية",
                description="منظمة غير ربحية تعمل في التعليم والإغاثة والتمكين الاقتصادي.",
                country="المملكة العربية السعودية",
                website="https://example.org",
            )
            db.add(org)
            db.flush()

        org_user = _get_or_create_user(
            db, settings.seed_org_email, settings.seed_org_password,
            "مدير المنظمة", UserRole.organization, organization_id=org.id,
        )

        existing = db.scalar(select(Project).where(Project.organization_id == org.id))
        if not existing:
            now = datetime.now(timezone.utc)
            for spec in _PROJECTS:
                status = spec["status"]
                submitted = status != ProjectStatus.draft
                decided = status in (ProjectStatus.approved, ProjectStatus.rejected)
                db.add(
                    Project(
                        title=spec["title"],
                        summary=spec["summary"],
                        category=spec["category"],
                        status=status,
                        problem_statement=spec["problem_statement"],
                        goals=spec["goals"],
                        kpis=spec["kpis"],
                        target_beneficiaries=spec["target_beneficiaries"],
                        beneficiary_description=spec["beneficiary_description"],
                        requested_budget=spec["requested_budget"],
                        currency=settings.default_currency,
                        duration_months=spec["duration_months"],
                        location=spec["location"],
                        submitted_at=now if submitted else None,
                        decided_at=now if decided else None,
                        organization_id=org.id,
                        owner_id=org_user.id,
                    )
                )

        db.commit()
    finally:
        db.close()
