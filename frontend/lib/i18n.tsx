"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

export type Lang = "ar" | "en";

type Dict = Record<string, string>;

const EN: Dict = {
  "app.name": "Athar",
  "app.tagline": "Nonprofit Project Management & Evaluation Platform",
  "nav.dashboard": "Dashboard",
  "nav.projects": "Projects",
  "nav.newProject": "New project",
  "nav.reviewer": "Review desk",
  "nav.admin": "Administration",
  "nav.logout": "Sign out",
  "nav.login": "Sign in",
  "common.loading": "Loading…",
  "common.save": "Save draft",
  "common.submit": "Submit",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.search": "Search",
  "common.all": "All",
  "common.none": "—",
  "common.optional": "optional",
  "common.currency": "SAR",
  "common.beneficiaries": "beneficiaries",
  "common.months": "months",
  "common.viewDetails": "View details",
  "role.admin": "Admin",
  "role.reviewer": "Reviewer",
  "role.organization": "Organization",
  "status.draft": "Draft",
  "status.submitted": "Submitted",
  "status.under_review": "Under review",
  "status.changes_requested": "Changes requested",
  "status.approved": "Approved",
  "status.rejected": "Rejected",
  // Auth
  "auth.signIn": "Sign in",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.registerOrg": "Register your organization",
  "auth.orgName": "Organization name",
  "auth.fullName": "Full name",
  "auth.country": "Country",
  "auth.website": "Website",
  "auth.haveAccount": "Already have an account?",
  "auth.noAccount": "New organization?",
  "auth.demoAccounts": "Demo accounts",
  // Projects
  "proj.title": "Project title",
  "proj.summary": "Summary",
  "proj.category": "Category",
  "proj.problem": "Problem statement",
  "proj.goals": "Goals",
  "proj.kpis": "KPIs",
  "proj.targetBeneficiaries": "Target beneficiaries",
  "proj.beneficiaryDesc": "Beneficiary description",
  "proj.currency": "Currency",
  "proj.budget": "Requested budget",
  "proj.duration": "Duration (months)",
  "proj.location": "Location",
  "proj.documents": "Documents",
  "proj.upload": "Upload document",
  "proj.reviews": "Review history",
  "proj.myProjects": "My projects",
  "proj.createNew": "Create new project",
  "proj.empty": "No projects yet.",
  "proj.submitConfirm": "Submit for review",
  "proj.runAnalysis": "Run AI analysis",
  // Review actions
  "review.approve": "Approve",
  "review.reject": "Reject",
  "review.requestChanges": "Request changes",
  "review.comment": "Comment",
  "review.addComment": "Add a comment…",
  "review.decision": "Decision",
  // AI
  "ai.title": "AI analysis",
  "ai.subtitle": "Advisory only — the human reviewer decides.",
  "ai.summary": "Summary",
  "ai.scorecard": "Evaluation scorecard",
  "ai.strengths": "Strengths",
  "ai.risks": "Risks",
  "ai.missing": "Missing information",
  "ai.questions": "Suggested questions",
  "ai.recommendation": "Preliminary recommendation",
  "ai.readiness": "Readiness",
  "ai.notRun": "AI analysis has not been run yet.",
  "ai.disabled": "AI is not configured. Set an Anthropic key to enable analysis.",
  "ai.ask": "Ask about this project",
  "ai.askPlaceholder": "Ask a question grounded in the application…",
  "ai.model": "Model",
  // Reviewer dashboard
  "rev.title": "Review desk",
  "rev.subtitle": "Portfolio analytics to prioritise and decide.",
  "rev.totalProjects": "Total projects",
  "rev.pending": "Pending review",
  "rev.decided": "Decided",
  "rev.approvalRate": "Approval rate",
  "rev.requestedBudget": "Requested budget",
  "rev.approvedBudget": "Approved budget",
  "rev.byStatus": "By status",
  "rev.byCategory": "By category",
  "rev.riskDist": "Risk distribution",
  "rev.aiScores": "AI readiness scores",
  "rev.avgScore": "Avg AI score",
  "rev.queue": "Review queue",
  "rev.queueEmpty": "The queue is empty.",
  "rev.aiScore": "AI score",
  "rev.highRisks": "high risks",
  // Admin
  "admin.title": "Administration",
  "admin.users": "Users",
  "admin.orgs": "Organizations",
  "admin.audit": "Audit log",
  "admin.auditHint": "Every request and decision — also journaled to object storage.",
  "admin.createReviewer": "Add reviewer",
  "admin.method": "Method",
  "admin.path": "Path",
  "admin.statusCode": "Status",
  "admin.latency": "Latency",
  "admin.actor": "Actor",
  "admin.action": "Action",
  "admin.when": "When",
  "admin.stored": "Stored in S3",
};

