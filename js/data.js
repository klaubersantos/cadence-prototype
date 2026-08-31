/* ============================================================
   Cadence — domain model, identifier sequences, seed fixture
   Requirement anchors: BASE-R01..R08, I01-R01..R03
   ============================================================ */

var DB = null;

/* ---------- identifier scheme (I01-R01) -------------------------------
   Fixed three-letter prefix + hyphen + six-digit zero-padded sequence.
   Sequences are per entity type and per studio, starting at 000001.
   Numbers are never reused, never regenerated, never reassigned —
   nextSeq only ever increments, including for deleted/voided records.
--------------------------------------------------------------------- */
var PREFIXES = ['STU', 'LSN', 'INV', 'PAY', 'RCP', 'NOT', 'NTE'];

function nextId(prefix) {
  if (PREFIXES.indexOf(prefix) < 0) throw new Error('unknown prefix ' + prefix);
  DB.sequences[prefix] = (DB.sequences[prefix] || 0) + 1;
  return prefix + '-' + String(DB.sequences[prefix]).padStart(6, '0');
}

/* ---------- date helpers ---------- */
function iso(d) { return new Date(d).toISOString(); }
function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d, n) { return addDays(d, n * 7); }
function atTime(d, hhmm) {
  var p = hhmm.split(':');
  var x = new Date(d);
  x.setHours(+p[0], +p[1], 0, 0);
  return x;
}
function startOfWeek(d) {
  var x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtStamp(d) {
  return fmtShort(d) + ' ' + fmtTime(d);
}
function money(cents) {
  return '$' + (cents / 100).toFixed(2);
}

/* ---------- state vocabulary (I02-R01) ---------- */
var LESSON_STATES = {
  scheduled: { label: 'Scheduled', badge: 'b-scheduled', terminal: false },
  completed: { label: 'Completed', badge: 'b-completed', terminal: true },
  no_show: { label: 'No-show', badge: 'b-noshow', terminal: true },
  cancelled_student: { label: 'Cancelled by student', badge: 'b-cxs', terminal: true },
  cancelled_teacher: { label: 'Cancelled by teacher', badge: 'b-cxt', terminal: true }
};

/* Allowed transitions from Scheduled only (I02-R01).
   Reversion out of a terminal state is a separate, teacher-only
   operation added in Iteration 8 — see engine.revertLesson. */
var ALLOWED_FROM_SCHEDULED = ['completed', 'no_show', 'cancelled_student', 'cancelled_teacher'];

/* ---------- notification delivery events (I05-R01) ---------- */
var DELIVERY_STATES = ['queued', 'sent', 'delivered', 'opened', 'failed'];

/* ============================================================
   SEED — idempotent fixture matching the Frozen App README:
   teacher + studio, students Ava Thompson / Ben Carter (invite
   pending), a weekly series, past and upcoming lessons, and an
   open invoice. Legacy records are created BEFORE identifiers
   existed, then backfilled, so the prototype can demonstrate the
   difference between an identifier assigned at creation and one
   assigned retroactively by migration (I01-R02, I01-R03).
   ============================================================ */
function seed() {
  var now = new Date();
  var today = new Date(now); today.setHours(0, 0, 0, 0);

  DB = {
    sequences: {},
    migrationRunAt: null,
    studio: {
      name: 'Rowan Street Music',
      teacherName: 'Marta Alves',
      teacherEmail: 'teacher@studio.dev',
      timezone: 'America/New_York',
      defaultDuration: 45,
      defaultLocation: 'Studio A — 118 Rowan St',
      lateCancelWindowHours: 24,
      lateCancelChargePct: 50,
      policyNote: 'Cancellations inside 24 hours are billed at 50% of the lesson rate.'
    },
    students: [], invitations: [], series: [], lessons: [],
    billingEntries: [], invoices: [], payments: [], receipts: [],
    notifications: [], notes: [], activity: [],
    session: { role: 'teacher', studentId: null },
    accessLog: []
  };

  /* --- students (legacy: created before the identifier migration) --- */
  var ava = mkStudent('Ava Thompson', 'ava.thompson@example.com', 6000, 'per_lesson', 24, 'active', addDays(today, -240));
  var ben = mkStudent('Ben Carter', 'ben.carter@example.com', 5500, 'per_lesson', 12, 'invited', addDays(today, -180));
  var noor = mkStudent('Noor Haddad', 'noor.haddad@example.com', 22000, 'monthly', 24, 'active', addDays(today, -150));
  noor.monthlyAmount = 22000;

  /* invitation tokens (BASE-R01, I10-R01) */
  DB.invitations.push({ token: 'inv_ben_9f2a', studentId: ben.id, consumed: false, sentAt: iso(addDays(today, -178)) });
  DB.invitations.push({ token: 'inv_ava_31c7', studentId: ava.id, consumed: true, sentAt: iso(addDays(today, -238)), consumedAt: iso(addDays(today, -237)) });

  /* --- recurring series (BASE-R06, I03-R01) --- */
  var s1 = mkSeries(ava.id, 2, '16:00', 45, addDays(today, -168), 'ongoing');   // Tuesdays
  var s2 = mkSeries(noor.id, 4, '17:30', 60, addDays(today, -140), 'end_date', addDays(today, 42)); // Thursdays

  materializeSeries(s1, today);
  materializeSeries(s2, today);

  /* one-off lesson for Ben, in the past */
  mkLesson(ben.id, null, atTime(addDays(today, -14), '15:00'), 45, addDays(today, -20));

  /* --- historical states applied to past lessons --- */
  DB.lessons.forEach(function (l) {
    if (new Date(l.start) >= now) return;
    var d = new Date(l.start);
    var idx = Math.floor(d.getTime() / 86400000) % 9;
    if (idx === 3) l.state = 'no_show';
    else if (idx === 6) { l.state = 'cancelled_student'; l.cancelledAt = iso(addDays(d, -3)); l.lateCancel = false; }
    else l.state = 'completed';
    l.stateSetAt = iso(addDays(d, 0));
  });

  /* one late cancellation, to exercise I07 */
  var lateOne = DB.lessons.filter(function (l) {
    return l.studentId === ava.id && new Date(l.start) < now && l.state === 'completed';
  }).slice(-3)[0];
  if (lateOne) {
    lateOne.state = 'cancelled_student';
    lateOne.cancelledAt = iso(new Date(new Date(lateOne.start).getTime() - 4 * 3600 * 1000));
    lateOne.lateCancel = true;
  }

  /* --- billing entries derived from final states (I02, I07) --- */
  DB.lessons.forEach(function (l) { syncBillingEntry(l); });

  /* --- one issued (unpaid) invoice + one paid invoice, both legacy --- */
  var avaBillable = DB.billingEntries.filter(function (e) {
    var l = lessonById(e.lessonId);
    return l.studentId === ava.id && !e.voided && !e.invoiceId;
  });
  if (avaBillable.length > 3) {
    issueLegacyInvoice(ava, avaBillable.slice(0, 2), addDays(today, -35), true);   // paid
    issueLegacyInvoice(ava, avaBillable.slice(2, 4), addDays(today, -6), false);   // open
  }

  /* --- notifications for what the app has already sent (I01, I05) --- */
  mkNotification('invite', ben.email, addDays(today, -178), { studentId: ben.id });
  mkNotification('invite', ava.email, addDays(today, -238), { studentId: ava.id });
  DB.lessons.filter(function (l) { return l.state === 'cancelled_student' || l.state === 'cancelled_teacher'; })
    .forEach(function (l) {
      mkNotification('cancellation', studentById(l.studentId).email, l.cancelledAt || l.start, { lessonId: l.id });
    });

  /* --- teacher notes (I09-R02) --- */
  mkNote('student', ava.id, 'Working through Chopin Op. 28 No. 4. Slow the left hand.', 'shared');
  mkNote('student', ava.id, 'Parent asked about switching to monthly billing in the fall.', 'private');

  /* --- run the identifier migration over everything above (I01) --- */
  runIdentifierMigration();

  /* backfill an activity trail so the feed reflects real history */
  DB.lessons.filter(function (l) { return l.state !== 'scheduled'; })
    .sort(function (a, b) { return new Date(a.start) - new Date(b.start); })
    .slice(-14)
    .forEach(function (l) {
      DB.activity.push({
        at: l.stateSetAt || l.start, actor: DB.studio.teacherName, kind: 'transition',
        lessonId: l.id, studentId: l.studentId, invoiceId: null,
        text: 'Lesson ' + l.publicId + ' moved from Scheduled to ' + LESSON_STATES[l.state].label +
          (l.lateCancel ? ' — late cancellation, billable at ' + DB.studio.lateCancelChargePct + '%' : '')
      });
    });
  DB.invoices.forEach(function (i) {
    DB.activity.push({
      at: i.issuedAt, actor: DB.studio.teacherName, kind: 'invoice', invoiceId: i.id,
      studentId: i.studentId, lessonId: null,
      text: 'Invoice ' + i.publicId + ' issued for ' + money(i.total) + ' (' + i.lines.length + ' lines).'
    });
    if (i.status === 'paid') {
      var p = DB.payments.filter(function (x) { return x.invoiceId === i.id; })[0];
      DB.activity.push({
        at: p.paidAt, actor: studentById(i.studentId).name, kind: 'payment', invoiceId: i.id,
        studentId: i.studentId, lessonId: null,
        text: 'Invoice ' + i.publicId + ' paid — ' + money(i.total) + '. Receipt issued.'
      });
    }
  });
  DB.activity.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  logActivity('system', 'Studio seeded. Identifier migration completed for ' +
    (DB.students.length + DB.lessons.length + DB.invoices.length + DB.payments.length +
     DB.receipts.length + DB.notifications.length + DB.notes.length) + ' records.', {});
  return DB;
}

/* ---------- constructors (pre-migration: no publicId yet) ---------- */
function mkStudent(name, email, rate, mode, reminderHours, portalStatus, createdAt) {
  var s = {
    id: 'st_' + DB.students.length, publicId: null, name: name, email: email,
    rate: rate, billingMode: mode, monthlyAmount: 0, reminderHours: reminderHours,
    unsubscribed: false, portalStatus: portalStatus, createdAt: iso(createdAt), legacy: true
  };
  DB.students.push(s);
  return s;
}

function mkSeries(studentId, dayOfWeek, time, durationMin, startDate, boundaryType, endDate) {
  var s = {
    id: 'se_' + DB.series.length, studentId: studentId, dayOfWeek: dayOfWeek, time: time,
    durationMin: durationMin, startDate: iso(startDate), boundaryType: boundaryType,
    endDate: endDate ? iso(endDate) : null, horizonWeeks: 12,
    lastMaterialized: null, revisions: [], createdAt: iso(startDate)
  };
  DB.series.push(s);
  return s;
}

function mkLesson(studentId, seriesId, start, durationMin, createdAt) {
  var l = {
    id: 'ls_' + DB.lessons.length, publicId: null, studentId: studentId, seriesId: seriesId,
    start: iso(start), durationMin: durationMin, state: 'scheduled',
    cancelledAt: null, lateCancel: false, stateSetAt: null,
    location: DB.studio.defaultLocation,
    createdAt: iso(createdAt || start), legacy: true
  };
  DB.lessons.push(l);
  return l;
}

/* Materialize occurrences from series start through the horizon (I03-R01) */
function materializeSeries(s, today) {
  var horizonEnd = s.boundaryType === 'ongoing'
    ? addWeeks(today, s.horizonWeeks)
    : new Date(s.endDate);
  var cursor = new Date(s.startDate);
  while (cursor.getDay() !== s.dayOfWeek) cursor = addDays(cursor, 1);
  var guard = 0;
  while (cursor <= horizonEnd && guard++ < 400) {
    mkLesson(s.studentId, s.id, atTime(cursor, s.time), s.durationMin, s.startDate);
    cursor = addWeeks(cursor, 1);
  }
  s.lastMaterialized = iso(addDays(cursor, -7));
}

function mkNotification(type, recipient, sentAt, refs) {
  var n = {
    id: 'nt_' + DB.notifications.length, publicId: null, type: type, recipient: recipient,
    sentAt: iso(sentAt), lessonId: refs.lessonId || null, invoiceId: refs.invoiceId || null,
    studentId: refs.studentId || null, receiptId: refs.receiptId || null,
    subject: notificationSubject(type, refs), events: [], legacy: true
  };
  /* delivery event sequence — current state is the most recent event (I05-R01) */
  pushEvent(n, 'queued', sentAt);
  pushEvent(n, 'sent', new Date(new Date(sentAt).getTime() + 4000));
  pushEvent(n, 'delivered', new Date(new Date(sentAt).getTime() + 21000));
  DB.notifications.push(n);
  return n;
}

function pushEvent(n, state, at) {
  n.events.push({ seq: n.events.length + 1, state: state, at: iso(at || new Date()) });
}

function notificationSubject(type, refs) {
  var map = {
    invite: 'Your student portal is ready',
    reminder: 'Lesson reminder',
    invoice: 'New invoice from your studio',
    receipt: 'Payment receipt',
    cancellation: 'Lesson cancelled',
    reschedule: 'Your lesson series changed',
    unpaid_alert: 'Invoice still unpaid',
    payment_failed: 'Payment did not go through'
  };
  return map[type] || type;
}

function mkNote(targetType, targetId, content, visibility) {
  var n = {
    id: 'no_' + DB.notes.length, publicId: null, targetType: targetType, targetId: targetId,
    author: DB.studio.teacherName, content: content, visibility: visibility,
    createdAt: iso(new Date()), edits: [], deleted: false, legacy: true
  };
  DB.notes.push(n);
  return n;
}

/* ---------- lookups ---------- */
function studentById(id) { return DB.students.filter(function (s) { return s.id === id; })[0]; }
function lessonById(id) { return DB.lessons.filter(function (l) { return l.id === id; })[0]; }
function invoiceById(id) { return DB.invoices.filter(function (i) { return i.id === id; })[0]; }
function seriesById(id) { return DB.series.filter(function (s) { return s.id === id; })[0]; }
function studentByPublicId(pid) { return DB.students.filter(function (s) { return s.publicId === pid; })[0]; }
/* the live entry for a lesson, if any; withdrawn entries are kept for audit
   but are never the one a caller acts on */
function entryForLesson(id) {
  var all = DB.billingEntries.filter(function (e) { return e.lessonId === id; });
  var live = all.filter(function (e) { return !e.voided; });
  return live.length ? live[live.length - 1] : all[all.length - 1];
}
function withdrawnEntries(id) {
  return DB.billingEntries.filter(function (e) { return e.lessonId === id && e.voided; });
}

function logActivity(actor, text, refs) {
  DB.activity.unshift({
    at: iso(new Date()), actor: actor, text: text,
    lessonId: refs.lessonId || null, studentId: refs.studentId || null,
    invoiceId: refs.invoiceId || null, kind: refs.kind || 'event'
  });
}

/* ---------- legacy invoice issuance used only by the seed ---------- */
function issueLegacyInvoice(student, entries, issuedAt, paid) {
  var inv = {
    id: 'in_' + DB.invoices.length, publicId: null, studentId: student.id,
    type: 'per_lesson', status: paid ? 'paid' : 'issued',
    issuedAt: iso(issuedAt), dueAt: iso(addDays(issuedAt, 14)),
    lines: [], total: 0, flaggedForReview: false, snapshots: [], legacy: true, voidReason: null
  };
  entries.forEach(function (e) {
    var l = lessonById(e.lessonId);
    inv.lines.push({
      lessonId: l.id, lessonPublicId: null, date: l.start,
      stateAtIssue: l.state, rate: e.amount, total: e.amount,
      policyNote: DB.studio.policyNote, policyVerified: false,
      periodLabel: null, kind: e.kind
    });
    inv.total += e.amount;
    e.invoiceId = inv.id;
  });
  DB.invoices.push(inv);

  if (paid) {
    var pay = { id: 'pa_' + DB.payments.length, publicId: null, invoiceId: inv.id, amount: inv.total, paidAt: iso(addDays(issuedAt, 3)), method: 'Stripe Checkout', legacy: true };
    DB.payments.push(pay);
    var rcp = { id: 'rc_' + DB.receipts.length, publicId: null, paymentId: pay.id, invoiceId: inv.id, issuedAt: pay.paidAt, legacy: true };
    DB.receipts.push(rcp);
    mkNotification('receipt', student.email, pay.paidAt, { invoiceId: inv.id, receiptId: rcp.id, studentId: student.id });
  }
  mkNotification('invoice', student.email, issuedAt, { invoiceId: inv.id, studentId: student.id });
  return inv;
}

/* ============================================================
   IDENTIFIER MIGRATION (I01-R01, I01-R02)
   Backfill in ascending creation order. Ties broken by the lower
   internal ordering key. No record skipped, no sequence reused.
   Field values, associations, amounts and statuses are untouched.
   ============================================================ */
function runIdentifierMigration() {
  function backfill(list, prefix, keyFn) {
    list.slice().sort(function (a, b) {
      var ta = new Date(keyFn(a)).getTime(), tb = new Date(keyFn(b)).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    }).forEach(function (r) {
      if (!r.publicId) r.publicId = nextId(prefix);
    });
  }
  backfill(DB.students, 'STU', function (r) { return r.createdAt; });
  backfill(DB.lessons, 'LSN', function (r) { return r.createdAt; });
  backfill(DB.invoices, 'INV', function (r) { return r.issuedAt; });
  backfill(DB.payments, 'PAY', function (r) { return r.paidAt; });
  backfill(DB.receipts, 'RCP', function (r) { return r.issuedAt; });
  backfill(DB.notifications, 'NOT', function (r) { return r.sentAt; });
  backfill(DB.notes, 'NTE', function (r) { return r.createdAt; });

  /* invoice lines carry the lesson identifier, resolved after backfill (I06-R01) */
  DB.invoices.forEach(function (inv) {
    inv.lines.forEach(function (ln) {
      if (ln.lessonId) ln.lessonPublicId = lessonById(ln.lessonId).publicId;
    });
  });
  DB.migrationRunAt = iso(new Date());
}
