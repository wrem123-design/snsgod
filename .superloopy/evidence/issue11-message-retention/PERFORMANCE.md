# Message Retention Performance Evidence

- Dataset: 50,001 local messages.
- Operations: JSON restart round-trip normalization, append-write planning, and 24-message prompt context selection.
- Latest full-suite measurement: approximately 29.5 ms.
- Regression budget: 1,000 ms.
- SQLite write boundary: append only when the existing immutable prefix matches; replace one room for edits or deletions.
- UI boundary: React Native `FlatList` remains configured for 24 initial items, 16 per batch, and window size 10.

Result: **PASS**. Durable history growth is separated from prompt size and mounted viewport size.