const AR: Dict = {
  "app.name": "أثر",
  "app.tagline": "منصة إدارة وتقييم مشاريع المنظمات غير الربحية",
  "nav.dashboard": "لوحة المعلومات",
  "nav.projects": "المشاريع",
  "nav.newProject": "مشروع جديد",
  "nav.reviewer": "مكتب المراجعة",
  "nav.admin": "الإدارة",
  "nav.logout": "تسجيل الخروج",
  "nav.login": "تسجيل الدخول",
  "common.loading": "جارٍ التحميل…",
  "common.save": "حفظ كمسودة",
  "common.submit": "إرسال",
  "common.cancel": "إلغاء",
  "common.back": "رجوع",
  "common.search": "بحث",
  "common.all": "الكل",
  "common.none": "—",
  "common.optional": "اختياري",
  "common.currency": "ريال",
  "common.beneficiaries": "مستفيد",
  "common.months": "شهر",
  "common.viewDetails": "عرض التفاصيل",
  "role.admin": "مشرف",
  "role.reviewer": "مراجع",
  "role.organization": "منظمة",
  "status.draft": "مسودة",
  "status.submitted": "تم الإرسال",
  "status.under_review": "قيد المراجعة",
  "status.changes_requested": "مطلوب تعديلات",
  "status.approved": "معتمد",
  "status.rejected": "مرفوض",
  "auth.signIn": "تسجيل الدخول",
  "auth.email": "البريد الإلكتروني",
  "auth.password": "كلمة المرور",
  "auth.registerOrg": "تسجيل منظمة جديدة",
  "auth.orgName": "اسم المنظمة",
  "auth.fullName": "الاسم الكامل",
  "auth.country": "الدولة",
  "auth.website": "الموقع الإلكتروني",
  "auth.haveAccount": "لديك حساب بالفعل؟",
  "auth.noAccount": "منظمة جديدة؟",
  "auth.demoAccounts": "حسابات تجريبية",
  "proj.title": "عنوان المشروع",
  "proj.summary": "الملخص",
  "proj.category": "التصنيف",
  "proj.problem": "المشكلة",
  "proj.goals": "الأهداف",
  "proj.kpis": "مؤشرات الأداء",
  "proj.targetBeneficiaries": "عدد المستفيدين المستهدف",
  "proj.beneficiaryDesc": "وصف المستفيدين",
  "proj.currency": "العملة",
  "proj.budget": "الميزانية المطلوبة",
  "proj.duration": "المدة (بالأشهر)",
  "proj.location": "الموقع",
  "proj.documents": "المستندات",
  "proj.upload": "رفع مستند",
  "proj.reviews": "سجل المراجعات",
  "proj.myProjects": "مشاريعي",
  "proj.createNew": "إنشاء مشروع جديد",
  "proj.empty": "لا توجد مشاريع بعد.",
  "proj.submitConfirm": "إرسال للمراجعة",
  "proj.runAnalysis": "تشغيل تحليل الذكاء الاصطناعي",
  "review.approve": "اعتماد",
  "review.reject": "رفض",
  "review.requestChanges": "طلب تعديلات",
  "review.comment": "ملاحظة",
  "review.addComment": "أضف ملاحظة…",
  "review.decision": "القرار",
  "ai.title": "تحليل الذكاء الاصطناعي",
  "ai.subtitle": "استشاري فقط — القرار النهائي للمراجع.",
  "ai.summary": "الملخص",
  "ai.scorecard": "بطاقة التقييم",
  "ai.strengths": "نقاط القوة",
  "ai.risks": "المخاطر",
  "ai.missing": "معلومات ناقصة",
  "ai.questions": "أسئلة مقترحة",
  "ai.recommendation": "التوصية الأولية",
  "ai.readiness": "الجاهزية",
  "ai.notRun": "لم يتم تشغيل التحليل بعد.",
  "ai.disabled": "الذكاء الاصطناعي غير مُفعّل. أضف مفتاح Anthropic لتفعيل التحليل.",
  "ai.ask": "اسأل عن هذا المشروع",
  "ai.askPlaceholder": "اطرح سؤالاً مبنياً على بيانات الطلب…",
  "ai.model": "النموذج",
  "rev.title": "مكتب المراجعة",
  "rev.subtitle": "تحليلات المحفظة لترتيب الأولويات واتخاذ القرار.",
  "rev.totalProjects": "إجمالي المشاريع",
  "rev.pending": "بانتظار المراجعة",
  "rev.decided": "تم البت فيها",
  "rev.approvalRate": "نسبة الاعتماد",
  "rev.requestedBudget": "الميزانية المطلوبة",
  "rev.approvedBudget": "الميزانية المعتمدة",
  "rev.byStatus": "حسب الحالة",
  "rev.byCategory": "حسب التصنيف",
  "rev.riskDist": "توزيع المخاطر",
  "rev.aiScores": "درجات جاهزية الذكاء الاصطناعي",
  "rev.avgScore": "متوسط درجة الذكاء الاصطناعي",
  "rev.queue": "قائمة المراجعة",
  "rev.queueEmpty": "القائمة فارغة.",
  "rev.aiScore": "درجة الذكاء الاصطناعي",
  "rev.highRisks": "مخاطر عالية",
  "admin.title": "الإدارة",
  "admin.users": "المستخدمون",
  "admin.orgs": "المنظمات",
  "admin.audit": "سجل التدقيق",
  "admin.auditHint": "كل طلب وكل قرار — ويُحفظ أيضاً في التخزين السحابي.",
  "admin.createReviewer": "إضافة مراجع",
  "admin.method": "الطريقة",
  "admin.path": "المسار",
  "admin.statusCode": "الحالة",
  "admin.latency": "الزمن",
  "admin.actor": "الفاعل",
  "admin.action": "الإجراء",
  "admin.when": "الوقت",
  "admin.stored": "محفوظ في S3",
};

const DICTS: Record<Lang, Dict> = { ar: AR, en: EN };

interface I18nState {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: string) => string;
  setLang: (l: Lang) => void;
}

const I18nContext = createContext<I18nState | null>(null);
const KEY = "athar_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem(KEY)) as Lang | null;
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string) => DICTS[lang][key] ?? EN[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, dir, t, setLang }), [lang, dir, t, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Localize a status enum value. */
export function statusLabel(t: (k: string) => string, status: string): string {
  return t(`status.${status}`);
}

/** Format a budget with the app currency label. */
export function fmtMoney(
  t: (k: string) => string,
  amount: number | null | undefined,
): string {
  if (amount == null) return t("common.none");
  return `${amount.toLocaleString()} ${t("common.currency")}`;
}
