/* ============================================================
   Cadence — rules engine
   Every rule below is anchored to a requirement id from the
   specification. Read this file top to bottom to review the
   business logic without going through the UI.
   ============================================================ */

var Engine = (function () {

  /* ==========================================================
     BILLING ENTRIES — the single source of "what is owed"
     I07-R01 / I07-R02: a lesson carries AT MOST ONE billing
     entry, determined once from its lesson identifier. Because
     the entry is keyed by lessonId, no later transition, series
     revision or repeated submission can create a second one.
     ========================================================== */
  function billableAmount(lesson) {
    var st = studentById(lesson.studentId);
    if (lesson.state === 'completed' || lesson.state === 'no_show') {
      return { amount: st.rate, kind: 'lesson' };                       // I02: full rate
    }
    if ((lesson.state === 'cancelled_student' || lesson.state === 'cancelled_teacher') && lesson.lateCancel) {
      var pct = DB.studio.lateCancelChargePct;                          // I07-R01
      return { amount: Math.round(st.rate * pct / 100), kind: 'late_cancel' };
    }
    return null;                                                        // I07-R02: standard cancel, scheduled
  }

  function syncBillingEntry(lesson) {
    var existing = entryForLesson(lesson.id);
    var due = billableAmount(lesson);

    if (!due) {
      /* not billable — withdraw any open entry, never delete it (I08-R02) */
      if (existing && !existing.invoiceId && !existing.voided) {
        existing.voided = true;
        existing.voidReason = 'Lesson is no longer billable';
      }
      return existing || null;
    }
    if (existing && !existing.voided) {
      /* idempotent: the entry is keyed by lesson, so a repeated submission,
         later transition or series revision can never add a second one */
      if (!existing.invoiceId) {
        existing.amount = due.amount;
        existing.kind = due.kind;
      }
      return existing;
    }
    /* a withdrawn entry is kept for the audit trail; re-terminalisation
       after a reversion creates a fresh entry, never reinstates the old (I08-R04) */
    var entry = {
      id: 'be_' + DB.billingEntries.length, lessonId: lesson.id, kind: due.kind,
      amount: due.amount, voided: false, voidReason: null, invoiceId: null,
      createdAt: iso(new Date())
    };
    DB.billingEntries.push(entry);
    return entry;
  }

  /* ==========================================================
     LESSON LIFECYCLE — I02-R01, amended by I08
     ========================================================== */
  function allowedTransitions(lesson, role) {
    if (role !== 'teacher') {
      /* a student may only cancel their own scheduled lesson (I02-R04) */
      return lesson.state === 'scheduled' ? ['cancelled_student'] : [];
    }
    if (lesson.state === 'scheduled') return ALLOWED_FROM_SCHEDULED;
    return [];                                        // terminal: no forward transition
  }

  function isLateCancel(lesson, at) {
    var hrs = (new Date(lesson.start) - new Date(at)) / 3600000;
    /* I07: "a cancellation submitted at or after the window boundary is a late
       cancellation" — the boundary itself is inclusive, so <= not < */
    return hrs <= DB.studio.lateCancelWindowHours;
  }

  function transition(lessonId, toState, actor, role) {
    var l = lessonById(lessonId);
    if (!l) return fail('That lesson could not be found.');
    if (allowedTransitions(l, role).indexOf(toState) < 0) {
      return fail(l.state === 'scheduled'
        ? 'That transition is not permitted from Scheduled.'
        : 'This lesson is ' + LESSON_STATES[l.state].label + '. Terminal states admit no further transition — revert it first.');
    }
    var from = l.state;
    var now = new Date();
    l.state = toState;
    l.stateSetAt = iso(now);

    if (toState === 'cancelled_student' || toState === 'cancelled_teacher') {
      l.cancelledAt = iso(now);
      l.lateCancel = isLateCancel(l, now);            // I07: decided once, at cancellation
    }
    syncBillingEntry(l);                              // I07-R01: exactly one entry

    /* email effect (I02): cancellation notifies both parties; completed / no-show sends nothing */
    if (toState === 'cancelled_student' || toState === 'cancelled_teacher') {
      var st = studentById(l.studentId);
      notify('cancellation', st.email, { lessonId: l.id, studentId: st.id });
      notify('cancellation', DB.studio.teacherEmail, { lessonId: l.id, studentId: st.id });
    }
    logActivity(actor, 'Lesson ' + l.publicId + ' moved from ' + LESSON_STATES[from].label +
      ' to ' + LESSON_STATES[toState].label +
      (l.lateCancel ? ' — late cancellation, billable at ' + DB.studio.lateCancelChargePct + '%' : ''),
      { lessonId: l.id, studentId: l.studentId, kind: 'transition' });
    return ok(l);
  }

  /* ==========================================================
     REVERSION — I08-R01..R04
     Terminal → Scheduled, teacher only, blocked when the lesson
     is covered by a PAID invoice. Nothing is ever deleted.
     ========================================================== */
  function reversionBlockReason(lesson) {
    if (!LESSON_STATES[lesson.state].terminal) return 'Only a lesson in a terminal state can be reverted.';
    var e = entryForLesson(lesson.id);
    if (e && e.invoiceId) {
      var inv = invoiceById(e.invoiceId);
      if (inv && inv.status === 'paid') {
        return 'This lesson is covered by paid invoice ' + inv.publicId + '. A paid invoice cannot be unwound here — issue a credit instead.';
      }
    }
    return null;
  }

  function revert(lessonId, actor) {
    var l = lessonById(lessonId);
    var block = reversionBlockReason(l);
    if (block) return fail(block);

    var from = l.state;
    var e = entryForLesson(l.id);
    var voidedInvoice = null;

    if (e && e.invoiceId) {
      var inv = invoiceById(e.invoiceId);
      if (inv && inv.status === 'issued') {
        /* void in full, keeping identifier, lines and captured rates (I08-R02) */
        inv.status = 'void';
        inv.voidReason = 'Voided when lesson ' + l.publicId + ' was reverted to Scheduled';
        voidedInvoice = inv;
        /* co-billed lessons return to Unbilled Lessons (I08-R02) */
        DB.billingEntries.forEach(function (other) {
          if (other.invoiceId === inv.id && other.lessonId !== l.id) other.invoiceId = null;
        });
      }
    }
    if (e) {                                          // withdraw the charge, keep traceability (I08-R02)
      e.voided = true;
      e.invoiceId = null;
      e.voidReason = 'Withdrawn on reversion of ' + l.publicId;
    }
    l.state = 'scheduled';
    l.lateCancel = false;
    l.cancelledAt = null;
    l.stateSetAt = iso(new Date());
    l.revertedFrom = from;

    logActivity(actor, 'Lesson ' + l.publicId + ' reverted from ' + LESSON_STATES[from].label +
      ' to Scheduled' + (voidedInvoice ? '. Invoice ' + voidedInvoice.publicId + ' voided in full.' : '.'),
      { lessonId: l.id, studentId: l.studentId, kind: 'reversion' });
    return ok({ lesson: l, voidedInvoice: voidedInvoice });
  }

  /* ==========================================================
     UNBILLED LESSONS — I04-R01, I07-R01
     A lesson already covered by a non-voided invoice is never
     listed, and never appears twice.
     ========================================================== */
  function unbilledEntries(studentId) {
    var seen = {};
    return DB.billingEntries.filter(function (e) {
      if (e.voided) return false;
      var l = lessonById(e.lessonId);
      if (!l) return false;
      if (studentId && l.studentId !== studentId) return false;
      if (e.invoiceId) {
        var inv = invoiceById(e.invoiceId);
        if (inv && inv.status !== 'void') return false;   // covered by an issued or paid invoice
      }
      if (seen[e.lessonId]) return false;                 // I07: never the same lesson twice
      seen[e.lessonId] = true;
      return true;
    });
  }

  /* ==========================================================
     INVOICING — I06-R01..R03
     Lines capture the rate and the policy note in force at issue.
     ========================================================== */
  function createInvoice(studentId, mode, lessonIds, actor) {
    var st = studentById(studentId);
    var now = new Date();

    if (mode === 'monthly') {
      var period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      var inv = newInvoice(st, 'monthly', now);
      inv.lines.push({
        lessonId: null, lessonPublicId: null, date: null, stateAtIssue: null,
        rate: st.monthlyAmount || st.rate, total: st.monthlyAmount || st.rate,
        policyNote: DB.studio.policyNote, policyVerified: true,
        periodLabel: 'Monthly tuition — ' + period, kind: 'monthly'
      });
      inv.total = inv.lines[0].total;
      finishInvoice(inv, st, actor);
      return ok(inv);
    }

    var eligible = unbilledEntries(studentId).filter(function (e) {
      return !lessonIds || lessonIds.indexOf(e.lessonId) >= 0;
    });
    if (!eligible.length) {
      /* I04-R02: no eligible lesson remains → no invoice is produced */
      return fail('No eligible lessons remain for this student. Nothing was invoiced.');
    }
    var inv2 = newInvoice(st, 'per_lesson', now);
    eligible.forEach(function (e) {
      var l = lessonById(e.lessonId);
      inv2.lines.push({
        lessonId: l.id, lessonPublicId: l.publicId, date: l.start,
        stateAtIssue: l.state, rate: e.amount, total: e.amount,
        policyNote: DB.studio.policyNote, policyVerified: true,
        periodLabel: null, kind: e.kind
      });
      inv2.total += e.amount;                            // I06-R01: total = sum of lines
      e.invoiceId = inv2.id;                             // I04-R01: no longer eligible
    });
    finishInvoice(inv2, st, actor);
    return ok(inv2);
  }

  function newInvoice(st, type, now) {
    return {
      id: 'in_' + DB.invoices.length, publicId: nextId('INV'), studentId: st.id, type: type,
      status: 'issued', issuedAt: iso(now), dueAt: iso(addDays(now, 14)),
      lines: [], total: 0, flaggedForReview: false, snapshots: [], voidReason: null, legacy: false
    };
  }

  function finishInvoice(inv, st, actor) {
    DB.invoices.push(inv);
    snapshot(inv, actor || DB.studio.teacherName);       // I09-R01: generation adds a snapshot
    notify('invoice', st.email, { invoiceId: inv.id, studentId: st.id });
    logActivity(actor || DB.studio.teacherName,
      'Invoice ' + inv.publicId + ' issued for ' + money(inv.total) + ' (' + inv.lines.length + ' line' + (inv.lines.length === 1 ? '' : 's') + ').',
      { invoiceId: inv.id, studentId: st.id, kind: 'invoice' });
  }

  /* ==========================================================
     PDF SNAPSHOT HISTORY — I09-R01
     Bounded to the five most recent. Sequence numbers keep
     ascending regardless of discards; none is ever reused.
     ========================================================== */
  function snapshot(inv, user) {
    inv.snapshotSeq = (inv.snapshotSeq || 0) + 1;
    inv.snapshots.push({
      seq: inv.snapshotSeq, at: iso(new Date()), by: user,
      lines: JSON.parse(JSON.stringify(inv.lines)), total: inv.total
    });
    var discarded = null;
    while (inv.snapshots.length > 5) discarded = inv.snapshots.shift();
    return { seq: inv.snapshotSeq, discarded: discarded };
  }

  /* ==========================================================
     PAYMENT — BASE-R05, I01
     ========================================================== */
  function pay(invoiceId, actor) {
    var inv = invoiceById(invoiceId);
    if (!inv) return fail('That invoice could not be found.');
    if (inv.status === 'paid') return fail('Invoice ' + inv.publicId + ' is already paid.');
    if (inv.status === 'void') return fail('Invoice ' + inv.publicId + ' is void and cannot be paid.');

    var st = studentById(inv.studentId);
    var payment = {
      id: 'pa_' + DB.payments.length, publicId: nextId('PAY'), invoiceId: inv.id,
      amount: inv.total, paidAt: iso(new Date()), method: 'Stripe Checkout', legacy: false
    };
    DB.payments.push(payment);
    var receipt = {
      id: 'rc_' + DB.receipts.length, publicId: nextId('RCP'), paymentId: payment.id,
      invoiceId: inv.id, issuedAt: payment.paidAt, legacy: false
    };
    DB.receipts.push(receipt);
    inv.status = 'paid';

    notify('receipt', st.email, { invoiceId: inv.id, receiptId: receipt.id, studentId: st.id });
    notify('receipt', DB.studio.teacherEmail, { invoiceId: inv.id, receiptId: receipt.id, studentId: st.id });
    logActivity(actor, 'Invoice ' + inv.publicId + ' paid — ' + money(inv.total) + '. Receipt ' + receipt.publicId + ' issued.',
      { invoiceId: inv.id, studentId: st.id, kind: 'payment' });
    return ok({ payment: payment, receipt: receipt });
  }

  function failPayment(invoiceId, actor) {
    var inv = invoiceById(invoiceId);
    var st = studentById(inv.studentId);
    var n = notify('payment_failed', st.email, { invoiceId: inv.id, studentId: st.id });
    pushEvent(n, 'failed', new Date());                  // I05-R01
    logActivity(actor, 'Checkout cancelled for invoice ' + inv.publicId + '. Failed-payment alert sent.',
      { invoiceId: inv.id, studentId: st.id, kind: 'payment' });
    return ok(n);
  }

  /* ==========================================================
     SERIES REVISION — I03-R01..R03
     Applies only to future occurrences still in Scheduled state.
     Identifiers are retained: occurrences are rescheduled, not
     replaced. Removed occurrences do not release their numbers.
     ========================================================== */
  function reviseSeries(seriesId, changes, actor) {
    var s = seriesById(seriesId);
    var now = new Date();
    var changed = [];

    ['dayOfWeek', 'time', 'durationMin', 'boundaryType', 'endDate'].forEach(function (f) {
      if (changes[f] === undefined || changes[f] === null || changes[f] === '') return;
      var next = f === 'dayOfWeek' || f === 'durationMin' ? +changes[f] : changes[f];
      if (String(s[f]) !== String(next)) changed.push({ field: f, from: s[f], to: next });
    });

    if (!changed.length) {
      /* I03-R03: a save that changes no field creates no record and sends no notice */
      return ok({ noop: true, affected: 0 });
    }

    var future = DB.lessons.filter(function (l) {
      return l.seriesId === s.id && l.state === 'scheduled' && new Date(l.start) > now;
    });

    changed.forEach(function (c) { s[c.field] = c.to; });

    var affected = 0, added = 0, removed = 0;
    var movesDateOrTime = changed.some(function (c) { return c.field === 'dayOfWeek' || c.field === 'time'; });

    future.forEach(function (l) {
      var d = new Date(l.start);
      if (movesDateOrTime) {
        var delta = (s.dayOfWeek - d.getDay() + 7) % 7;
        d = atTime(addDays(d, delta), s.time);
        l.start = iso(d);                                // identifier retained (I03-R02)
      }
      l.durationMin = s.durationMin;
      affected++;
    });

    /* boundary change: extend or shorten */
    if (changed.some(function (c) { return c.field === 'boundaryType' || c.field === 'endDate'; })) {
      var horizon = s.boundaryType === 'ongoing' ? addWeeks(now, s.horizonWeeks) : new Date(s.endDate);
      var last = DB.lessons.filter(function (l) { return l.seriesId === s.id; })
        .map(function (l) { return new Date(l.start); }).sort(function (a, b) { return b - a; })[0];
      var cursor = addWeeks(last, 1);
      var guard = 0;
      while (cursor <= horizon && guard++ < 100) {
        var nl = mkLesson(s.studentId, s.id, atTime(cursor, s.time), s.durationMin, now);
        nl.legacy = false;
        nl.publicId = nextId('LSN');                     // new occurrences continue the sequence
        added++;
        cursor = addWeeks(cursor, 1);
      }
      /* shortening deletes only Scheduled occurrences past the boundary; numbers are not reused */
      var doomed = DB.lessons.filter(function (l) {
        return l.seriesId === s.id && l.state === 'scheduled' && new Date(l.start) > horizon;
      });
      removed = doomed.length;
      DB.lessons = DB.lessons.filter(function (l) { return doomed.indexOf(l) < 0; });
      s.lastMaterialized = iso(horizon);
    }

    var rev = {
      seq: s.revisions.length + 1, at: iso(now), actor: actor,
      fields: changed, affected: affected, added: added, removed: removed
    };
    s.revisions.push(rev);                               // immutable history (I03-R03)

    /* I03: one single reschedule notice, only when Scheduled occurrences moved */
    if (affected + added + removed > 0) {
      var st = studentById(s.studentId);
      notify('reschedule', st.email, { studentId: st.id });
    }
    logActivity(actor, 'Series revised — ' + changed.map(function (c) { return c.field; }).join(', ') +
      '. ' + affected + ' scheduled occurrence(s) moved, ' + added + ' added, ' + removed + ' removed.',
      { studentId: s.studentId, kind: 'revision' });
    return ok(rev);
  }

  /* ==========================================================
     NOTIFICATIONS — I01, I05-R01..R03
     ========================================================== */
  function notify(type, recipient, refs) {
    var st = refs.studentId ? studentById(refs.studentId) : null;
    /* unsubscribe applies to reminders only; invoices and receipts always send (BASE-R08) */
    if (type === 'reminder' && st && st.unsubscribed) return null;

    var n = {
      id: 'nt_' + DB.notifications.length, publicId: nextId('NOT'), type: type,
      recipient: recipient, sentAt: iso(new Date()), lessonId: refs.lessonId || null,
      invoiceId: refs.invoiceId || null, studentId: refs.studentId || null,
      receiptId: refs.receiptId || null, subject: notificationSubject(type, refs),
      events: [], legacy: false
    };
    pushEvent(n, 'queued');
    pushEvent(n, 'sent');
    pushEvent(n, 'delivered');
    DB.notifications.push(n);
    return n;
  }

  function resend(notificationId) {
    var src = DB.notifications.filter(function (n) { return n.id === notificationId; })[0];
    /* I05-R03: resending creates a NEW notification record; existing events are never edited */
    var n = notify(src.type, src.recipient, {
      lessonId: src.lessonId, invoiceId: src.invoiceId, studentId: src.studentId, receiptId: src.receiptId
    });
    logActivity(DB.studio.teacherName, 'Resent ' + src.type + ' to ' + src.recipient + ' as ' + n.publicId + '.', { kind: 'email' });
    return ok(n);
  }

  /* ==========================================================
     NOTES — I09-R02, I09-R03
     ========================================================== */
  function addNote(targetType, targetId, content, visibility, author) {
    var n = {
      id: 'no_' + DB.notes.length, publicId: nextId('NTE'), targetType: targetType,
      targetId: targetId, author: author, content: content, visibility: visibility,
      createdAt: iso(new Date()), edits: [], deleted: false, legacy: false
    };
    DB.notes.push(n);
    return ok(n);
  }

  function editNote(noteId, content, visibility) {
    var n = DB.notes.filter(function (x) { return x.id === noteId; })[0];
    n.edits.push({ at: iso(new Date()), from: { content: n.content, visibility: n.visibility } });
    n.content = content;
    n.visibility = visibility;
    return ok(n);
  }

  function deleteNote(noteId) {
    var n = DB.notes.filter(function (x) { return x.id === noteId; })[0];
    n.deleted = true;                                    // identifier is not released (I09-R02)
    return ok(n);
  }

  function notesFor(targetType, targetId, role) {
    return DB.notes.filter(function (n) {
      if (n.deleted || n.targetType !== targetType || n.targetId !== targetId) return false;
      if (role === 'student' && n.visibility !== 'shared') return false;   // I09-R03
      return true;
    });
  }

  /* ==========================================================
     PORTAL ACCESS SCOPE — I10-R01..R04
     Every portal read is scoped server-side to the authenticated
     student. A record owned by someone else is refused with the
     SAME message as a record that does not exist — no identifier,
     owner, amount or state is disclosed.
     ========================================================== */
  var REFUSAL = 'That link is not valid. Check the address, or ask your teacher to send it again.';

  function portalFetch(kind, publicId, authStudentId) {
    var pool = { lesson: DB.lessons, invoice: DB.invoices, payment: DB.payments, receipt: DB.receipts }[kind] || [];
    var rec = pool.filter(function (r) { return r.publicId === publicId; })[0];
    var ownerOf = function (r) {
      if (!r) return null;
      if (r.studentId) return r.studentId;
      var inv = invoiceById(r.invoiceId);
      return inv ? inv.studentId : null;
    };
    var owner = ownerOf(rec);
    var granted = !!rec && owner === authStudentId;

    DB.accessLog.unshift({
      at: iso(new Date()), kind: kind, publicId: publicId,
      by: authStudentId, granted: granted,
      reason: !rec ? 'no such record' : (granted ? 'owner' : 'owned by another student')
    });
    if (!granted) return { ok: false, error: REFUSAL };   // identical message either way (I10-R04)
    return { ok: true, value: rec };
  }

  function consumeInvitation(token, actor) {
    var inv = DB.invitations.filter(function (i) { return i.token === token; })[0];
    if (!inv || inv.consumed) {
      DB.accessLog.unshift({
        at: iso(new Date()), kind: 'invitation', publicId: token, by: actor || 'anonymous',
        granted: false, reason: !inv ? 'no such token' : 'token already consumed'
      });
      return { ok: false, error: REFUSAL };               // I10-R01: single use
    }
    inv.consumed = true;
    inv.consumedAt = iso(new Date());
    var st = studentById(inv.studentId);
    st.portalStatus = 'active';
    DB.accessLog.unshift({
      at: iso(new Date()), kind: 'invitation', publicId: token, by: st.email,
      granted: true, reason: 'first use by intended recipient'
    });
    logActivity(st.name, 'Portal invitation consumed. Password set on first access.', { studentId: st.id, kind: 'access' });
    return { ok: true, value: st };
  }

  function sendInvite(studentId) {
    var st = studentById(studentId);
    var token = 'inv_' + st.publicId.toLowerCase().replace('-', '') + '_' + Math.random().toString(16).slice(2, 6);
    DB.invitations.push({ token: token, studentId: st.id, consumed: false, sentAt: iso(new Date()) });
    if (st.portalStatus === 'none') st.portalStatus = 'invited';
    notify('invite', st.email, { studentId: st.id });
    logActivity(DB.studio.teacherName, 'Portal invitation sent to ' + st.email + '.', { studentId: st.id, kind: 'access' });
    return ok(token);
  }

  /* ==========================================================
     BALANCES
     Voided entries never appear in the student's balance (I07-R04)
     ========================================================== */
  function balance(studentId) {
    var open = DB.invoices.filter(function (i) {
      return i.studentId === studentId && i.status === 'issued';
    });
    var unbilled = unbilledEntries(studentId);
    return {
      openInvoiced: open.reduce(function (a, i) { return a + i.total; }, 0),
      openCount: open.length,
      unbilled: unbilled.reduce(function (a, e) { return a + e.amount; }, 0),
      unbilledCount: unbilled.length
    };
  }

  function ok(v) { return { ok: true, value: v }; }
  function fail(m) { return { ok: false, error: m }; }

  return {
    billableAmount: billableAmount, syncBillingEntry: syncBillingEntry,
    allowedTransitions: allowedTransitions, isLateCancel: isLateCancel,
    transition: transition, revert: revert,
    reversionBlockReason: reversionBlockReason,
    unbilledEntries: unbilledEntries, createInvoice: createInvoice, snapshot: snapshot,
    pay: pay, failPayment: failPayment, reviseSeries: reviseSeries,
    notify: notify, resend: resend,
    addNote: addNote, editNote: editNote, deleteNote: deleteNote, notesFor: notesFor,
    portalFetch: portalFetch, consumeInvitation: consumeInvitation, sendInvite: sendInvite,
    balance: balance, REFUSAL: REFUSAL
  };
})();

/* make the seed's helper reachable from data.js */
function syncBillingEntry(l) { return Engine.syncBillingEntry(l); }
