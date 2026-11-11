# ADR 0001: JOESE is a closed fictional market

- **Status:** Accepted — amended 2026-11-11
- **Date:** 2026-11-10
- **Decision owners:** JOESE project team

## Context

JOESE is intended to let invited Joe Universe members participate in a shared
market game involving fictional listings, simulated prices, Joe Wire lore, and
portfolio decisions. Its names may evoke people, projects, technologies, or
market concepts that exist outside the simulation.

Without explicit boundaries, an exchange-like product can be misunderstood as a
real-money service, a security offering, a cryptocurrency product, or a tool
for transferring value between members. Those interpretations are incompatible
with the project's purpose and would undermine fair, low-stakes play.

## Decision

JOESE will operate as a **closed, invitation-only, fictional market
simulation**.

- The only accounting unit is the Joellar (J$), which exists solely within the
  JOESE application.
- J$ cannot be purchased, sold, deposited, withdrawn, cashed out, transferred
  between members, or exchanged for real-world money, goods, services, or value.
- Every asset is a fictional Joe Universe listing. It does not represent real
  ownership, a real investment, an affiliation, an endorsement, or a claim
  about any similarly named person, project, company, token, or organization.
- Version 1 excludes leverage, margin, short selling, derivatives, prizes based
  on J$ value, and every other mechanism that gives simulated balances external
  value. The limited Joe Bank bankruptcy loan is an internal simulated J$
  liability; it is neither real-world credit nor a value-redemption route.
- Membership is limited to one verified account per person using an approved
  school email domain. The product is not a public brokerage, trading venue,
  wallet, or payment service.

The member interface, documentation, transactional messages, and Operations
Console will make this boundary clear. Any future feature proposal must preserve
it or require a new, explicit architectural decision before implementation.

## Consequences

### Positive

- The product can focus on Joe Universe storytelling, market literacy, and
  collaborative simulation rather than real financial custody or settlement.
- Initial balances, trades, price changes, and listings can be designed for
  understandable and fair gameplay.
- Audit requirements become about simulation integrity: explaining official
  prices, retaining the ledger, and preventing operator advantage.

### Constraints

- JOESE must reject all real-money integrations, wallet features, deposits,
  withdrawals, and cash-outs. Internal J$ transactions settle only after the
  named receiver accepts them; a matched fictional-asset sale is also permitted.
- Product copy must avoid language or UI that implies investment advice,
  financial return, ownership, or real-world value.
- A fictional listing that resembles a real name requires a clear JOESE
  simulation notice and must not imply a relationship with that real entity.
- The system may still require ordinary account security, access controls, and
  auditable records because it manages members and their in-game balances.

## Compliance checks

Before a release, confirm that:

1. no payment processor, real-money wallet, or value-redemption flow is present;
2. no endpoint supports real-money deposits, withdrawals, or cash-out; internal
   transfers require receiver acceptance, and Joe Bank loans remain internal J$
   bankruptcy loans with an auditable rate and liability;
3. all member-facing surfaces label JOESE as a fictional simulation;
4. the asset catalog uses the listing disclaimer; and
5. trade and ledger tests enforce the Version 1 feature exclusions.
