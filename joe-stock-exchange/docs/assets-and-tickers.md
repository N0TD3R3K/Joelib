# JOESE assets and tickers

## Listing policy

Every JOESE listing is a fictional Joe Universe instrument used only in the
JOESE simulation. It is not a real security, cryptocurrency, investment offer,
ownership claim, affiliation, endorsement, or valuation of any real person,
organization, or project that shares a name or inspiration.

The asset list below is the initial universe specified in the JOESE handoff.
Members receive J$; J$ is the exchange's unit of account and is **not** itself
a listed or tradable asset.

Stocks trade in whole shares. Crypto-assets trade to two decimal places. All
listed assets use the market schedule, quote rules, price caps, and audit rules
in [market-rules.md](market-rules.md).

## Fictional equities

| Ticker | Listing | Fictional Joe Universe role |
| --- | --- | --- |
| `JOE` | Joe Himself | The central figure, Joe himself. |
| `JAI` | Chat JoePT | The Joe Universe generative-AI industry, centered on Chat JoePT. |
| `JLG` | Joeglish Literature Group | Joeglish literature and grammar research, including translation work. |
| `JCT` | Joe Computer Tech | Joe technology, including JoeLang as its coding-language project. |
| `JEI` | Joelement Industries | The Joe Universe's chemistry and Joelements industry. |
| `JKR` | Joekemon Research | Research and development concerning Joekemons. |
| `JUV` | Joe Universe | The stability, popularity, updates, and ideas of the Joe Universe itself. |

## Fictional crypto-assets

| Ticker | Listing | Fictional Joe Universe role |
| --- | --- | --- |
| `JTCN` | JoetCoin | The main fictional crypto-asset of the Joe Universe. |
| `LINK` | MrLink | A listing inspired by the Joebotics coach; its fictional outlook may respond to Joebotics accomplishments. |
| `NTDK` | NotDerek | A listing inspired by the developer/creator associated with Joelib, JoeLang, and JOESE. |
| `JOBO` | Joebotics Team | The fictional market representation of Hamden Hall's Joebotics team, sensitive to fictional progress and competitions. |
| `CORN` | CornCoin | A meme-inspired crypto-asset popular in the Joe and robotics teams. |

`LINK` is a JOESE-local fictional ticker. It must always appear alongside the
JOESE simulation notice and must not suggest a relationship with any similarly
named real-world token, service, or organization.

## Asset metadata required before launch

Each listing must have a versioned configuration record with, at minimum:

- ticker, display name, asset type, fractional-quantity rule, and active status;
- initial reference price and pricing precision;
- normal drift and volatility profile used for `B_i`;
- hard hourly and daily limits appropriate to its type;
- demand-normalization configuration and any asset-specific cap;
- permitted Joe Wire categories and related lore notes; and
- activation date, retirement/suspension status, and change history.

Initial prices and engine profiles are intentionally not chosen in this document.
They must be reviewed as a coherent starting market before member accounts are
funded or trading opens.

## Listing governance

Adding, retiring, renaming, splitting, or otherwise materially changing a
listing requires an attributed Operations Console action, an audit record, a
member-facing notice, and a versioned asset configuration. A delisted asset's
historical trades, prices, Joe Wire references, and ledger entries remain
available for audit.

No listing change may create an undisclosed balance change or an unpublished
price change. If a future simulation event needs to adjust positions or asset
quantities, it needs a separately documented corporate-action rule and explicit
member communication before it is implemented.
