# Cadence — Music Lesson Studio Billing (navigable prototype)

Open **`index.html`** by double-clicking it. No server, no build step, no internet.
Open **`traceability.html`** for the requirement-by-requirement map and the open questions.

## Files

| File | What's in it |
|---|---|
| `index.html` | Entry point |
| `assets/styles.css` | Design system |
| `js/data.js` | Domain model, identifier sequences, seed fixture, migration |
| `js/engine.js` | **All business rules.** Read this to review the logic without the UI |
| `js/ui.js` | Screen rendering |
| `js/app.js` | Router, dialogs, actions |
| `traceability.html` | Requirement → rule → screen matrix, plus open questions |

State lives in memory. Reloading the page reseeds the studio, which is the
fastest way to get back to a clean fixture.

## Sign-in

The gate offers one teacher and three students. Ben Carter has an unconsumed
invitation — signing in as Ben consumes it, and the link then refuses any
further use.

## Ten things worth trying

1. **Identifier backfill** — Students. Seeded records run contiguously from
   `STU-000001` in creation order. Add a student: it takes the next number,
   and no screen offers a control to change it.

2. **Terminal states hold** — Calendar → click a scheduled lesson → mark it
   Completed. Reopen it: the transition buttons are gone.

3. **Series revision** — Calendar → a series row → Revise series. Change the day
   and time. Only future Scheduled occurrences move; completed, no-show and
   cancelled ones stay where they are and keep their identifiers.

4. **A revision that changes nothing** — save the revise dialog without editing a
   field. No revision record, no email.

5. **Double invoicing is refused** — Unbilled lessons → Create invoice. Run it
   again for the same student: no invoice is produced, and the reason says so.

6. **Late cancellation charges once** — sign in as Ava → My lessons → cancel a
   lesson inside 24 hours. It appears exactly once in Unbilled lessons at 50% of
   her rate.

7. **Reversion keeps the paper trail** — invoice a completed lesson, then open
   that lesson and revert it. The invoice goes to Void with its identifier, lines
   and captured rates intact, and its co-billed lessons return to Unbilled.

8. **Rates are captured, not referenced** — Settings → change the policy note.
   Reopen an invoice issued earlier: it still shows the note in force at its own
   issue time.

9. **Snapshot history is bounded** — an invoice → Regenerate PDF six times. Five
   snapshots are retained, and the discarded number is never reused.

10. **The portal refuses identically** — as Ava, Invoices → Try a direct link.
    Probe `INV-999999` and then an invoice belonging to another student. Same
    message both times. Every attempt is logged under Portal access.
