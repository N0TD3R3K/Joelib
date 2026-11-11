# Joe Wire events

## Purpose

The Joe Wire is JOESE's in-product fictional news identity. It lets members
understand the lore and market context behind a scheduled price update without
giving market operators the ability to overwrite prices.

A Joe Wire bulletin is an immutable, structured event. It is created in the
Operations Console, scheduled for publication, made visible to all members at
the same time, and consumed by the market engine at an eligible future tick.

## Event lifecycle

1. **Draft** — an authorized operator prepares an event. Drafts do not affect
   the market and are not visible to members.
2. **Scheduled** — the event has a publication time and a first eligible market
   tick. The system records its author and scheduling audit entry.
3. **Published** — the headline, lore article, category, direction, severity,
   duration, and affected assets become visible to every member.
4. **Applied** — the market engine consumes the event at an eligible scheduled
   tick and records its resulting contribution to the price explanation.
5. **Archived** — the event, publication history, applied ticks, and audit
   history remain available. Published or applied events are never silently
   changed or removed.

Correcting an already published event requires a separately attributed
correction bulletin linked to the original. The original remains readable in
the archive.

## Required event fields

Every event must include:

| Field | Requirement |
| --- | --- |
| Headline | Short, member-facing Joe Wire headline. |
| Article | Short lore article explaining the fictional event. |
| Category | One approved event category. |
| Affected assets | One or more active tickers from the listing configuration. |
| Direction | `bullish`, `bearish`, `mixed`, or `uncertain`. |
| Severity | `mild`, `moderate`, or `major`. |
| Duration | One tick, or a documented multi-tick decay. |
| Author and times | Author identity, creation time, publication time, and audit time. |
| Schedule | First eligible market tick and any expiration/applications. |

Approved categories are: launch, discovery, scandal, cultural event, research
result, infrastructure incident, and Joekemon event. A future category requires
a documented rule change rather than free-text invention in the console.

## Market-impact contract

An event contributes to the news term (`N_i`) in the price model defined by
[market-rules.md](market-rules.md). It must not store or submit a direct target
price, a hidden manual price movement, or an operator-chosen percentage override.

Members see the event's direction and severity, but the system does not disclose
the exact percentage effect before the relevant tick. After an official update,
the market explanation identifies the published events that were active and
their qualitative contribution alongside the other price-model inputs.

For a multi-tick event, the default decay is:

| Applied tick | Share of event effect |
| --- | --- |
| First | 60% |
| Second | 25% |
| Third | 15% |

An event must declare its duration before publication. Changing a duration after
publication requires a correction event and audit record; it cannot be an
invisible parameter change.

## Editorial and market constraints

- Use at most one major event per market day and zero to two smaller events.
- Events must be published to all members simultaneously, before or at the time
  they can affect an official price.
- An event may concern one or several listings; a `mixed` or `uncertain` event
  must explain its different possible relationships in the article.
- Operators cannot create private, member-specific, or retroactively effective
  market-moving bulletins.
- An event's affected tickers, status, time, author, and revisions are audit
  data—not merely editorial metadata.

## Operations separation

Only a market operator or administrator may create or schedule events. A user
with an active market-operations role is ineligible to trade. The console must
enforce this role separation server-side, not merely hide the exchange UI.

The console should provide a preview that clearly distinguishes member-visible
copy from internal audit details. It should validate that events use active
tickers, an eligible future tick, a permitted category, and a valid duration.

## Member archive

The member exchange includes a Joe Wire archive showing published bulletins and
their related official market updates. It must retain corrected and expired
events, explain when a bulletin was first applied, and preserve the historical
record even after an asset is retired.
