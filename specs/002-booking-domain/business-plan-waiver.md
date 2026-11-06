# Business Plan Waiver: 002-booking-domain

**Reason**: Реализация базового сервисного ядра (booking domain) в рамках утвержденного бизнес-плана `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0 §2.2.
- **ICP и позиционирование**: без изменений (сервисный бизнес 3–25 сотрудников, White-Label агентства).
- **Ценовая лестница и SKU**: без изменений (Sprint B $4,900 flat, Tailored $6,800, Enterprise-Lite $8,900, Care $349/мес).
- **Роли**: ровно 3 роли (OWNER, OPERATOR, PERFORMER) + customer.
- **Scope Knife**: временное ограничение скоупа 002 single-service записью (вместо мульти-сервисной корзины, отложенной до 003+) обосновано борьбой со сложностью contiguous-interval search (Clarification Q1) и не меняет ценность оффера Sprint B.
- **Интеграции**: Google Calendar — 005 (лимит «≤1» расходуется); Stars/NOWPayments — 006+ (платёжные адаптеры).

Дельта в бизнес-плане отсутствует. Полный аудит по Constitution VII-B.5 пройден.

**Date**: 2026-11-07 · **Spec**: specs/002-booking-domain/spec.md rev 1.2
