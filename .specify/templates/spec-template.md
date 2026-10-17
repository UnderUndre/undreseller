# Feature Specification: [FEATURE NAME]

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom  
> "Обувать пизду в лапти." — Народная мудрость о художественном пиздеже вместо ТЗ  
> "Why don't you explain this to me like I'm five." — Майкл Скотт (_The Office_)  
> "Well, I didn't realize you had documentation." — Бабуленька (_Young Sheldon_)

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements _(mandatory)_

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

_Example of marking unclear requirements:_

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Non-Functional Requirements (NFR) _(ISO/IEC/IEEE 29148:2018)_

- **NFR-001 (Latency)**: 95th percentile response latency MUST be < [e.g., 100ms]; 99th percentile MUST be < [e.g., 250ms] under standard load.
- **NFR-002 (Throughput)**: System MUST sustain [e.g., 500 RPS] steady-state and [e.g., 1500 RPS] peak without error rate exceeding 0.1%.
- **NFR-003 (Availability & Recovery)**: Service availability target is [e.g., 99.9% uptime]; RTO target <= [e.g., 1 hour]; RPO target <= [e.g., 5 minutes].
- **NFR-004 (Capacity & Retention)**: System MUST support [e.g., 50,000 active daily users]; retention period is [e.g., 90 days audit history].

### Regulatory & Compliance Screening _(ISO/IEC/IEEE 12207 Phase 0)_

> **Trigger**: Mandatory if feature handles personal data (PII), payments/cardholder data, or operates in regulated jurisdictions. Otherwise: `Compliance: N/A (Internal/Non-regulated)`.

- **Jurisdictions**: [e.g., GDPR (EU), 152-ФЗ (RU), CCPA (US) or N/A]
- **Data Classification**: [e.g., Public / Internal / Confidential / PII / Cardholder Data (PCI DSS)]
- **Compliance Scope Reduction**: [e.g., Payment logic isolated to third-party tokenization gateway to exclude backend from CDE audit]
- **Kill Criteria (Falsifiability)**: [e.g., If prototype latency exceeds 500ms or CAC exceeds $15, feature scope is aborted/re-architected]

### Security & Threat Mitigation (STRIDE) _(conditional)_

> **Trigger**: Mandatory if feature adds/modifies network endpoints, auth/tokens, cryptography, or stores PII/sensitive data. For UI/Visual only: `STRIDE: N/A (Client UI/Styling only)`.

- **Spoofing**: [Identity verification, token forgery prevention]
- **Tampering**: [Payload integrity, signature validation, parameter tampering guards]
- **Repudiation**: [Audit logging requirements, non-repudiation records]
- **Information Disclosure**: [Data masking, encryption-at-rest/in-transit, PII protection]
- **Denial of Service**: [Rate-limiting, resource quotas, bounded payload limits]
- **Elevation of Privilege**: [RBAC/ABAC boundary enforcement, scope assertions]

### Key Entities _(include if feature involves data)_

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria _(mandatory)_

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]
