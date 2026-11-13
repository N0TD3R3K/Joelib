# Joe Banking

Joe Banking is the fictional banking layer of the Joe Universe. It manages a
member's liquid Joellars (J$), person-to-person wires, savings deposits, term
deposits, and loans. It will eventually use JoeAuth as its identity provider
and will provide the authoritative liquid J$ balance used by JOE Stock
Exchange (JOESE).

Joe Banking is a closed simulation. J$ has no real-world value and cannot be
deposited from, withdrawn to, exchanged for, or redeemed as real currency,
goods, services, prizes, or cryptocurrency.

## Status

This folder contains product and engineering design documents only. It does not
yet contain an application, database, deployment configuration, or production
migration.

## Confirmed product rules

- A member may send a wire to another member. There is intentionally no payment
  request, invoice, pull-payment, or debit-request feature.
- An outgoing wire is reserved until the named receiver chooses **Receive** or
  **Decline**, following the existing JOESE inbox model.
- The variable Joe Rate is quoted as a weekly rate and must remain between
  **0.300% and 2.000% per week**.
- An authorized banking operator may adjust the variable rate no more than
  twice in one New York calendar week.
- One adjustment must move the rate by at least **0.005 percentage points** and
  no more than **0.200 percentage points**.
- Fixed-term deposits are unaffected by later variable-rate changes:

| Term | Fixed weekly rate |
| --- | ---: |
| 2 weeks | 1.000% |
| 4 weeks | 1.500% |
| 8 weeks | 2.250% |

- Fixed-rate loan contracts are also unaffected by later variable-rate
  changes. Their product terms and offered rates still require a separate
  decision.
- Rate changes may be explained by published news or ordinary fluctuations,
  but every change is visible, attributed, bounded, and audited.

## Core architecture decision

There must be one authoritative liquid J$ balance per member. Joe Banking owns
that balance. JOESE continues to own stock, crypto, shareholding, order, trade,
and market data, but reserves and settles liquid J$ through the banking ledger.
This prevents a member from spending the same J$ once in the bank and again in
the stock market.

Until JoeAuth exists, a temporary identity-link table maps an existing JOESE
member ID to one banking customer. JoeAuth will later replace that temporary
identity source without changing historical banking or JOESE financial record
IDs.

## Document map

- [Product and architecture](docs/product-and-architecture.md)
- [Accounts, ledger, and JOESE integration](docs/accounts-ledger-and-joese.md)
- [Member wires and inbox settlement](docs/transfers.md)
- [Interest policy and news](docs/interest-policy-and-news.md)
- [Deposits and loans](docs/deposits-and-loans.md)
- [Member and console experience](docs/member-and-console-ux.md)
- [Data model and API](docs/data-model-and-api.md)
- [Security, migration, and delivery plan](docs/security-migration-and-delivery.md)

## Decisions still required before implementation

1. The initial variable Joe Rate. A proposed starting value is 1.000% per week.
2. Fixed-loan products: permitted terms, rates, borrowing limits, weekly minimum
   payments, grace periods, and eligibility.
3. Whether a loan's disbursed J$ may be used for JOESE purchases. Preserving the
   current connected-account behavior would allow it; prohibiting it requires a
   separate restricted sub-balance.
4. Whether a fixed-term deposit can be broken early. The proposed first version
   keeps it locked until maturity and permits only an audited exceptional
   correction.
5. The final `joe-univer.se` hostnames and JoeAuth protocol details.
6. Banking operator and administrator assignments, backup ownership, and the
   beta migration date.

