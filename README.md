# 🛏️ Democratic Room Assignment System

This project implements a **fair, transparent, and defensible room-assignment process** for group trips.  
It replaces first-come-first-served chaos and informal negotiation with a **structured democratic system** that combines preferences, price signals, and baseline room quality.

The goal is not to “auction” rooms, but to **surface real tradeoffs** and allocate rooms in a way the entire group can understand, audit, and defend.

---

## Core Principles

Everyone starts equal.  
Everyone pays the same base cost.  
Differences in rooms are resolved **collectively**, using shared rules.

This system:

- Avoids race conditions
- Avoids negotiation pressure
- Respects comfort and accessibility needs
- Makes incentives explicit
- Produces explainable outcomes

---

## High-Level Overview

- Base cost is **$480 per person**, already paid
- Participants express:
  - Which rooms they would genuinely accept (ranked)
  - How much more or less they value each room (price adjustments)
- The algorithm assigns rooms using:
  - Rankings
  - Price signals
  - Baseline room differences
- Final prices are normalized so:
  - Similar rooms cost the same
  - The total adjustment across the group is zero

No one can buy a room outright.  
But willingness to pay more helps the group as a whole.

---

## User Input Model

### 1. Ranking Rooms

Participants rank **only rooms they would actually accept**.

- Ranked rooms are treated as ordered preferences
- Unranked rooms are treated as a **neutral tie**
- Not ranking a room does *not* hurt you

This avoids forcing people to express preferences for rooms they actively dislike.

> Couples, in particular, should not rank beds they would never accept — e.g. a full bed vs. a twin — even if they are technically available.

---

### 2. Price Adjustments

Each participant can adjust room prices up or down in fixed increments.

- Increasing a price means:
  - “I would be willing to pay more for this room”
- Decreasing a price means:
  - “I would accept a refund to take this room”

Rules:

- Adjustments must sum to zero
- Total group cost does not change
- Price signals influence allocation **directionally**, not absolutely

These adjustments represent **relative value**, not bids in an auction.

---

### 3. Couples

Couples:

- Submit together
- Are treated as a single unit
- Are kept together whenever possible

The system only assigns couples to suboptimal configurations if the **combined submitted data clearly supports it**.

---

## Assignment Logic (Plain English)

For each person or couple, the system calculates a utility score for every room using:

- **Baseline room quality**
  - Bed size
  - Privacy
  - Bathroom access
  - Shared vs. private
- **Preference rank**
- **Price adjustment signal**
- **Similarity propagation**
  - Strong bids for one room partially lift other rooms of equal class

Assignments are made by maximizing total group utility, not individual wins.

When rooms are effectively equal, ties are resolved randomly within that tier.

---

## Guardrail Alignment

### Guardrail 1  
**People willing to pay more benefit the group**

✔ Higher bids increase allocation utility  
✔ Final pricing redistributes value  
✔ Willingness to accept refunds reduces pressure elsewhere  

This functions like a soft public-good subsidy without auction mechanics.

---

### Guardrail 2  
**Prices correlate with outcomes but do not cause them**

✔ Baseline room quality is weighted more heavily than price  
✔ Preferences dominate ordinal choice  
✔ Price cannot brute-force an outcome  

Structural fairness anchors the system.

---

### Guardrail 3  
**Strong bids propagate within equal-value beds**

✔ Positive signal propagates within bed class  
✔ No bleed across unrelated room types  
✔ No dominance over explicit rankings  

This captures “equal value” without brittle taxonomy.

---

### Guardrail 4  
**Unranked rooms are a neutral tie**

✔ Unranked rooms share the first unused ordinal rank  
✔ No hidden penalties  
✔ No ordering bias  

This avoids accidental coercion.

---

## Output

The final output (CSV or Markdown) shows:

- Room assignments
- Final per-person price adjustments
- Zero-sum verification
- Identical pricing for identical room classes

Everything is auditable.

---

## Firebase Setup

### Client Configuration

Replace the Firebase config in the frontend with your own project values:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

> Note: This configuration is **not secret**. It only identifies the Firebase project.

---

### Server / Seed Configuration

In the `seed/` directory, provide a Firebase Admin service account key:
> Note: This configuration is **secret**. You will produce this key in Firebase Admin Access and copy it to your project.

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----...",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

⚠️ **Never commit this file.**  
Add it to `.gitignore`.

---

## Running the Allocation

```bash
cd seed
node get-data.js
node allocate-beds.js submissions-export.csv
```

Outputs:

- Assignment CSV
- Assignment Markdown summary
- Pricing verification

---

## Philosophy

This system is intentionally:

- Non-adversarial
- Explainable to non-engineers
- Resistant to gaming
- Transparent by design

It produces outcomes that may not make everyone *perfectly happy*, but should make everyone say:

> “Yes — that was fair.”

---

## Next Up
Move from just solving the problem for us today, to soliving this problem for anyone:

1.  DB only allows for submissions.  We would need new db structure
  -Trip (each trip has it's own db)
  -Room (foreign key on trip or however that works in NoSQL)
  -Submissions (pretty much as is now, but would need to be more robust)
2.  Advertising.  I have never done advertisment on a web app before, but I would think it might be a good time to implement something like that.  If a new trip is submitted, show add.  Sleeping situation set for trip, show add.  User submits their preferences for the trip, show add.
3.  UI would need updating.  I think what we have is good for the submissions process, sure.  We would need a system.  I have done user validation and could have a backend for that basically immediately, but would like some relevant information on whether we do that or leave it open, but the users would need some code saved to access their trip.

### In the maybe section!!!  
**Not sure if we should do for an mvp of the project, but these are ideas**
1.  Chron job that deletes trips that have been finished for a month



---

## License

UNLICENSED - no reproduction or use without explicit permission
