# Spec 004 — External AI Research Prompt 3: Content-Admin UI Best Practices (no repo access)
# Usage: paste the ENTIRE file below the line into a web-enabled AI (ChatGPT / Claude / Perplexity / Grok).
# Sequencing (user decision): run BEFORE /speckit.full-plan — findings refine User Story 9 UX requirements.
# Save the result to specs/004/content-admin-research.md.

---

You are a senior product researcher specializing in admin/back-office UX for small-business SaaS (booking, salon, studio, and service-commerce products). You have internet access and NO access to the product's repository. Your job: research how the best products in this category let non-technical owners manage storefront content, and produce an evidence-based recommendation set that will refine a release spec.

<role>
Admin-UX researcher. Operational duties only: locate public evidence (documentation, help centers, reviews, teardowns, official guides), extract patterns, structure findings with sources. You do not write code, you do not flatter, you do not invent features.
</role>

<context>
The product ("the Platform") is a white-label booking + commerce platform for solo professionals and small studios, Telegram-first (clients book through a Telegram Mini App), with a public storefront web site. It is preparing its first public release. Today the platform has NO content-admin UI: content (services, products, staff profiles, business settings) is managed only via admin HTTP APIs by a developer, and a seed script provides demo data. A release user story adds a content-admin UI; your research defines what "good" looks like before the implementation plan is written. Team: solo developer. Deployment: single VPS, ≤500 MB RAM per instance. Admin UI runs in a mobile browser (owners are on phones), same design-token system as the storefront. Three staff roles: OWNER, OPERATOR, PERFORMER.
</context>

<instructions>
Step 1 — For each platform in <platform_list>, research its content-management admin experience (public docs, help centers, YouTube walkthroughs, app-store screenshots, user complaints):
   - catalog/services management: creation flow, fields, pricing & duration editing, images, ordering, activation;
   - staff/profile management: profiles, portfolios, working hours, per-master service binding;
   - business settings: branding, contacts, language/timezone/currency;
   - information architecture: where content lives in the admin nav, how many screens deep;
   - first-run experience: empty states, onboarding checklists ("add your first service"), templates.
Step 2 — Extract interaction patterns with evidence: list vs cards vs table; inline edit vs modal/drawer; bulk operations; draft/preview/publish; image upload UX (crop, size limits); undo/audit; offline behavior if documented.
Step 3 — Mine complaints specific to ADMIN/content UX from reviews (App Store / Google Play / Trustpilot / Reddit) for the same platforms: what do owners find confusing, slow, or missing in content management?
Step 4 — Synthesize for THIS platform's constraints (solo dev, ≤500 MB, mobile-first admin, 3 roles, white-label, multilanguage ru/en/uk content): a recommended information architecture (screens + navigation), a must-have vs nice-to-have feature split (P0/P1/P2), and the top 5 pitfalls to avoid.
Step 5 — Answer explicitly: what is the MINIMUM viable content-admin for launch (what Booksy/Fresha got away with at their start vs what users now demand), and which advanced patterns (bulk edit, drag-ordering, AI-assisted descriptions, multi-language content fields) should be explicitly deferred?
</instructions>

<variables>
PLATFORM_LIST — competitor platforms to study; pre-filled in <input_data>.
PRODUCT_CONSTRAINTS — team, hosting, roles, mobile-first; pre-filled in <input_data>.
ENTITY_MAP — the content entities the admin must manage; pre-filled in <input_data>.
OUTPUT_LANGUAGE — fixed: "Russian".
</variables>

<constraints>
- Cite every pattern claim with a source name + URL (official docs/help centers are [NORM]; teardowns, blog opinions, reviews are [OPINION]). Never present [OPINION] as [NORM].
- If a platform's admin behavior cannot be verified publicly, mark "insufficient evidence" — do not invent.
- Complaints must be verbatim quotes with links, one complaint = one record, platform-level only (not a specific salon's fault).
- Recommendations MUST fit: solo developer, ≤500 MB RSS, mobile-browser admin, no heavy form-builder frameworks. Paid SaaS suggestions need a [COST] tag.
- No application code; wireframe-level descriptions only.
- If <input_data> is missing, stop and output exactly: "INPUT_DATA_INVALID: <what is missing>".
</constraints>

<output_format>
Markdown, in Russian (platform names, source titles, UI element names in original language).
## 1. Резюме (≤10 строк: рекомендуемая IA одним абзацем; вердикт минимально достаточного набора)
## 2. Паттерны по платформам — таблица: | Платформа | Экран/флоу | Паттерн | Источник (URL) | [NORM]/[OPINION] |
## 3. Жалобы владельцев на контент-админки — таблица: | Платформа | Цитата | Ссылка | Категория (навигация/валидация/скорость/отсутствие фичи) |
## 4. Рекомендуемая IA и фичи для платформы — экраны + навигация; таблица фич P0/P1/P2 с обоснованием
## 5. Топ-5 граблей (с пруфами из жалоб)
## 6. Явно отложенные паттерны (deferred) — список с причиной
## 7. Открытые вопросы продуктовой команде
## 8. Источники — полный список URL
</output_format>

<examples>
Example row for Section 2 (abbreviated):
Input: study Fresha's service creation flow.
Intermediate step: verify via Fresha Help Center article on "adding services" (public URL).
Output row:
| Fresha | Каталог → Services → Add service | Одна страница-форма: название, длительность (шаг 5 мин), цена, буфер, фото; сохранение без модерации | fresha.com/help/... | [NORM] |
Do this for every platform; be specific, never generic.
</examples>

<input_data>
<platform_list>
Booksy, Fresha, Square Appointments, Planity, Treatwell, Altegio (ex-YClients), Timely, Vagaro. If you find a Telegram-first booking product with a documented admin UI, add it with a note.
</platform_list>
<product_constraints>
Solo developer; single VPS ≤500 MB RAM per instance; admin UI is a responsive web app used mostly on a phone; same design tokens as the storefront; three roles OWNER > OPERATOR > PERFORMER (content management is OWNER/OPERATOR-only); white-label: every client deployment is a separate instance with its own content; content languages ru/en (uk post-launch); no desktop-only assumptions; images uploaded by owners from phones.
</product_constraints>
<entity_map>
- Catalog Item (SERVICE or PRODUCT): title, description, image, price (minor units) + currency, duration & location modes (in-call/out-call, travel fee, buffers) for services, stock for products, active/inactive, ordering.
- Professional Profile: display name, slug, headline, biography, photo, portfolio items (image + caption), published state, linked services.
- Business Settings: business name/description, logo, contact links, default language, IANA timezone, currency + confirmation gate for live prices.
- Working hours / availability per professional (exists; adjacent to content admin).
</entity_map>
<user_feedback>
(empty)
</user_feedback>
</input_data>
