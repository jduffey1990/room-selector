# Architecture

## The problem this solves

Splitting beds in a rented house is a fight because two fair-sounding rules
disagree.

**Pure preference** ignores intensity. If four people rank the master first, the
tiebreak is arbitrary, and the person who'd have paid $200 for it gets nothing
for wanting it more.

**Pure auction** solves that and creates a worse problem: the loser gets
*nothing*. You wanted the master, someone bid higher, you're in a bunk. The
money went to "the group" in the abstract; your experience is pure loss. That's
how "he just bought the good room" starts.

The original design tried to split the difference with a weighted score —
some ranking, some price signal, some baseline quality. That's a reasonable
instinct, but it means hand-tuning constants nobody can defend, and it
guarantees neither property.

**The dilemma is false.** Envy-free rent division gets both at once.

## Envy-freeness

An allocation is *envy-free* when no one prefers anyone else's (bed, price) pair
to their own, judged by their own submitted numbers.

Dave can still pay a premium for the master. But the premium is set high enough
that **you no longer want the master at that price**. You weren't overruled —
you were offered it and declined. That's the difference between an auction and
this, and it's structural, not rhetorical.

The theory is unusually kind here:

- An envy-free solution **always exists** for this setting, with no conditions
  on preferences (Svensson 1983; Alkan–Demange–Gale 1991).
- **Every** envy-free assignment is automatically welfare-maximising. Fairness
  doesn't cost efficiency — the fairness constraint *forces* the efficient
  assignment.
- Prices aren't unique, so we select the **maximin** one: maximise the worst-off
  person's surplus (Gal, Mash, Procaccia & Zick, EC 2017 — the same rule behind
  Spliddit's rent-division tool).

### How it runs

1. **Assignment** — exact maximum-weight perfect matching (bitmask DP over
   agents × beds). Order-independent: who filled the form first is irrelevant.
2. **Prices** — envy-freeness is a system of difference constraints
   (`p[j] - p[i] ≥ v[i][j] - v[i][i]`), feasible exactly when there's no
   positive cycle. Solved with max-plus longest paths.
3. **Selection** — binary search on the maximin surplus, then a uniform shift so
   per-person adjustments sum to zero.

Couples are modelled as **one unit-demand agent taking one bed**. This matters:
letting a couple take a *bundle* (two singles) reintroduces complementarities,
and under those, envy-free prices can fail to exist entirely (Gul–Stacchetti).
The old special-casing for couples was the cost of leaving the tractable model.

### What it changed

Against the 18 real submissions from January 2026:

| | v1 (weighted score + greedy) | envy-free |
| --- | --- | --- |
| agents envying someone | **9 / 12** | **0 / 12** |
| worst envy | $66.00 | $0.00 |
| worst-off surplus | **−$47.07** | **+$11.11** |
| welfare (per person) | $550 | $800 |

The negative surplus is the headline failure: v1 charged **six of eighteen
people more than they said their own bed was worth to them**, because prices
came from bed-class averages rather than from anyone's actual bid. One person
bid −$150 for a full bunk and was charged −$102.93.

v1 was also order-dependent — greedy allocation broke preference ties by
submission order, so filling the form early was worth real money.

Verified by independent local search (4,000 restarts, 2-swaps and 3-cycles)
reproducing the DP optimum exactly. The allocator self-checks envy and budget on
every run.

### Known limits

**Envy-freeness doesn't erase wealth.** It's defined over *reported dollar
valuations*. Someone who earns more can afford a bigger spread, and the outcome
still correlates with income. The sum-to-zero rule helps — it fixes the mean of
each person's bids — but the spread stays free, and spread is where wealth
leaks in. The stronger fix is equal bidding budgets (everyone gets 100 points to
distribute; convert to dollars at the end), which removes wealth from the
*allocation* entirely. Not implemented.

**Not strategyproof.** Rent division is manipulable in principle. In a group of
friends who don't see each other's bids and repeat this annually, social
enforcement is stronger than any incentive constraint a strategyproof mechanism
would buy — and those mechanisms give much worse allocations.

**Price spread widens.** $354 → $425 on the January data. Envy-freeness buys
peace by making premiums large enough to decline, which necessarily spreads
prices. If a group finds that spread socially unacceptable, that's an argument
for equal budgets, not for the old algorithm.

## Data model

```
trips/{id}                   PUBLIC   name, baseCostPerPerson, status
trips/{id}/secret/codes      private  adminCode, participantCode
codes/{code}                 private  reverse lookup → tripId
rooms/{id}                   PUBLIC   name, description, basePrice, capacity, type
submissions/{id}             private  email, preferences, roomPrices
assignments/{id}             private  emails, roomNames, prices
```

The split of `trips` is forced by a Firestore constraint: **rules cannot filter
fields on a read.** A document is readable or it isn't. The trip doc has to be
publicly readable so the join page can render before anyone enters a code — so
the codes cannot live in it.

## Security model

There are no user accounts. Access is gated by unguessable codes shared out of
band. That's the product's charm and its whole threat model.

`firestore.rules` is **deny-by-default**. Clients get read-only access to
`trips` and `rooms` and nothing else. Every write and every sensitive read goes
through a callable Cloud Function using the Admin SDK.

| Function | Purpose |
| --- | --- |
| `createTrip` | creates trip + rooms, generates codes |
| `joinTrip` | participant code → tripId |
| `submitPreferences` | validates and stores a submission |
| `getAdminData` | admin code → submissions incl. emails |
| `getResults` | either code → assignments |
| `allocateRooms` | runs the allocation |

Three things this fixed:

- **Codes were `Math.random()`.** The code *is* the password. Now
  `crypto.randomBytes` over a 32-character alphabet — `256 % 32 == 0`, so
  byte-indexing has no modulo bias.
- **Zero-sum was browser-only.** Anyone with devtools could submit unbalanced
  bids and skew the allocation. Now enforced server-side, which also rejects
  room IDs that don't belong to the trip.
- **Admin codes were world-readable.** Verification happened client-side against
  a public document, so anyone with a `tripId` could read the admin code and
  take over the trip.

### Rules of thumb when editing

- A client must **never** be able to read a document containing `adminCode`,
  `participantCode`, or an email address.
- Add an explicit deny block rather than loosening an existing rule.
- Codes are stored in plaintext in `secret/codes` so a lost admin code can be
  recovered from the console. Hashing them is strictly more secure and makes
  loss unrecoverable.

## Cost control

GCP budgets **only alert — they never cap spend.** There is no hard spending
limit in Google Cloud. A $5 budget alert exists at 50/90/100%, but the actual
ceiling is `maxInstances: 10` on every callable, which bounds concurrency so a
scraper or a retry loop can't scale into a real bill.

## Outstanding

1. **Client refactor** — the six components still read Firestore directly, which
   the current rules forbid. Rules, functions, and client must deploy together.
2. **Port the envy-free allocator into `functions/`** — `allocateRooms` still
   runs the v1 heuristic.
3. **Flip hosting** from `hosting-placeholder/` to `dist/`.
4. **App Check** — public trip creation is unauthenticated and spammable.
