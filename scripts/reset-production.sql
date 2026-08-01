-- ============================================================
-- تفريغ القاعدة والبدء من نظيف
--
-- ⚠️ يمحو كل شيء: المستخدمين والاشتراكات والحصص والدفعات.
--    لا تشغّله إلا على قاعدة تحوي بيانات تجريبية أو تريد مسحها فعلًا.
--
-- الاستخدام: الصق المحتوى في محرّر SQL لدى مزوّد القاعدة
--            (Neon → SQL Editor) ثم نفّذه.
--
-- بعده: تأكد أن SEED_DEMO **غير مضبوط** في متغيرات البيئة، واضبط
--       ADMIN_PASSWORD، ثم أعد النشر. سيبني النظام نفسه من جديد:
--       حساب إدارة واحد + الفروع + الباقات + مكتبة الوجبات، بلا أي
--       بيانات تجريبية.
-- ============================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- إن رفض المزوّد الأمر أعلاه لأسباب صلاحيات، استخدم البديل التالي بدلًا منه:
--
-- DROP TABLE IF EXISTS
--   action_log, session_ratings, contracts, referrals, redemptions, points_log,
--   programs, leads, expenses, sub_events, frozen, targets, tasks, trainer_logs,
--   tokens, notifications, meal_plans, inbody, appointments, sessions, payments,
--   subscriptions, settings, rewards, meals, packages, users, branches,
--   schema_migrations
-- CASCADE;
