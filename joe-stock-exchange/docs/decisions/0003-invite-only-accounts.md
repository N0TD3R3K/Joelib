# ADR 0003: School-email and invitation membership

- **Status:** Accepted, with invitation requirement configurable
- **Date:** 2026-11-11

## Decision

JOESE permits one active account per person and verifies eligibility through an
approved school email domain. The API enforces one account per normalized school
email and supports a server-configured requirement for an additional invitation
phrase.

Invitation plaintext is shown only when an administrator creates it and is
stored only as a hash. Account activation and the one-time J$10,000 starting
balance occur only after email verification.

## Consequences

Email uniqueness is an enforceable technical rule, while detecting one person
using multiple school addresses may require administrator review. Removing the
invitation requirement later changes a configuration value; it does not weaken
school-domain verification or create a second opening balance.

