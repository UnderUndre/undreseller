# Governance Tags — 001-reinit (batch, Constitution VII deviation)

**Девиация**: snapshot-скрипт появляется в ходе US2 самой спеки → теги создаются одним батчем на коммите пакета (plan §Constitution VII; Т022/Т051). Clarify — отдельного артефакта нет: решения Q1–Q5 зафиксированы в spec.md §6 (рев 1.0–1.3).

| Тег | Артефакт |
| :--- | :--- |
| `spec/001-reinit-from-payload-ecommerce-template/v1` | spec.md (рев 1.0–1.3: specify → audit R1/R2 → antigravity F1–F7 → fix-review §7) |
| `plan/001-reinit-from-payload-ecommerce-template/v1` | plan.md + research.md (D1–D7) |
| `tasks/001-reinit-from-payload-ecommerce-template/v1` | tasks.md (12 задач, все [X]) |
| `requirements-audit/001-reinit-from-payload-ecommerce-template/v1` | requirements-audit.md (PASS + re-audit addendum rev 1.2) |
| `test-design/001-reinit-from-payload-ecommerce-template/v1` | qa/ (22 TC, RTM 12/12, UAT, regression-suite) |
| `review/001-reinit-from-payload-ecommerce-template/v1` | reviews/ (analyze re-run #2, antigravity PASS, zcode self-review, code-zcode PASS, security-zcode MEDIUM + resolution rounds) |

**Не тегировано**: qa-signoff (staging pending) · bizplan (v2.5.0 живёт в undreplans, скрипта там нет).
**Гейт-журнал**: Constitution VI — имплемент по logged owner override (`reviews/_gate-override.md`, 1/2 external); 2-й external — ретро-пункт.
