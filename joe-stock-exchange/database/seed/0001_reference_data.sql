-- Suspended non-human issuance account. It cannot sign in or place member
-- orders; its pre-reserved inventory is the initial public float.
INSERT OR IGNORE INTO users (
  id, email, username, password_hash, password_salt, role, status
) VALUES (
  'usr-joese-issuer', 'issuer@joese.internal', 'joese.issuer', 'disabled', 'disabled', 'operator', 'suspended'
);

INSERT OR IGNORE INTO assets (
  id, ticker, name, asset_type, description, company_details_json,
  current_price_cents, open_price_cents, high_price_cents, low_price_cents,
  close_price_cents, previous_close_cents, ordinary_drift, volatility,
  hourly_cap, daily_cap
) VALUES
('asset-joe', 'JOE', 'Joe Himself', 'stock', 'The central figure and broad cultural anchor of the Joe Universe.', '{"overview":"Joe himself remains the market''s most recognized fictional institution.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Culture","Community"]}', 8425, 8220, 8490, 8180, 8220, 8220, 0.0010, 0.020, 0.12, 0.35),
('asset-jai', 'JAI', 'Chat JoePT', 'stock', 'Generative intelligence and assistant research for the Joe Universe.', '{"overview":"Chat JoePT develops fictional intelligence tools, research systems, and conversational products.","developer":"Joe Team","headquarters":"Joe Universe","focus":["AI","Research","Assistants"]}', 4872, 4632, 4925, 4594, 4632, 4632, 0.0015, 0.028, 0.12, 0.35),
('asset-jlg', 'JLG', 'Joeglish Literature Group', 'stock', 'Joeglish literature, grammar, and translation research.', '{"overview":"JLG coordinates language research and translation of major works into Joeglish.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Literature","Language","Translation"]}', 3268, 3308, 3340, 3240, 3308, 3308, 0.0005, 0.018, 0.12, 0.35),
('asset-jct', 'JCT', 'Joe Computer Tech', 'stock', 'JoeLang and the computing systems of the Joe Universe.', '{"overview":"JCT maintains JoeLang, developer tools, and experimental Joe computing projects.","developer":"Derek Li","headquarters":"Joe Universe","focus":["JoeLang","Developer Tools","Computing"]}', 6190, 5966, 6250, 5910, 5966, 5966, 0.0012, 0.024, 0.12, 0.35),
('asset-jei', 'JEI', 'Joelement Industries', 'stock', 'Chemistry research centered on Joelements.', '{"overview":"JEI studies the Joeriodic Table and fictional materials research around Joelements.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Chemistry","Joelements","Research"]}', 2754, 2730, 2780, 2708, 2730, 2730, 0.0006, 0.017, 0.12, 0.35),
('asset-jkr', 'JKR', 'Joekemon Research', 'stock', 'Research and development concerning Joekemons.', '{"overview":"JKR catalogs Joekemons and supports fictional field, habitat, and development studies.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Joekemons","Field Research","Development"]}', 2196, 2249, 2270, 2170, 2249, 2249, 0.0008, 0.025, 0.12, 0.35),
('asset-juv', 'JUV', 'Joe Universe', 'stock', 'The stability, reach, and development of the Joe Universe.', '{"overview":"JUV is a broad fictional listing linked to the health and popularity of the entire Joe Universe.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Culture","Stability","Growth"]}', 10942, 10736, 11020, 10680, 10736, 10736, 0.0010, 0.016, 0.12, 0.35),
('asset-jtcn', 'JTCN', 'JoetCoin', 'crypto', 'The main fictional crypto-asset of the Joe Universe.', '{"overview":"JoetCoin is a high-volatility simulation asset and is never redeemable outside JOESE.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Culture","Community"]}', 1289, 1200, 1320, 1180, 1200, 1200, 0.0018, 0.060, 0.25, 0.60),
('asset-link', 'LINK', 'MrLink', 'crypto', 'A Joebotics-coach-inspired fictional crypto-asset.', '{"overview":"LINK responds to Joebotics progress in the fictional JOESE market only.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Joebotics","Coaching"]}', 935, 965, 980, 910, 965, 965, 0.0010, 0.055, 0.25, 0.60),
('asset-ntdk', 'NTDK', 'NotDerek', 'crypto', 'A developer-inspired fictional crypto-asset.', '{"overview":"NTDK reflects fictional development activity around Joelib, JoeLang, and JOESE.","developer":"Derek Li","headquarters":"Joe Universe","focus":["Development","Joelib"]}', 1744, 1672, 1780, 1640, 1672, 1672, 0.0015, 0.065, 0.25, 0.60),
('asset-jobo', 'JOBO', 'Joebotics Team', 'crypto', 'The fictional market outlook of the Joebotics team.', '{"overview":"JOBO reacts to fictional robotics progress, competitions, and team milestones.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Robotics","Competition"]}', 1120, 1028, 1150, 1000, 1028, 1028, 0.0017, 0.070, 0.25, 0.60),
('asset-corn', 'CORN', 'CornCoin', 'crypto', 'A meme-inspired crypto-asset from the Joe and robotics teams.', '{"overview":"CornCoin is intentionally playful and among JOESE''s most volatile assets.","developer":"Joe Team","headquarters":"Joe Universe","focus":["Memes","Community"]}', 408, 435, 448, 392, 435, 435, 0.0008, 0.085, 0.25, 0.60);

