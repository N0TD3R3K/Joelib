# Member and console experience

## 1. Visual direction

The banking site is primarily white, calm, and information-dense without
looking like the dark JOESE trading interface. Suggested visual tokens:

- white page and card surfaces;
- very light neutral dividers and sidebar background;
- dark charcoal text;
- one restrained Joe gold accent for primary actions and rate emphasis;
- blue or teal for informational/positive banking states;
- red only for errors, overdue states, destructive actions, and liabilities;
- tabular numerals for money and rates; and
- generous whitespace with clear ledger-style alignment.

Color never carries state alone. Every amount is labeled as available, held,
deposited, invested, or owed.

## 2. Application shell

### Top navigation

- Left: **Back to Universe**. It is visible but intentionally has no destination
  until the universe page is constructed. Use an inert button or disabled link,
  not `href="#"`.
- Right: **Inbox**, followed by account details/avatar.
- Account details show the member's display name and verified email. These come
  from JoeAuth later; the interim adapter reads the linked JOESE identity.

### Left sidebar

The navigation order is fixed:

1. **Account Balance**
2. **Transaction**
3. **Interest Rate**
4. **Deposits**
5. **Loans**

On narrow screens the sidebar becomes a labeled drawer while preserving the
same order.

## 3. Account Balance page

The home page opens on Account Balance and displays:

- member name and verified email;
- available J$ transaction balance;
- held J$ with a breakdown by pending wire and JOESE order;
- flexible-deposit balance;
- total fixed-term deposit principal and next maturity;
- outstanding loan liability and next due item when defined;
- read-only JOESE portfolio value and a link placeholder for the stock product;
  and
- recent banking activity.

The main available-balance card must not combine JOESE asset value or unused
loan capacity with spendable J$.

## 4. Transaction page and inbox

The Transaction page follows the wire flow in `transfers.md`: recipient,
amount, optional memo, recipient confirmation, and final send confirmation.
It also includes pending outgoing wires and searchable history.

There is no **Request**, **Charge**, **Invoice**, or similar action anywhere in
the member interface.

The top-nav Inbox opens a panel or page with incoming wires requiring Receive or
Decline. It may later include loan offers, maturity notices, and security
notices, but those item types remain visually distinct.

## 5. Interest Rate page

The rate page shows:

- current Joe Rate in large weekly-rate typography;
- policy range of 0.300%–2.000% per week;
- latest change and member-facing reason;
- related published news when present;
- historical chart and change table;
- how the rate affects flexible deposits and variable loans; and
- a fixed-contract notice.

Never display an annualized number as the primary rate. If an educational
comparison is ever added, it must be clearly secondary and explain the
assumptions.

## 6. Deposits page

The first section manages flexible savings with Deposit and Withdraw actions.
The second section presents the 2-, 4-, and 8-week fixed cards. Each card shows
weekly rate, maturity, projected J$, and locked-funds disclosure before the
member confirms.

Active term deposits show principal, fixed rate, start, maturity countdown,
posted interest, estimated accrued interest, and status. Matured products remain
available in history.

## 7. Loans page

The page has one context-sensitive primary state:

- application form when eligible;
- under-review status;
- exact offer with Accept/Decline;
- active-loan balance, rate kind, rate history, due information, and Repay; or
- completed history.

Fixed and variable loans use unmistakable labels. A variable loan explains that
future Joe Rate adjustments affect future interest. A fixed loan shows its
contract rate and says it will not change.

## 8. Banking Operations Console

The console is a separate protected application with a light operational theme.
Suggested navigation:

1. Overview
2. Rate Policy
3. Loan Review
4. Deposits
5. Wires
6. Reconciliation
7. Audit

### Rate Policy

The rate panel shows the current rate, remaining adjustments this week, allowed
next-rate range, change history, and a form requiring both public and internal
reasons. The server returns the authoritative rule result; disabling a browser
button is not enforcement.

### Loan Review

Operators review applications and prepare offers. A second confirmation shows
all contract terms. Fixed contracts cannot be edited after acceptance.

### Wires and deposits

These screens support investigation and freeze/correction workflows, not
ordinary operator-created member transactions. There is no manual “set balance”
field.

### Reconciliation and audit

The console displays job status, ledger balance, JOESE clearing differences,
stale holds, failed outbox events, and append-only operator activity.

## 9. Accessibility and responsive behavior

- Every form control has a visible label and useful error association.
- Keyboard focus is obvious on a white background.
- Money and rate changes include text and icons, not color alone.
- Confirmation dialogs identify recipient/product, amount, rate, and result.
- Tables become stacked labeled records on small screens rather than requiring
  horizontal guessing.
- Reduced-motion preferences disable decorative balance and chart animation.

