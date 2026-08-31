/* ============================================================
   Cadence — screens
   ============================================================ */

var UI = (function () {

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function uid(id, cls) { return id ? '<span class="uid ' + (cls || '') + '">' + esc(id) + '<span class="lock">&#9679;</span></span>' : '<span class="muted tiny">—</span>'; }
  function stateBadge(s) { var m = LESSON_STATES[s]; return '<span class="badge ' + m.badge + '">' + m.label + '</span>'; }
  function invBadge(i) {
    var m = { issued: ['b-issued', 'Issued'], paid: ['b-paid', 'Paid'], void: ['b-void', 'Void'] }[i.status];
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>' +
      (i.flaggedForReview ? ' <span class="badge b-flag">Review</span>' : '');
  }
  function card(title, bodyHtml, opts) {
    opts = opts || {};
    return '<section class="card">' +
      (title ? '<header><h3>' + title + '</h3>' + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + (opts.head || '') + '</header>' : '') +
      '<div class="body' + (opts.tight ? ' tight' : '') + '">' + bodyHtml + '</div></section>';
  }
  function empty(title, msg) { return '<div class="empty"><strong>' + title + '</strong>' + msg + '</div>'; }
  function head(title, lede, actions) {
    return '<div class="page-head"><div><h1>' + title + '</h1>' +
      (lede ? '<p class="lede">' + lede + '</p>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  }
  function btn(label, act, cls, data) {
    var attrs = '';
    for (var k in (data || {})) attrs += ' data-' + k + '="' + esc(data[k]) + '"';
    return '<button class="btn ' + (cls || '') + '" data-act="' + act + '"' + attrs + '>' + label + '</button>';
  }

  /* ==========================================================
     TEACHER — Dashboard
     ========================================================== */
  function dashboard() {
    var now = new Date();
    var upcoming = DB.lessons.filter(function (l) { return l.state === 'scheduled' && new Date(l.start) >= now; })
      .sort(function (a, b) { return new Date(a.start) - new Date(b.start); }).slice(0, 6);
    var open = DB.invoices.filter(function (i) { return i.status === 'issued'; });
    var openTotal = open.reduce(function (a, i) { return a + i.total; }, 0);
    var unb = Engine.unbilledEntries(null);
    var unbTotal = unb.reduce(function (a, e) { return a + e.amount; }, 0);

    var stats = '<div class="grid g4">' +
      statCard('Unpaid invoices', money(openTotal), open.length + ' open') +
      statCard('Ready to invoice', money(unbTotal), unb.length + ' unbilled lesson' + (unb.length === 1 ? '' : 's')) +
      statCard('Active students', String(DB.students.filter(function (s) { return s.portalStatus === 'active'; }).length), DB.students.length + ' on the roster') +
      statCard('Lessons this week', String(DB.lessons.filter(function (l) {
        var d = new Date(l.start), w = startOfWeek(now);
        return d >= w && d < addDays(w, 7);
      }).length), 'scheduled and past') + '</div>';

    var up = upcoming.length ? '<table><thead><tr><th>Lesson</th><th>Student</th><th>When</th><th>State</th></tr></thead><tbody>' +
      upcoming.map(function (l) {
        var s = studentById(l.studentId);
        return '<tr class="rowlink" data-act="lesson" data-id="' + l.id + '"><td>' + uid(l.publicId) + '</td>' +
          '<td>' + esc(s.name) + '</td><td class="mono tiny">' + fmtStamp(l.start) + '</td>' +
          '<td>' + stateBadge(l.state) + '</td></tr>';
      }).join('') + '</tbody></table>'
      : empty('No lessons scheduled', 'Open the calendar to book a lesson or start a series.');

    var inv = open.length ? '<table><thead><tr><th>Invoice</th><th>Student</th><th>Due</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
      open.map(function (i) {
        var s = studentById(i.studentId);
        return '<tr class="rowlink" data-act="invoice" data-id="' + i.id + '"><td>' + uid(i.publicId) + '</td>' +
          '<td>' + esc(s.name) + '</td><td class="tiny mono">' + fmtDate(i.dueAt) + '</td>' +
          '<td class="num">' + money(i.total) + '</td>' +
          '<td style="text-align:right">' + btn('Send alert', 'alert-invoice', 'sm', { id: i.id }) + '</td></tr>';
      }).join('') + '</tbody></table>'
      : empty('Nothing outstanding', 'Every issued invoice has been paid.');

    var feed = '<ul class="timeline">' + DB.activity.slice(0, 8).map(function (a) {
      return '<li><span class="t">' + fmtStamp(a.at) + '</span><span>' + esc(a.text) + '</span></li>';
    }).join('') + '</ul>';

    return head('Dashboard', 'Rowan Street Music — everything owed, taught and sent, in one place.') +
      stats +
      '<div class="split">' +
      card('Next lessons', up, { tight: true }) +
      card('Recent activity', feed) +
      '</div>' +
      card('Unpaid invoices', inv, { tight: true, hint: 'Alerts create a notification record' });
  }

  function statCard(k, v, n) {
    return '<div class="card" style="margin:0"><div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + n + '</div></div></div>';
  }

  /* ==========================================================
     TEACHER — Calendar
     ========================================================== */
  function calendar(params) {
    var offset = +(params.w || 0);
    var wkStart = addDays(startOfWeek(new Date()), offset * 7);
    var today = new Date(); today.setHours(0, 0, 0, 0);

    var days = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(wkStart, i);
      var isToday = d.getTime() === today.getTime();
      var dayLessons = DB.lessons.filter(function (l) {
        var ld = new Date(l.start);
        return ld.toDateString() === d.toDateString();
      }).sort(function (a, b) { return new Date(a.start) - new Date(b.start); });

      days += '<div class="day' + (isToday ? ' today' : '') + '">' +
        '<div class="dh">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '<b>' + d.getDate() + '</b></div>' +
        dayLessons.map(function (l) {
          var s = studentById(l.studentId);
          return '<button class="chip s-' + l.state + '" data-act="lesson" data-id="' + l.id + '">' +
            '<span class="ct">' + fmtTime(l.start) + '</span> ' + esc(s.name.split(' ')[0]) +
            '<br>' + uid(l.publicId, 'sm') + '</button>';
        }).join('') + '</div>';
    }

    var label = fmtShort(wkStart) + ' – ' + fmtShort(addDays(wkStart, 6));
    return head('Calendar', 'Week view in ' + DB.studio.timezone + '. Click a lesson to change its state.',
      btn('New lesson', 'new-lesson', 'brass') + btn('New lesson series', 'new-series', 'primary')) +
      '<div class="card"><header><h3>' + label + '</h3>' +
      '<span class="hint">' + btn('&larr;', 'week', 'sm', { w: offset - 1 }) + ' ' +
      btn('Today', 'week', 'sm', { w: 0 }) + ' ' + btn('&rarr;', 'week', 'sm', { w: offset + 1 }) + '</span></header>' +
      '<div class="body tight"><div class="cal">' + days + '</div></div></div>' +
      seriesList();
  }

  function seriesList() {
    var rows = DB.series.map(function (s) {
      var st = studentById(s.studentId);
      var boundary = s.boundaryType === 'ongoing'
        ? 'Ongoing — 12-week horizon'
        : 'Ends ' + fmtDate(s.endDate);
      return '<tr class="rowlink" data-act="series" data-id="' + s.id + '">' +
        '<td>' + esc(st.name) + '</td>' +
        '<td class="tiny">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek] + ' ' + s.time + ' · ' + s.durationMin + ' min</td>' +
        '<td class="tiny">' + boundary + '</td>' +
        '<td class="tiny mono">' + (s.lastMaterialized ? fmtDate(s.lastMaterialized) : '—') + '</td>' +
        '<td class="num">' + s.revisions.length + '</td></tr>';
    }).join('');
    return card('Recurring series', '<table><thead><tr><th>Student</th><th>Pattern</th><th>Boundary</th><th>Last materialized</th><th class="num">Revisions</th></tr></thead><tbody>' + rows + '</tbody></table>', { tight: true, hint: 'A revision touches future Scheduled occurrences only' });
  }

  /* ==========================================================
     TEACHER — Series detail with revision history (I03)
     ========================================================== */
  function series(params) {
    var s = seriesById(params.id);
    var st = studentById(s.studentId);
    var occ = DB.lessons.filter(function (l) { return l.seriesId === s.id; })
      .sort(function (a, b) { return new Date(a.start) - new Date(b.start); });

    var hist = s.revisions.length
      ? '<ul class="timeline">' + s.revisions.map(function (r) {
        return '<li><span class="t">#' + r.seq + ' ' + fmtStamp(r.at) + '</span><span>' +
          '<b>' + esc(r.actor) + '</b> changed ' +
          r.fields.map(function (f) { return esc(f.field) + ' <span class="mono tiny">' + esc(f.from) + ' &rarr; ' + esc(f.to) + '</span>'; }).join(', ') +
          '<br><span class="muted tiny">' + r.affected + ' scheduled occurrence(s) moved · ' + r.added + ' added · ' + r.removed + ' removed</span>' +
          '</span></li>';
      }).join('') + '</ul>'
      : empty('No revisions yet', 'Changing the day, time, duration or boundary records a revision here.');

    var occRows = occ.slice(0, 40).map(function (l) {
      return '<tr class="rowlink" data-act="lesson" data-id="' + l.id + '"><td>' + uid(l.publicId) + '</td>' +
        '<td class="tiny mono">' + fmtStamp(l.start) + '</td><td>' + stateBadge(l.state) + '</td></tr>';
    }).join('');

    return head('Series for ' + esc(st.name), 'A revision applies only to occurrences scheduled after it is saved and still in Scheduled state. Identifiers are retained — occurrences are rescheduled, not replaced.',
      btn('Revise series', 'revise-series', 'primary', { id: s.id }) + btn('Back to calendar', 'go', '', { route: 'calendar' })) +
      '<div class="split">' +
      card('Revision history', hist, { hint: 'Immutable, ascending' }) +
      card('Boundary', '<div class="stat" style="padding:0"><div class="k">Type</div><div class="v" style="font-size:16px">' +
        (s.boundaryType === 'ongoing' ? 'Ongoing' : 'Fixed end date') + '</div></div><hr style="border:0;border-top:1px solid var(--hair-soft);margin:12px 0">' +
        '<div class="tiny muted">Horizon</div><div class="mono">' + (s.boundaryType === 'ongoing' ? '12 weeks rolling' : fmtDate(s.endDate)) + '</div>' +
        '<div class="tiny muted" style="margin-top:10px">Last materialized lesson</div><div class="mono">' + fmtDate(s.lastMaterialized) + '</div>' +
        '<div class="tiny muted" style="margin-top:10px">Occurrences</div><div class="mono">' + occ.length + '</div>') +
      '</div>' +
      card('Occurrences', '<table><thead><tr><th>Lesson</th><th>When</th><th>State</th></tr></thead><tbody>' + occRows + '</tbody></table>', { tight: true, hint: 'first 40' });
  }

  /* ==========================================================
     TEACHER — Students
     ========================================================== */
  function students() {
    var rows = DB.students.map(function (s) {
      var b = Engine.balance(s.id);
      var portal = { active: ['b-completed', 'Portal active'], invited: ['b-scheduled', 'Invite pending'], none: ['b-neutral', 'Not invited'] }[s.portalStatus];
      return '<tr class="rowlink" data-act="student" data-id="' + s.id + '">' +
        '<td>' + uid(s.publicId) + '</td>' +
        '<td><b>' + esc(s.name) + '</b><br><span class="tiny muted mono">' + esc(s.email) + '</span></td>' +
        '<td class="tiny">' + (s.billingMode === 'monthly' ? 'Monthly ' + money(s.monthlyAmount) : money(s.rate) + ' per lesson') + '</td>' +
        '<td><span class="badge ' + portal[0] + '">' + portal[1] + '</span></td>' +
        '<td class="num">' + money(b.openInvoiced) + '</td>' +
        '<td class="num">' + money(b.unbilled) + '</td></tr>';
    }).join('');

    return head('Students', 'Rates, billing mode, reminder preference and portal access.',
      btn('Add student', 'new-student', 'brass')) +
      card('', '<table><thead><tr><th>ID</th><th>Student</th><th>Rate</th><th>Portal</th><th class="num">Invoiced &amp; unpaid</th><th class="num">Unbilled</th></tr></thead><tbody>' + rows + '</tbody></table>', { tight: true });
  }

  function student(params) {
    var s = studentById(params.id);
    var b = Engine.balance(s.id);
    var lessons = DB.lessons.filter(function (l) { return l.studentId === s.id; })
      .sort(function (a, b2) { return new Date(b2.start) - new Date(a.start); });
    var invs = DB.invoices.filter(function (i) { return i.studentId === s.id; });
    var acts = DB.activity.filter(function (a) { return a.studentId === s.id; }).slice(0, 12);
    var notes = Engine.notesFor('student', s.id, 'teacher');
    var mails = DB.notifications.filter(function (n) { return n.studentId === s.id; }).slice(0, 8);

    var lessonRows = lessons.slice(0, 14).map(function (l) {
      var e = entryForLesson(l.id);
      return '<tr class="rowlink" data-act="lesson" data-id="' + l.id + '"><td>' + uid(l.publicId) + '</td>' +
        '<td class="tiny mono">' + fmtStamp(l.start) + '</td><td>' + stateBadge(l.state) + '</td>' +
        '<td class="num tiny">' + (e && !e.voided ? money(e.amount) + (e.kind === 'late_cancel' ? ' <span class="badge b-billable">late</span>' : '') : '—') + '</td></tr>';
    }).join('');

    var invRows = invs.length ? invs.map(function (i) {
      return '<tr class="rowlink" data-act="invoice" data-id="' + i.id + '"><td>' + uid(i.publicId) + '</td>' +
        '<td class="tiny mono">' + fmtDate(i.issuedAt) + '</td><td>' + invBadge(i) + '</td>' +
        '<td class="num">' + money(i.total) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted tiny" style="padding:16px">No invoices yet.</td></tr>';

    var noteHtml = notes.map(function (n) {
      return '<div class="note" style="' + (n.visibility === 'private' ? 'border-left-color:var(--graphite);background:#F3F5F8;color:var(--graphite)' : '') + '">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">' + uid(n.publicId, 'sm') +
        '<span class="badge ' + (n.visibility === 'shared' ? 'b-completed' : 'b-neutral') + '">' + (n.visibility === 'shared' ? 'Shared with student' : 'Private') + '</span>' +
        '<span class="tiny muted" style="margin-left:auto">' + fmtStamp(n.createdAt) + (n.edits.length ? ' · edited' : '') + '</span></div>' +
        esc(n.content) + '</div>';
    }).join('') || '<p class="muted tiny">No notes on this student yet.</p>';

    return head(esc(s.name) + ' ' + uid(s.publicId), esc(s.email),
      btn('Add note', 'new-note', '', { t: 'student', id: s.id }) +
      (s.portalStatus !== 'active' ? btn('Send invite', 'send-invite', 'brass', { id: s.id }) : '') +
      btn('Create invoice', 'new-invoice', 'primary', { id: s.id }) +
      btn('Back', 'go', '', { route: 'students' })) +
      '<div class="grid g4">' +
      statCard('Invoiced &amp; unpaid', money(b.openInvoiced), b.openCount + ' invoice(s)') +
      statCard('Unbilled', money(b.unbilled), b.unbilledCount + ' lesson(s)') +
      statCard('Rate', s.billingMode === 'monthly' ? money(s.monthlyAmount) + '/mo' : money(s.rate), s.billingMode === 'monthly' ? 'monthly tuition' : 'per lesson') +
      statCard('Reminders', s.unsubscribed ? 'Off' : s.reminderHours + ' h', s.unsubscribed ? 'unsubscribed' : 'before each lesson') +
      '</div>' +
      '<div class="split">' +
      card('Lessons', '<table><thead><tr><th>ID</th><th>When</th><th>State</th><th class="num">Billable</th></tr></thead><tbody>' + lessonRows + '</tbody></table>', { tight: true, hint: 'latest 14' }) +
      card('Notes', noteHtml, { hint: 'Private notes never reach the portal' }) +
      '</div>' +
      '<div class="split">' +
      card('Invoices', '<table><thead><tr><th>ID</th><th>Issued</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>' + invRows + '</tbody></table>', { tight: true }) +
      card('Activity', acts.length ? '<ul class="timeline">' + acts.map(function (a) {
        return '<li><span class="t">' + fmtStamp(a.at) + '</span><span>' + esc(a.text) + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted tiny">Nothing recorded yet.</p>') +
      '</div>' +
      card('Email history', mails.length ? '<table><thead><tr><th>ID</th><th>Type</th><th>Sent</th><th>Delivery</th></tr></thead><tbody>' +
        mails.map(function (n) {
          return '<tr class="rowlink" data-act="notification" data-id="' + n.id + '"><td>' + uid(n.publicId) + '</td>' +
            '<td class="tiny">' + esc(n.type) + '</td><td class="tiny mono">' + fmtStamp(n.sentAt) + '</td>' +
            '<td><span class="badge b-neutral">' + esc(n.events[n.events.length - 1].state) + '</span></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted tiny">No email sent yet.</p>', { tight: true });
  }

  /* ==========================================================
     TEACHER — Unbilled lessons (I04, I07)
     ========================================================== */
  function unbilled() {
    var entries = Engine.unbilledEntries(null);
    var rows = entries.map(function (e) {
      var l = lessonById(e.lessonId), s = studentById(l.studentId);
      return '<tr><td>' + uid(l.publicId) + '</td><td>' + esc(s.name) + '</td>' +
        '<td class="tiny mono">' + fmtStamp(l.start) + '</td><td>' + stateBadge(l.state) + '</td>' +
        '<td>' + (e.kind === 'late_cancel' ? '<span class="badge b-billable">Late cancel · ' + DB.studio.lateCancelChargePct + '%</span>' : '<span class="badge b-neutral">Full rate</span>') + '</td>' +
        '<td class="num">' + money(e.amount) + '</td></tr>';
    }).join('');

    var total = entries.reduce(function (a, e) { return a + e.amount; }, 0);

    return head('Unbilled lessons', 'A lesson already covered by an issued or paid invoice never appears here, and no lesson appears twice.',
      btn('Create invoice', 'new-invoice', 'primary', {})) +
      (entries.length
        ? card('', '<table><thead><tr><th>Lesson</th><th>Student</th><th>When</th><th>State</th><th>Charge</th><th class="num">Amount</th></tr></thead><tbody>' + rows +
          '</tbody><tfoot><tr><td colspan="5" style="text-align:right;font-weight:600;padding:10px 16px">Total ready to invoice</td><td class="num" style="font-weight:600;padding:10px 16px">' + money(total) + '</td></tr></tfoot></table>', { tight: true })
        : card('', empty('Everything is invoiced', 'Completed and no-show lessons appear here, along with late cancellations at ' + DB.studio.lateCancelChargePct + '% of the rate.')));
  }

  /* ==========================================================
     TEACHER — Invoices
     ========================================================== */
  function invoices() {
    var rows = DB.invoices.slice().sort(function (a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); }).map(function (i) {
      var s = studentById(i.studentId);
      return '<tr class="rowlink" data-act="invoice" data-id="' + i.id + '"><td>' + uid(i.publicId) + '</td>' +
        '<td>' + esc(s.name) + '</td><td class="tiny">' + (i.type === 'monthly' ? 'Monthly' : i.lines.length + ' lesson line(s)') + '</td>' +
        '<td class="tiny mono">' + fmtDate(i.issuedAt) + '</td><td>' + invBadge(i) + '</td>' +
        '<td class="num">' + money(i.total) + '</td>' +
        '<td style="text-align:right">' + btn('PDF', 'pdf', 'sm', { id: i.id }) + '</td></tr>';
    }).join('');

    return head('Invoices', 'Every invoice is composed of explicit lines. Each line records the rate and policy note in force when the invoice was issued.',
      btn('Create invoice', 'new-invoice', 'primary', {})) +
      card('', '<table><thead><tr><th>ID</th><th>Student</th><th>Composition</th><th>Issued</th><th>Status</th><th class="num">Total</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>', { tight: true });
  }

  function invoice(params) {
    var i = invoiceById(params.id);
    var s = studentById(i.studentId);
    var pay = DB.payments.filter(function (p) { return p.invoiceId === i.id; })[0];
    var rcp = DB.receipts.filter(function (r) { return r.invoiceId === i.id; })[0];
    var notes = Engine.notesFor('invoice', i.id, 'teacher');

    var lineRows = i.lines.map(function (ln) {
      return '<tr><td>' + (ln.lessonPublicId ? uid(ln.lessonPublicId) : '<span class="tiny">' + esc(ln.periodLabel) + '</span>') + '</td>' +
        '<td class="tiny mono">' + (ln.date ? fmtDate(ln.date) : '—') + '</td>' +
        '<td>' + (ln.stateAtIssue ? stateBadge(ln.stateAtIssue) : '<span class="badge b-neutral">Period</span>') + '</td>' +
        '<td class="num">' + money(ln.rate) + '</td>' +
        '<td class="num">' + money(ln.total) + '</td></tr>';
    }).join('');

    var policy = i.lines.length
      ? '<div class="note">Policy captured at issue: “' + esc(i.lines[0].policyNote) + '”' +
      (i.lines[0].policyVerified ? '' : ' <span class="badge b-flag" style="margin-left:6px">not historically verified</span>') + '</div>'
      : '';

    var snaps = i.snapshots.length ? '<table><thead><tr><th>#</th><th>Generated</th><th>By</th><th class="num">Lines</th><th class="num">Total</th></tr></thead><tbody>' +
      i.snapshots.slice().reverse().map(function (sn) {
        return '<tr><td class="mono">' + sn.seq + '</td><td class="tiny mono">' + fmtStamp(sn.at) + '</td>' +
          '<td class="tiny">' + esc(sn.by) + '</td><td class="num">' + sn.lines.length + '</td><td class="num">' + money(sn.total) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted tiny">No snapshot yet.</p>';

    var noteHtml = notes.map(function (n) {
      return '<div class="note" style="' + (n.visibility === 'private' ? 'border-left-color:var(--graphite);background:#F3F5F8;color:var(--graphite)' : '') + '">' +
        uid(n.publicId, 'sm') + ' <span class="badge ' + (n.visibility === 'shared' ? 'b-completed' : 'b-neutral') + '">' +
        (n.visibility === 'shared' ? 'Shared' : 'Private') + '</span><br>' + esc(n.content) + '</div>';
    }).join('') || '<p class="muted tiny">No notes on this invoice.</p>';

    var actions = btn('Regenerate PDF', 'regen', 'brass', { id: i.id }) +
      btn('Add note', 'new-note', '', { t: 'invoice', id: i.id }) +
      (i.status === 'issued' ? btn('Send alert', 'alert-invoice', '', { id: i.id }) : '') +
      btn('Back', 'go', '', { route: 'invoices' });

    return head('Invoice ' + esc(i.publicId), esc(s.name) + ' · issued ' + fmtDate(i.issuedAt) + ' · due ' + fmtDate(i.dueAt), actions) +
      (i.status === 'void' ? '<div class="refusal"><b>This invoice is void.</b> ' + esc(i.voidReason || '') + ' Its identifier, lines and captured rates are retained and its number is never reused.</div>' : '') +
      (i.flaggedForReview ? '<div class="refusal"><b>Flagged for review.</b> A paid duplicate was detected. Nothing was voided and no refund was initiated.</div>' : '') +
      policy +
      '<div class="split">' +
      card('Lines', '<table><thead><tr><th>Covers</th><th>Date</th><th>State at issue</th><th class="num">Rate applied</th><th class="num">Line total</th></tr></thead><tbody>' + lineRows +
        '</tbody><tfoot><tr><td colspan="4" style="text-align:right;font-weight:600;padding:10px 16px">Invoice total</td><td class="num" style="font-weight:600;padding:10px 16px">' + money(i.total) + '</td></tr></tfoot></table>', { tight: true, hint: 'total equals the sum of the lines' }) +
      card('Status', '<div style="margin-bottom:10px">' + invBadge(i) + '</div>' +
        (pay ? '<div class="tiny muted">Payment</div><div>' + uid(pay.publicId) + ' <span class="mono">' + money(pay.amount) + '</span><br><span class="tiny muted">' + fmtStamp(pay.paidAt) + ' · ' + esc(pay.method) + '</span></div>' : '<p class="muted tiny">Not paid.</p>') +
        (rcp ? '<div class="tiny muted" style="margin-top:10px">Receipt</div><div>' + uid(rcp.publicId) + '</div>' : '') +
        '<div class="tiny muted" style="margin-top:12px">PDF history</div><div class="mono">' + i.snapshots.length + ' of 5 retained · next #' + ((i.snapshotSeq || 0) + 1) + '</div>') +
      '</div>' +
      '<div class="split">' +
      card('PDF snapshot history', snaps, { tight: true, hint: 'five most recent; numbering never reused' }) +
      card('Notes', noteHtml) +
      '</div>';
  }

  /* ==========================================================
     TEACHER — Emails / notifications (I05)
     ========================================================== */
  function emails() {
    var rows = DB.notifications.slice().sort(function (a, b) { return new Date(b.sentAt) - new Date(a.sentAt); }).map(function (n) {
      var last = n.events[n.events.length - 1];
      var cls = last.state === 'failed' ? 'b-flag' : (last.state === 'delivered' || last.state === 'opened' ? 'b-completed' : 'b-neutral');
      return '<tr class="rowlink" data-act="notification" data-id="' + n.id + '"><td>' + uid(n.publicId) + '</td>' +
        '<td class="tiny">' + esc(n.type) + '</td><td class="tiny mono">' + esc(n.recipient) + '</td>' +
        '<td class="tiny">' + esc(n.subject) + '</td><td class="tiny mono">' + fmtStamp(n.sentAt) + '</td>' +
        '<td><span class="badge ' + cls + '">' + esc(last.state) + '</span></td></tr>';
    }).join('');
    return head('Email activity', 'Every email the studio sends creates a notification record with its own identifier and an ordered delivery event history.') +
      card('', '<table><thead><tr><th>ID</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Sent</th><th>Current state</th></tr></thead><tbody>' + rows + '</tbody></table>', { tight: true });
  }

  function notification(params) {
    var n = DB.notifications.filter(function (x) { return x.id === params.id; })[0];
    var events = '<ul class="timeline">' + n.events.map(function (e) {
      return '<li><span class="t">#' + e.seq + ' ' + fmtStamp(e.at) + '</span><span><b>' + esc(e.state) + '</b></span></li>';
    }).join('') + '</ul>';
    return head('Notification ' + esc(n.publicId), esc(n.subject) + ' → ' + esc(n.recipient),
      btn('Resend', 'resend', 'brass', { id: n.id }) + btn('Back', 'go', '', { route: 'emails' })) +
      '<div class="split">' +
      card('Delivery events', events, { hint: 'never edited; resending creates a new record' }) +
      card('References', '<div class="tiny muted">Type</div><div>' + esc(n.type) + '</div>' +
        (n.lessonId ? '<div class="tiny muted" style="margin-top:8px">Lesson</div><div>' + uid(lessonById(n.lessonId).publicId) + '</div>' : '') +
        (n.invoiceId ? '<div class="tiny muted" style="margin-top:8px">Invoice</div><div>' + uid(invoiceById(n.invoiceId).publicId) + '</div>' : '') +
        (n.studentId ? '<div class="tiny muted" style="margin-top:8px">Student</div><div>' + uid(studentById(n.studentId).publicId) + '</div>' : '')) +
      '</div>';
  }

  /* ==========================================================
     TEACHER — Access log (I10 evidence surface)
     ========================================================== */
  function access() {
    var rows = DB.accessLog.slice(0, 60).map(function (a) {
      return '<tr><td class="tiny mono">' + fmtStamp(a.at) + '</td><td class="tiny">' + esc(a.kind) + '</td>' +
        '<td class="tiny mono">' + esc(a.publicId) + '</td><td class="tiny">' + esc(a.by || '—') + '</td>' +
        '<td><span class="badge ' + (a.granted ? 'b-completed' : 'b-flag') + '">' + (a.granted ? 'granted' : 'refused') + '</span></td>' +
        '<td class="tiny muted">' + esc(a.reason) + '</td></tr>';
    }).join('');
    var invites = DB.invitations.map(function (i) {
      var s = studentById(i.studentId);
      return '<tr><td class="tiny mono">' + esc(i.token) + '</td><td>' + esc(s.name) + '</td>' +
        '<td class="tiny mono">' + fmtDate(i.sentAt) + '</td>' +
        '<td><span class="badge ' + (i.consumed ? 'b-neutral' : 'b-completed') + '">' + (i.consumed ? 'consumed' : 'open') + '</span></td>' +
        '<td style="text-align:right">' + btn('Open link', 'try-invite', 'sm', { token: i.token }) + '</td></tr>';
    }).join('');

    return head('Portal access', 'Every portal read is scoped to the authenticated student. A record owned by someone else is refused with exactly the message shown for a record that does not exist.') +
      card('Invitation links', '<table><thead><tr><th>Token</th><th>Student</th><th>Sent</th><th>State</th><th></th></tr></thead><tbody>' + invites + '</tbody></table>', { tight: true, hint: 'single use' }) +
      card('Access attempts', rows ? '<table><thead><tr><th>When</th><th>Kind</th><th>Requested</th><th>By</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>' + rows + '</tbody></table>' : empty('No attempts recorded', 'Use the portal to open a record that belongs to another student and it will be logged here.'), { tight: true, hint: 'teacher-only diagnostic' });
  }

  /* ==========================================================
     TEACHER — Settings
     ========================================================== */
  function settings() {
    var s = DB.studio;
    return head('Settings', 'Studio profile and the cancellation policy that drives late-cancel billing.') +
      '<div class="split">' +
      card('Studio profile',
        fld('Studio name', 'studio-name', s.name) +
        fld('Teacher', 'studio-teacher', s.teacherName) +
        '<div class="row">' + fld('Timezone', 'studio-tz', s.timezone) + fld('Default duration (min)', 'studio-dur', s.defaultDuration, 'number') + '</div>' +
        fld('Default location', 'studio-loc', s.defaultLocation) +
        btn('Save studio profile', 'save-studio', 'primary')) +
      card('Cancellation policy',
        '<div class="row">' + fld('Late window (hours before start)', 'pol-window', s.lateCancelWindowHours, 'number') +
        fld('Late charge (% of rate)', 'pol-pct', s.lateCancelChargePct, 'number') + '</div>' +
        '<div class="field"><label>Policy note shown to students</label><textarea id="pol-note" rows="3">' + esc(s.policyNote) + '</textarea></div>' +
        btn('Save policy', 'save-policy', 'primary') +
        '<div class="note" style="margin-top:12px">Changing this note never alters a line on an invoice already issued. Each line keeps the note in force at its own issue time.</div>') +
      '</div>' +
      card('Identifier sequences', '<table><thead><tr><th>Entity</th><th>Prefix</th><th class="num">Next number</th></tr></thead><tbody>' +
        [['Students', 'STU'], ['Lessons', 'LSN'], ['Invoices', 'INV'], ['Payments', 'PAY'], ['Receipts', 'RCP'], ['Notifications', 'NOT'], ['Notes', 'NTE']].map(function (p) {
          return '<tr><td>' + p[0] + '</td><td>' + uid(p[1] + '-' + String((DB.sequences[p[1]] || 0)).padStart(6, '0')) + '</td>' +
            '<td class="num mono">' + String((DB.sequences[p[1]] || 0) + 1).padStart(6, '0') + '</td></tr>';
        }).join('') + '</tbody></table>', { tight: true, hint: 'per studio, never reused, no edit control anywhere' });
  }

  function fld(label, id, val, type) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val) + '"></div>';
  }

  /* ==========================================================
     STUDENT PORTAL — scoped to the authenticated student (I10)
     ========================================================== */
  function pOverview() {
    var s = studentById(DB.session.studentId);
    var now = new Date();
    var next = DB.lessons.filter(function (l) { return l.studentId === s.id && l.state === 'scheduled' && new Date(l.start) >= now; })
      .sort(function (a, b) { return new Date(a.start) - new Date(b.start); })[0];
    var due = DB.invoices.filter(function (i) { return i.studentId === s.id && i.status === 'issued'; });
    var shared = Engine.notesFor('student', s.id, 'student');

    return head('Hello, ' + esc(s.name.split(' ')[0]), 'Your lessons, invoices and receipts at ' + esc(DB.studio.name) + '.') +
      '<div class="split">' +
      card('Next lesson', next
        ? '<div class="stat" style="padding:0"><div class="k">' + fmtDate(next.start) + '</div><div class="v" style="font-size:20px">' + fmtTime(next.start) + '</div>' +
        '<div class="n">' + next.durationMin + ' minutes · ' + esc(next.location) + '</div></div>' +
        '<div style="margin-top:10px">' + uid(next.publicId) + ' ' + stateBadge(next.state) + '</div>'
        : empty('Nothing scheduled', 'Your teacher will book your next lesson.')) +
      card('Invoices due', due.length ? due.map(function (i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--hair-soft)">' +
          '<div>' + uid(i.publicId) + '<div class="tiny muted">due ' + fmtDate(i.dueAt) + '</div></div>' +
          '<div class="money" style="margin-left:auto;font-size:15px">' + money(i.total) + '</div>' +
          btn('Pay now', 'pay', 'brass sm', { id: i.id }) + '</div>';
      }).join('') : empty('Nothing due', 'You are all settled up.')) +
      '</div>' +
      (shared.length ? card('Notes from your teacher', shared.map(function (n) {
        return '<div class="note">' + uid(n.publicId, 'sm') + '<br>' + esc(n.content) + '</div>';
      }).join('')) : '');
  }

  function pLessons() {
    var s = studentById(DB.session.studentId);
    var now = new Date();
    var mine = DB.lessons.filter(function (l) { return l.studentId === s.id; });
    var up = mine.filter(function (l) { return new Date(l.start) >= now; }).sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    var past = mine.filter(function (l) { return new Date(l.start) < now; }).sort(function (a, b) { return new Date(b.start) - new Date(a.start); }).slice(0, 20);

    var upRows = up.map(function (l) {
      var late = Engine.isLateCancel(l, new Date());
      return '<tr><td>' + uid(l.publicId) + '</td><td class="tiny mono">' + fmtStamp(l.start) + '</td>' +
        '<td>' + stateBadge(l.state) + '</td><td style="text-align:right">' +
        (l.state === 'scheduled'
          ? btn(late ? 'Cancel (billable)' : 'Cancel', 'p-cancel', 'sm' + (late ? ' danger' : ''), { id: l.id })
          : '<span class="tiny muted">—</span>') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted tiny" style="padding:16px">No upcoming lessons.</td></tr>';

    var pastRows = past.map(function (l) {
      var e = entryForLesson(l.id);
      return '<tr><td>' + uid(l.publicId) + '</td><td class="tiny mono">' + fmtStamp(l.start) + '</td>' +
        '<td>' + stateBadge(l.state) + '</td>' +
        '<td class="num tiny">' + (e && !e.voided ? money(e.amount) : '—') + '</td></tr>';
    }).join('');

    return head('My lessons', 'Cancelling inside ' + DB.studio.lateCancelWindowHours + ' hours of the start time is billed at ' + DB.studio.lateCancelChargePct + '% of your rate.') +
      '<div class="note">' + esc(DB.studio.policyNote) + '</div>' +
      card('Upcoming', '<table><thead><tr><th>Lesson</th><th>When</th><th>State</th><th></th></tr></thead><tbody>' + upRows + '</tbody></table>', { tight: true }) +
      card('History', '<table><thead><tr><th>Lesson</th><th>When</th><th>State</th><th class="num">Charged</th></tr></thead><tbody>' + pastRows + '</tbody></table>', { tight: true });
  }

  function pInvoices() {
    var s = studentById(DB.session.studentId);
    var mine = DB.invoices.filter(function (i) { return i.studentId === s.id && i.status !== 'void'; });
    var rows = mine.map(function (i) {
      var r = DB.receipts.filter(function (x) { return x.invoiceId === i.id; })[0];
      return '<tr class="rowlink" data-act="p-invoice" data-id="' + i.id + '"><td>' + uid(i.publicId) + '</td>' +
        '<td class="tiny mono">' + fmtDate(i.issuedAt) + '</td><td>' + invBadge(i) + '</td>' +
        '<td>' + (r ? uid(r.publicId) : '<span class="tiny muted">—</span>') + '</td>' +
        '<td class="num">' + money(i.total) + '</td>' +
        '<td style="text-align:right">' + (i.status === 'issued' ? btn('Pay with Stripe', 'pay', 'brass sm', { id: i.id }) : btn('Receipt PDF', 'pdf', 'sm', { id: i.id })) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted tiny" style="padding:16px">No invoices yet.</td></tr>';

    return head('Invoices &amp; receipts', 'Paid invoices download as receipts. Test card 4242 4242 4242 4242, any future expiry.') +
      card('', '<table><thead><tr><th>Invoice</th><th>Issued</th><th>Status</th><th>Receipt</th><th class="num">Total</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>', { tight: true }) +
      card('Try a direct link', '<p class="tiny muted">Portal reads are scoped to you. Paste any invoice identifier — including one belonging to another student — and the portal answers the same way for a record you do not own and a record that does not exist.</p>' +
        '<div class="row"><div class="field" style="margin:0"><label>Invoice identifier</label><input id="probe" placeholder="INV-000001"></div>' +
        '<div style="flex:0 0 auto;align-self:end">' + btn('Open', 'probe', 'primary') + '</div></div>');
  }

  function pInvoice(params) {
    var res = Engine.portalFetch('invoice', params.pid, DB.session.studentId);
    if (!res.ok) {
      return head('Invoice', '') + '<div class="refusal"><b>' + esc(res.error) + '</b></div>' +
        btn('Back to invoices', 'go', 'primary', { route: 'p-invoices' });
    }
    var i = res.value;
    var r = DB.receipts.filter(function (x) { return x.invoiceId === i.id; })[0];
    var notes = Engine.notesFor('invoice', i.id, 'student');
    var lineRows = i.lines.map(function (ln) {
      return '<tr><td>' + (ln.lessonPublicId ? uid(ln.lessonPublicId) : '<span class="tiny">' + esc(ln.periodLabel) + '</span>') + '</td>' +
        '<td class="tiny mono">' + (ln.date ? fmtDate(ln.date) : '—') + '</td>' +
        '<td>' + (ln.stateAtIssue ? stateBadge(ln.stateAtIssue) : '<span class="badge b-neutral">Period</span>') + '</td>' +
        '<td class="num">' + money(ln.total) + '</td></tr>';
    }).join('');

    return head('Invoice ' + esc(i.publicId), 'Issued ' + fmtDate(i.issuedAt) + ' · due ' + fmtDate(i.dueAt),
      (i.status === 'issued' ? btn('Pay with Stripe', 'pay', 'brass', { id: i.id }) : btn('Download receipt', 'pdf', '', { id: i.id })) +
      btn('Back', 'go', '', { route: 'p-invoices' })) +
      card('Lines', '<table><thead><tr><th>Lesson</th><th>Date</th><th>State at issue</th><th class="num">Amount</th></tr></thead><tbody>' + lineRows +
        '</tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:600;padding:10px 16px">Total</td><td class="num" style="font-weight:600;padding:10px 16px">' + money(i.total) + '</td></tr></tfoot></table>', { tight: true }) +
      (r ? card('Receipt', uid(r.publicId) + ' <span class="tiny muted">issued ' + fmtStamp(r.issuedAt) + '</span>') : '') +
      (i.snapshots.length ? card('PDF history', '<table><thead><tr><th>#</th><th>Generated</th><th class="num">Total</th></tr></thead><tbody>' +
        i.snapshots.slice().reverse().map(function (sn) {
          return '<tr><td class="mono">' + sn.seq + '</td><td class="tiny mono">' + fmtStamp(sn.at) + '</td><td class="num">' + money(sn.total) + '</td></tr>';
        }).join('') + '</tbody></table>', { tight: true }) : '') +
      (notes.length ? card('Notes from your teacher', notes.map(function (n) { return '<div class="note">' + esc(n.content) + '</div>'; }).join('')) : '');
  }

  function pPreferences() {
    var s = studentById(DB.session.studentId);
    return head('Preferences', 'Reminder timing and email settings. Invoices and receipts are always sent.') +
      card('Lesson reminders',
        '<div class="field"><label for="pref-hours">Remind me this many hours before a lesson (1–48)</label>' +
        '<input id="pref-hours" type="number" min="1" max="48" value="' + s.reminderHours + '"' + (s.unsubscribed ? ' disabled' : '') + '></div>' +
        '<div class="check" style="margin-bottom:14px"><input type="checkbox" id="pref-unsub"' + (s.unsubscribed ? ' checked' : '') + '>' +
        '<label for="pref-unsub" style="margin:0;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">Unsubscribe from lesson reminders</label></div>' +
        btn('Save preferences', 'save-prefs', 'primary')) +
      card('Your record', uid(s.publicId) + '<div class="tiny muted" style="margin-top:8px">Name</div><div>' + esc(s.name) + '</div>' +
        '<div class="tiny muted" style="margin-top:8px">Email</div><div class="mono tiny">' + esc(s.email) + '</div>' +
        '<div class="tiny muted" style="margin-top:8px">Rate</div><div class="mono">' + (s.billingMode === 'monthly' ? money(s.monthlyAmount) + ' / month' : money(s.rate) + ' per lesson') + '</div>');
  }

  return {
    esc: esc, uid: uid, stateBadge: stateBadge, invBadge: invBadge, card: card, head: head, btn: btn, fld: fld, empty: empty,
    dashboard: dashboard, calendar: calendar, series: series, students: students, student: student,
    unbilled: unbilled, invoices: invoices, invoice: invoice, emails: emails, notification: notification,
    access: access, settings: settings,
    pOverview: pOverview, pLessons: pLessons, pInvoices: pInvoices, pInvoice: pInvoice, pPreferences: pPreferences
  };
})();
