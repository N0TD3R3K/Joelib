# Member wires and inbox settlement

## 1. Direction of payment

Joe Banking supports sender-initiated wires only. A member may choose a named
recipient and offer J$ from the member's available transaction balance.

The product intentionally has no endpoint or interface for:

- requesting payment from another member;
- creating an invoice or amount for another member to approve;
- pulling funds from another account;
- sending a reusable payment link; or
- automatically accepting a wire on a recipient's behalf.

Search and recipient selection must not expose a directory of all JoeAuth users.
The sender supplies an exact username or verified email; the server returns only
the minimum confirmation needed to avoid sending to the wrong person.

## 2. Wire lifecycle

```text
pending_receiver
  ├── accepted
  ├── declined
  ├── cancelled_by_sender
  └── expired (only if an expiry policy is later approved)
```

1. The sender enters a recipient, amount, and optional memo.
2. The server resolves one eligible recipient and rejects self-transfer.
3. The server atomically creates the wire and an equal hold against the sender's
   available balance.
4. The receiver sees it in the banking inbox.
5. **Receive** settles the held J$ from sender to receiver.
6. **Decline** releases the entire hold to the sender.
7. The sender may cancel only while the wire is still pending.

There is no pending credit in the receiver's displayed balance. The recipient
owns the J$ only after acceptance succeeds.

The first version should not expire pending wires until an expiry duration and
notification policy are explicitly approved. Adding expiry later is a versioned
product rule, not an unannounced cleanup job.

## 3. Validation

A wire requires:

- an active member sender and active member recipient;
- different sender and recipient identities;
- a positive whole-cent amount no greater than the sender's available balance;
- a server-issued or client-generated idempotency key unique to the sender;
- an optional plain-text memo with a conservative length limit; and
- a successful server-side authorization and abuse check.

Operators, administrators, suspended accounts, internal clearing accounts, and
service identities cannot send or receive member wires.

The first release has no wire fee. If fees are introduced, they must be shown
before confirmation and posted as separate ledger lines.

## 4. Concurrency and idempotency

Creating a wire and its hold is atomic. Accept, decline, cancel, and any future
expiry compete for one state-transition lock. Exactly one resolution can win.

Every write accepts an `Idempotency-Key`. Repeating the same key and request
returns the original result. Reusing the key with a different recipient, amount,
or memo returns a conflict.

The receiver acceptance transaction posts balanced ledger lines, consumes the
hold, and records the final state together. A database failure cannot produce a
debit without a credit or a credit without a debit.

## 5. Member experience

The transaction page contains:

- a **Send J$** form;
- a recipient confirmation step showing display name and partially masked
  verified email;
- available balance and amount validation;
- outgoing pending wires with a **Cancel** action;
- completed outgoing and incoming history; and
- a clear statement that payment requests are not supported.

The inbox entry in the top navigation shows incoming pending wires. Each item
displays sender, amount, memo, created time, and **Receive**/**Decline** actions.
Buttons disable after the first submission while the server resolves the state.

## 6. Privacy and abuse controls

- Use exact-match recipient resolution and rate-limit failed lookups.
- Return neutral errors that do not reveal whether an arbitrary email has a
  JoeAuth account.
- Never expose another member's balance, deposits, loans, email verification
  state, or JOESE holdings.
- Rate-limit wire creation and resolution by account and network signal.
- Notify both parties after acceptance, decline, cancellation, or an
  administrator correction.
- Make suspicious activity review read-only unless an authorized operator uses
  a separately audited freeze or correction operation.

## 7. Audit record

The permanent wire record includes the wire ID, sender and receiver banking
customer IDs, amount, memo, state, hold ID, creation and resolution timestamps,
resolving actor, request IDs, and ledger transaction IDs. It never stores a
password, session token, or reusable JoeAuth credential.

