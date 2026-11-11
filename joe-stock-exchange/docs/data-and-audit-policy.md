# JOESE data and audit policy

## System of record

Cloudflare D1 is the durable system of record for member accounts, holdings,
orders, trades, transfers, loans, market ticks, news, comments, and audit events.
Browser storage may remember presentation preferences only; it must never be the
authoritative source for a balance, holding, role, or market price.

## Permanent financial-simulation records

Completed trades, ledger entries, market ticks, price points, accepted transfers,
accepted share offers, and Joe Bank liabilities are append-only records. A
correction is a new attributed record linked to the original; it is not a silent
edit or deletion.

Pending orders, transfers, and offers may change status according to published
rules. Their original amount, parties, and creation time remain auditable.

## Operations audit

The API records the operator, action, target, before state, after state, request
identifier, and time for company-copy changes, news events, comment moderation,
invitation creation, role changes, and other privileged operations. Audit API
responses exclude reusable secrets and password material.

## Sensitive data

Passwords use one-way password hashing. Session, verification, and invitation
tokens are stored only as hashes. Plaintext passwords, invitation phrases,
session tokens, API keys, and email-provider secrets must not enter source,
committed seed files, application logs, or audit JSON.

## Retention and backup

Before launch, the project owner must configure D1 backup/recovery procedures,
define retention for expired sessions and verification tokens, and name the
person responsible for restoration. Historical ledger, market, and audit data
must be retained for the life of the simulation unless a reviewed privacy or
security requirement demands a narrower policy.