INSERT OR IGNORE INTO holdings (
  id, user_id, asset_id, holding_kind, quantity, reserved_quantity, average_cost_cents
) VALUES
('issuance-holding-joe', 'usr-joese-issuer', 'asset-joe', 'stock', 10000, 10000, 8425),
('issuance-holding-jai', 'usr-joese-issuer', 'asset-jai', 'stock', 10000, 10000, 4872),
('issuance-holding-jlg', 'usr-joese-issuer', 'asset-jlg', 'stock', 10000, 10000, 3268),
('issuance-holding-jct', 'usr-joese-issuer', 'asset-jct', 'stock', 10000, 10000, 6190),
('issuance-holding-jei', 'usr-joese-issuer', 'asset-jei', 'stock', 10000, 10000, 2754),
('issuance-holding-jkr', 'usr-joese-issuer', 'asset-jkr', 'stock', 10000, 10000, 2196),
('issuance-holding-juv', 'usr-joese-issuer', 'asset-juv', 'stock', 10000, 10000, 10942),
('issuance-holding-jtcn', 'usr-joese-issuer', 'asset-jtcn', 'crypto', 1000000, 1000000, 1289),
('issuance-holding-link', 'usr-joese-issuer', 'asset-link', 'crypto', 1000000, 1000000, 935),
('issuance-holding-ntdk', 'usr-joese-issuer', 'asset-ntdk', 'crypto', 1000000, 1000000, 1744),
('issuance-holding-jobo', 'usr-joese-issuer', 'asset-jobo', 'crypto', 1000000, 1000000, 1120),
('issuance-holding-corn', 'usr-joese-issuer', 'asset-corn', 'crypto', 1000000, 1000000, 408);

INSERT OR IGNORE INTO orders (
  id, user_id, asset_id, side, quantity, remaining_quantity, limit_price_cents, status
) VALUES
('issuance-order-joe', 'usr-joese-issuer', 'asset-joe', 'sell', 10000, 10000, 8446, 'open'),
('issuance-order-jai', 'usr-joese-issuer', 'asset-jai', 'sell', 10000, 10000, 4884, 'open'),
('issuance-order-jlg', 'usr-joese-issuer', 'asset-jlg', 'sell', 10000, 10000, 3276, 'open'),
('issuance-order-jct', 'usr-joese-issuer', 'asset-jct', 'sell', 10000, 10000, 6205, 'open'),
('issuance-order-jei', 'usr-joese-issuer', 'asset-jei', 'sell', 10000, 10000, 2761, 'open'),
('issuance-order-jkr', 'usr-joese-issuer', 'asset-jkr', 'sell', 10000, 10000, 2201, 'open'),
('issuance-order-juv', 'usr-joese-issuer', 'asset-juv', 'sell', 10000, 10000, 10969, 'open'),
('issuance-order-jtcn', 'usr-joese-issuer', 'asset-jtcn', 'sell', 1000000, 1000000, 1292, 'open'),
('issuance-order-link', 'usr-joese-issuer', 'asset-link', 'sell', 1000000, 1000000, 937, 'open'),
('issuance-order-ntdk', 'usr-joese-issuer', 'asset-ntdk', 'sell', 1000000, 1000000, 1748, 'open'),
('issuance-order-jobo', 'usr-joese-issuer', 'asset-jobo', 'sell', 1000000, 1000000, 1123, 'open'),
('issuance-order-corn', 'usr-joese-issuer', 'asset-corn', 'sell', 1000000, 1000000, 409, 'open');

INSERT OR IGNORE INTO news_events (
  id, headline, article, category, direction, severity, affected_tickers_json,
  duration_ticks, status, publish_at, published_at
) VALUES
('news-welcome', 'JOESE market systems enter launch preparation', 'The Joe Wire reports that the fictional exchange, market engine, and audit systems have entered coordinated launch preparation.', 'launch', 'bullish', 'moderate', '["JUV","JCT"]', 2, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('news-jai-research', 'Chat JoePT research desk publishes a new reasoning model', 'A major fictional research release increases attention on Chat JoePT and adjacent Joe technology listings.', 'research result', 'bullish', 'major', '["JAI","JCT"]', 3, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

