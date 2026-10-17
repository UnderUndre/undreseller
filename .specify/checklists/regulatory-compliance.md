# Specification Quality Checklist: Regulatory Compliance & Software Supply Chain

> "Пока не доказано, не ебёт что сказано." — Народная мудрость  
> "Без бумажки ты какашка." — Народная мудрость  
> "Identity theft is not a joke, Jim! Millions of families suffer every year!" — Дуайт Шрут (_The Office_)  
> "It's not that I don't trust you, it's that I don't trust anybody." — Гилфойл (_Silicon Valley_)

**Purpose**: Validate that legal jurisdictions, regulatory constraints, security compliance boundaries, and software supply chain integrity are verified early in the lifecycle (ISO/IEC/IEEE 12207 Phase 0, NIST SP 800-218 SSDF, PCI DSS v4.0.1, ISO/IEC 27001:2022).  
**When to use**: Any feature handling user personal data, payment processing, regulated records (health, financial), external third-party libraries, or deployment across multiple legal jurisdictions.  
**When to skip**: Pure internal dev tooling or localized developer utilities with zero customer data and zero external licensing impact.

## Validation Items

### Legal & Regulatory Jurisdictions (Phase 0)

- [ ] CHK001 - Are the applicable regulatory jurisdictions identified (e.g., GDPR, 152-ФЗ, CCPA/CPRA, HIPAA)? [Coverage]
- [ ] CHK002 - Are data residency and cross-border transfer constraints explicitly bounded? [Clarity]
- [ ] CHK003 - Are user consent, data portability, and "Right to be Forgotten" (data deletion) workflows specified? [Completeness]

### Payment & Financial Compliance (PCI DSS v4.0.1)

- [ ] CHK004 - Is payment cardholder data handling identified (card numbers, CVV, expiration dates)? [Coverage]
- [ ] CHK005 - Is Cardholder Data Environment (CDE) scope reduction architecturally enforced (dedicated network/service isolation, tokenization)? [Clarity]
- [ ] CHK006 - Are requirements explicit that the application MUST NOT store sensitive authentication data (SAD) post-authorization? [Completeness]
- [ ] CHK007 - Is external payment gateway tokenization used to prevent raw cardholder data from touching application servers? [Edge Case]

### Secure Development & Coding Governance (ISO/IEC 27001:2022)

- [ ] CHK008 - Are Secure Development Lifecycle requirements specified per Control 8.25? [Traceability]
- [ ] CHK009 - Are Secure Coding Guidelines mandated per Control 8.28 (input validation, parametrized queries, cryptography)? [Completeness]
- [ ] CHK010 - Is mandatory peer code review required before merging code into release branches? [Consistency]

### Software Supply Chain Assurance (NIST SP 800-218 SSDF)

- [ ] CHK011 - Is automated generation of a machine-readable Software Bill of Materials (SBOM in SPDX or CycloneDX) required in CI/CD? [Coverage]
- [ ] CHK012 - Are Software Composition Analysis (SCA) dependency scans configured to block builds on Critical/High CVEs? [Measurability]
- [ ] CHK013 - Are package lockfiles committed and enforced in CI (`npm ci`, `poetry lock --check`) to prevent dependency tampering? [Completeness]
- [ ] CHK014 - Is cryptographic provenance or artifact signing (Sigstore, container image signing) specified for release builds? [Gap]

### Open Source Licensing & IP Hygiene

- [ ] CHK015 - Is automated license scanning enforced to prevent viral copyleft contamination (AGPL-3.0, GPL in proprietary code)? [Coverage]
- [ ] CHK016 - Is an approved license allowlist specified for third-party dependencies (MIT, Apache-2.0, BSD, ISC)? [Clarity]
- [ ] CHK017 - Are attribution and third-party notices generated automatically for client-facing bundles? [Completeness]
