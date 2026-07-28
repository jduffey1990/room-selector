
# 🛏️ Democratic Bed Assignments

**Base cost: $480/person** (already paid)

Prices below are **DELTAS** (adjustments):
- Positive (+) = owe extra
- Negative (-) = get refund

## Final Assignments

| Person(s) | Bed | Bed Class | Delta | Total | Method |
|-----------|-----|-----------|-------|-------|--------|
| alykuiken@gmail.com + partner | bedroom4 | king-hall | +$90.70 | $570.70 | pref#1(utility) |
| gwhitman1985@gmail.com + partner | bedroom1 | master | +$192.07 | $672.07 | pref#1 |
| sonnyjeeson@gmail.com + partner | bedroom2 | king-ensuite | +$131.07 | $611.07 | pref#1 |
| mark.kolmer9@gmail.com + partner | bedroom5a | full-bunk | $-102.93 | $377.07 | pref#1 |
| klantz2210@gmail.com + partner | bedroom5b | full-bunk | $-102.93 | $377.07 | pref#1 |
| jluke11@gmail.com | floor2 | floor | $-161.93 | $318.07 | pref#1(utility) |
| jeffdseligman@gmail.com | floor1 | floor | $-161.93 | $318.07 | pref#1 |
| tngiraud@gmail.com | bedroom5c | twin-bunk | $-88.56 | $391.44 | pref#2 |
| ryen.birkinbine@gmail.com | bedroom5f | twin-bunk | $-88.56 | $391.44 | pref#3(utility) |
| steve.schank@gmail.com | bedroom5e | twin-bunk | $-88.56 | $391.44 | pref#4 |
| Jduffey1990@gmail.com + partner | bedroom3 | king-ensuite | +$131.07 | $611.07 | utility-greedy |
| allisonbrowndds@gmail.com | bedroom5d | twin-bunk | $-88.56 | $391.44 | utility-greedy |

## Price Summary by Bed Class

| Bed Class | People | Delta/Person | Total/Person | Price Calculation |
|-----------|--------|--------------|--------------|-------------------|
| master | 1 | +$192.07 | $672.07 | Base: $200, Weighted: $-10.00 |
| king-ensuite | 2 | +$131.07 | $611.07 | Base: $150, Weighted: $-21.00 |
| king-hall | 1 | +$90.70 | $570.70 | Base: $100, Weighted: $-11.36 |
| full-bunk | 2 | $-102.93 | $377.07 | Base: $-100, Weighted: $-5.00 |
| twin-bunk | 4 | $-88.56 | $391.44 | Base: $-100, Weighted: $9.38 |
| floor | 2 | $-161.93 | $318.07 | Base: $-200, Weighted: $36.00 |

## Mechanism Details

### Allocation Method
1. **Preference-first**: People get beds they ranked highly
2. **Utility resolution**: Conflicts resolved by preferences + bids + couple bonus
3. **Couple priority**: +50 utility bonus for 2-capacity beds

### Pricing Method
1. **Consensus-based**: Prices based on ALL bids (not just winners)
2. **Weighted**: 80% from unassigned people, 20% from assigned people
3. **Zero-sum**: Final adjustment ensures deltas sum to $0

### Weights Used
- Preference weight: 50
- Bid weight: 0.6
- Baseline weight: 1
- Couple bonus for 2-occupancy beds: 50

## Verification

✓ Sum of deltas: $-0.00
✓ All beds in same class have identical prices
✓ Preferences respected (conflicts resolved fairly)
✓ Couples stay together (never mixed with others)

## Assignment Details

- alykuiken@gmail.com + partner → bedroom4 [pref#1(utility)]
- gwhitman1985@gmail.com + partner → bedroom1 [pref#1]
- sonnyjeeson@gmail.com + partner → bedroom2 [pref#1]
- mark.kolmer9@gmail.com + partner → bedroom5a [pref#1]
- klantz2210@gmail.com + partner → bedroom5b [pref#1]
- jluke11@gmail.com → floor2 [pref#1(utility)]
- jeffdseligman@gmail.com → floor1 [pref#1]
- tngiraud@gmail.com → bedroom5c [pref#2]
- ryen.birkinbine@gmail.com → bedroom5f [pref#3(utility)]
- steve.schank@gmail.com → bedroom5e [pref#4]
- Jduffey1990@gmail.com + partner → bedroom3 [utility-greedy]
- allisonbrowndds@gmail.com → bedroom5d [utility-greedy]
