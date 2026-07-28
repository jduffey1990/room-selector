# v1 archive — frozen

Nothing in this directory is live code. It is the record of how the January
2026 trip was actually allocated, kept for two reasons: it documents what the
group's real result came from, and it is the A/B baseline the current
allocator is measured against.

**Do not modify these files.** If the baseline changes, the comparison in
`../allocate-envyfree.js` stops meaning anything.

| File | What it is |
| --- | --- |
| `allocate-beds.js` | v1 allocator: weighted score + greedy assignment, prices from bed-class averages |
| `submissions-export.csv` | Stale 17-person export — missing `alykuiken+copy`, which strands a person under v1's capacity filter. Superseded by `../submissions-full18.csv` |
| `seed-firebase.js` | One-off script that seeded the original single-trip Firestore data |
| `get-data.js` | Pulled submissions out of Firestore to CSV |
| `cleanup.js` | One-off data cleanup |

## Reproducing the A/B comparison

```bash
cd seed
node v1-archive/allocate-beds.js submissions-full18.csv   # v1 baseline
node allocate-envyfree.js submissions-export.json         # envy-free
```

Both write their output into `seed/`, which is gitignored.

Summary of the result on the 18 real submissions:

|  | v1 (greedy) | envy-free |
| --- | --- | --- |
| agents envying someone | 9 / 12 | 0 / 12 |
| worst envy | $66.00 | $0.00 |
| worst-off surplus | −$47.07 | +$11.11 |
| welfare (per person) | $550 | $800 |

v1 charged six of eighteen people more than they said their own bed was worth
to them, because prices came from bed-class averages rather than from bids.

These scripts require `serviceAccountKey.json` (gitignored) to talk to
Firestore. `allocate-beds.js` does not — it only reads a CSV.
