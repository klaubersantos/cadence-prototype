/* ============================================================
   Cadence — router, chrome, actions
   ============================================================ */

var App = (function () {
  var state = { route: 'gate', params: {}, modal: null };
  var root;

  var TEACHER_NAV = [
    ['Studio', [['dashboard', 'Dashboard'], ['calendar', 'Calendar'], ['students', 'Students']]],
    ['Money', [['unbilled', 'Unbilled lessons'], ['invoices', 'Invoices']]],
    ['Records', [['emails', 'Email activity'], ['access', 'Portal access'], ['settings', 'Settings']]]
  ];
  var PORTAL_NAV = [
    ['Your studio', [['p-overview', 'Overview'], ['p-lessons', 'My lessons'], ['p-invoices', 'Invoices & receipts'], ['p-preferences', 'Preferences']]]
  ];

  var ROUTES = {
    dashboard: UI.dashboard, calendar: UI.calendar, series: UI.series,
    students: UI.students, student: UI.student, unbilled: UI.unbilled,
    invoices: UI.invoices, invoice: UI.invoice, emails: UI.emails,
    notification: UI.notification, access: UI.access, settings: UI.settings,
    'p-overview': UI.pOverview, 'p-lessons': UI.pLessons, 'p-invoices': UI.pInvoices,
    'p-invoice': UI.pInvoice, 'p-preferences': UI.pPreferences
  };

  function go(route, params) {
    state.route = route;
    state.params = params || {};
    state.modal = null;
    window.scrollTo(0, 0);
    render();
  }

  function counts(key) {
    if (key === 'unbilled') return Engine.unbilledEntries(null).length;
    if (key === 'invoices') return DB.invoices.filter(function (i) { return i.status === 'issued'; }).length;
    if (key === 'students') return DB.students.length;
    if (key === 'emails') return DB.notifications.length;
    return null;
  }

  /* ---------- gate ---------- */
  function gate() {
    var people = DB.students.map(function (s) {
      return '<button class="persona" data-act="login" data-role="student" data-id="' + s.id + '">' +
        '<span class="av">' + UI.esc(s.name.split(' ').map(function (w) { return w[0]; }).join('')) + '</span>' +
        '<span><span class="nm">' + UI.esc(s.name) + '</span><br><span class="em">' + UI.esc(s.email) + '</span></span>' +
        '<span class="rt">' + (s.portalStatus === 'active'
          ? '<span class="badge b-completed">Portal active</span>'
          : '<span class="badge b-scheduled">Invite pending</span>') + '</span></button>';
    }).join('');

    return '<div class="gate"><div class="gate-card">' +
      '<div class="gate-head"><div class="word">Cadence</div>' +
      '<p>Music lesson studio billing — navigable prototype. Choose who you are signing in as. ' +
      'Everything you do here runs against the real rules engine, not a mockup.</p></div>' +
      '<div class="gate-body">' +
      '<label>Teacher</label>' +
      '<button class="persona" data-act="login" data-role="teacher">' +
      '<span class="av">MA</span><span><span class="nm">' + UI.esc(DB.studio.teacherName) + '</span><br>' +
      '<span class="em">' + UI.esc(DB.studio.teacherEmail) + '</span></span>' +
      '<span class="rt"><span class="badge b-billable">' + UI.esc(DB.studio.name) + '</span></span></button>' +
      '<label style="margin-top:16px">Students</label>' + people +
      '<div class="note" style="margin-top:16px">Signing in as a student with a pending invite exercises the invitation flow. ' +
      'A consumed link never grants access a second time.</div>' +
      '</div></div></div>';
  }

  /* ---------- chrome ---------- */
  function chrome(inner) {
    var isPortal = DB.session.role === 'student';
    var nav = (isPortal ? PORTAL_NAV : TEACHER_NAV).map(function (g) {
      return '<div class="nav-group">' + g[0] + '</div>' + g[1].map(function (r) {
        var c = counts(r[0]);
        return '<a href="#" data-act="go" data-route="' + r[0] + '" class="' + (state.route === r[0] ? 'on' : '') + '">' +
          r[1] + (c !== null ? '<span class="count">' + c + '</span>' : '') + '</a>';
      }).join('');
    }).join('');

    var who = isPortal ? studentById(DB.session.studentId).name : DB.studio.teacherName;
    var whoId = isPortal ? UI.uid(studentById(DB.session.studentId).publicId) : '';

    return '<div class="shell"><aside class="rail">' +
      '<div class="brand"><div class="word">Cadence</div><div class="sub">' +
      (isPortal ? 'Student portal' : UI.esc(DB.studio.name)) + '</div></div>' +
      '<div class="staff"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="rail-foot"><b>' + UI.esc(who) + '</b>' +
      (isPortal ? 'Student' : 'Teacher · owner') + '</div>' +
      '</aside><main class="main">' +
      '<div class="topbar"><button class="btn sm" data-act="menu">Menu</button>' +
      '<span class="tiny muted">' + (isPortal ? 'Portal reads are scoped to you' : 'Teacher view — full studio access') + '</span>' +
      '<span class="who">' + whoId + ' ' + UI.btn('Switch user', 'logout', 'sm') + '</span></div>' +
      '<div class="canvas">' + inner + '</div></main></div>' +
      (state.modal ? state.modal : '') +
      '<div class="toast-wrap" id="toasts"></div>';
  }

  function render() {
    if (state.route === 'gate') { root.innerHTML = gate(); return; }
    var fn = ROUTES[state.route] || UI.dashboard;
    root.innerHTML = chrome(fn(state.params));
  }

  /* ---------- toast ---------- */
  function toast(msg, isErr) {
    var wrap = document.getElementById('toasts');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function result(r, okMsg) {
    state.modal = null;                 /* an action always closes its dialog */
    if (r && r.ok) { render(); toast(okMsg || 'Done'); }
    else { render(); toast(r ? r.error : 'Something went wrong', true); }
  }

  /* ---------- modals ---------- */
  function modal(title, body, footer, wide) {
    state.modal = '<div class="scrim" data-act="close-scrim"><div class="modal' + (wide ? ' wide' : '') + '">' +
      '<header><h3>' + title + '</h3></header><div class="body">' + body + '</div>' +
      '<footer>' + footer + '</footer></div></div>';
    render();
  }

  function lessonModal(id) {
    var l = lessonById(id), s = studentById(l.studentId);
    var e = entryForLesson(l.id);
    var role = DB.session.role;
    var allowed = Engine.allowedTransitions(l, role);
    var blockReason = LESSON_STATES[l.state].terminal ? Engine.reversionBlockReason(l) : null;
    var notes = Engine.notesFor('lesson', l.id, role);

    var body =
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">' + UI.uid(l.publicId) + UI.stateBadge(l.state) +
      (l.lateCancel ? '<span class="badge b-billable">Late cancellation</span>' : '') + '</div>' +
      '<div class="row"><div><div class="tiny muted">Student</div><div>' + UI.esc(s.name) + ' ' + UI.uid(s.publicId, 'sm') + '</div></div>' +
      '<div><div class="tiny muted">When</div><div class="mono">' + fmtStamp(l.start) + '</div></div>' +
      '<div><div class="tiny muted">Duration</div><div class="mono">' + l.durationMin + ' min</div></div></div>' +
      '<div style="margin-top:12px"><div class="tiny muted">Billing</div><div>' +
      (e && !e.voided ? money(e.amount) + ' · ' + (e.kind === 'late_cancel' ? 'late-cancel charge' : 'full rate') +
        (e.invoiceId ? ' · on invoice ' + UI.uid(invoiceById(e.invoiceId).publicId) : ' · not yet invoiced')
        : (e && e.voided ? '<span class="muted">Charge withdrawn — ' + UI.esc(e.voidReason || '') + '</span>' : '<span class="muted">Not billable in this state</span>')) +
      '</div></div>' +
      (notes.length ? '<div style="margin-top:12px">' + notes.map(function (n) {
        return '<div class="note">' + UI.uid(n.publicId, 'sm') + ' ' + UI.esc(n.content) + '</div>';
      }).join('') + '</div>' : '') +
      (blockReason ? '<div class="refusal" style="margin-top:12px">' + UI.esc(blockReason) + '</div>' : '') +
      (LESSON_STATES[l.state].terminal && !blockReason && role === 'teacher'
        ? '<div class="note" style="margin-top:12px">This lesson is in a terminal state. Reverting it returns it to Scheduled, withdraws its charge and voids any unpaid invoice covering it — nothing is deleted.</div>' : '');

    var foot = allowed.map(function (t) {
      return UI.btn(LESSON_STATES[t].label, 'transition', t === 'completed' ? 'brass' : '', { id: l.id, to: t });
    }).join('') +
      (LESSON_STATES[l.state].terminal && !blockReason && role === 'teacher'
        ? UI.btn('Revert to Scheduled', 'revert', 'danger', { id: l.id }) : '') +
      (role === 'teacher' ? UI.btn('Add note', 'new-note', '', { t: 'lesson', id: l.id }) : '') +
      UI.btn('Close', 'close-modal', 'primary');

    modal('Lesson', body, foot);
  }

  function invoiceModal(studentId) {
    var opts = DB.students.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === studentId ? ' selected' : '') + '>' + UI.esc(s.name) + '</option>';
    }).join('');
    var body =
      '<div class="field"><label for="inv-student">Student</label><select id="inv-student">' + opts + '</select></div>' +
      '<div class="field"><label for="inv-mode">Billing mode</label><select id="inv-mode">' +
      '<option value="per_lesson">Per lesson — bill uninvoiced completed, no-show and late-cancelled lessons</option>' +
      '<option value="monthly">Monthly tuition — a single period line</option></select></div>' +
      '<div class="note">Lessons already covered by an issued or paid invoice are not eligible and will not be included. ' +
      'If nothing eligible remains, no invoice is produced.</div>';
    modal('Create invoice', body, UI.btn('Cancel', 'close-modal') + UI.btn('Create &amp; send email', 'do-invoice', 'primary'));
  }

  function studentModal() {
    var body =
      '<div class="row"><div class="field"><label for="ns-name">Name</label><input id="ns-name" placeholder="Harvey Specter"></div>' +
      '<div class="field"><label for="ns-email">Email</label><input id="ns-email" placeholder="harvey.specter@example.com"></div></div>' +
      '<div class="row"><div class="field"><label for="ns-rate">Rate per lesson (USD)</label><input id="ns-rate" type="number" value="60"></div>' +
      '<div class="field"><label for="ns-mode">Billing mode</label><select id="ns-mode"><option value="per_lesson">Per lesson</option><option value="monthly">Monthly</option></select></div>' +
      '<div class="field"><label for="ns-rem">Reminder (hours)</label><input id="ns-rem" type="number" value="24" min="1" max="48"></div></div>' +
      '<div class="note">The new student receives the next identifier in the studio sequence. It cannot be edited afterwards.</div>';
    modal('Add student', body, UI.btn('Cancel', 'close-modal') + UI.btn('Add student', 'do-student', 'primary'));
  }

  function seriesModal() {
    var opts = DB.students.map(function (s) { return '<option value="' + s.id + '">' + UI.esc(s.name) + '</option>'; }).join('');
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      .map(function (d, i) { return '<option value="' + i + '">' + d + '</option>'; }).join('');
    var body =
      '<div class="field"><label for="se-student">Student</label><select id="se-student">' + opts + '</select></div>' +
      '<div class="row"><div class="field"><label for="se-day">Day</label><select id="se-day">' + days + '</select></div>' +
      '<div class="field"><label for="se-time">Time</label><input id="se-time" type="time" value="16:00"></div>' +
      '<div class="field"><label for="se-dur">Duration (min)</label><input id="se-dur" type="number" value="45"></div></div>' +
      '<div class="field"><label for="se-bound">Boundary</label><select id="se-bound">' +
      '<option value="ongoing">Ongoing — materialize 12 weeks ahead</option>' +
      '<option value="end_date">Fixed end date</option></select></div>' +
      '<div class="field"><label for="se-end">End date (used only with a fixed boundary)</label><input id="se-end" type="date"></div>';
    modal('New lesson series', body, UI.btn('Cancel', 'close-modal') + UI.btn('Create series', 'do-series', 'primary'));
  }

  function reviseModal(id) {
    var s = seriesById(id);
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      .map(function (d, i) { return '<option value="' + i + '"' + (i === s.dayOfWeek ? ' selected' : '') + '>' + d + '</option>'; }).join('');
    var body =
      '<div class="row"><div class="field"><label for="rv-day">Day</label><select id="rv-day">' + days + '</select></div>' +
      '<div class="field"><label for="rv-time">Time</label><input id="rv-time" type="time" value="' + s.time + '"></div>' +
      '<div class="field"><label for="rv-dur">Duration (min)</label><input id="rv-dur" type="number" value="' + s.durationMin + '"></div></div>' +
      '<div class="field"><label for="rv-bound">Boundary</label><select id="rv-bound">' +
      '<option value="ongoing"' + (s.boundaryType === 'ongoing' ? ' selected' : '') + '>Ongoing — 12-week horizon</option>' +
      '<option value="end_date"' + (s.boundaryType === 'end_date' ? ' selected' : '') + '>Fixed end date</option></select></div>' +
      '<div class="field"><label for="rv-end">End date</label><input id="rv-end" type="date" value="' + (s.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : '') + '"></div>' +
      '<div class="note">Only occurrences dated after this save and still in Scheduled state are touched. ' +
      'Completed, no-show and cancelled occurrences are never modified, and identifiers are retained.</div>';
    modal('Revise series', body, UI.btn('Cancel', 'close-modal') + UI.btn('Save revision', 'do-revise', 'primary', { id: id }));
  }

  function noteModal(targetType, targetId) {
    var body =
      '<div class="field"><label for="nt-body">Note</label><textarea id="nt-body" rows="4" placeholder="What should be remembered about this?"></textarea></div>' +
      '<div class="field"><label for="nt-vis">Visibility</label><select id="nt-vis">' +
      '<option value="private">Private — instructor only</option>' +
      '<option value="shared">Shared — also visible in the student portal</option></select></div>';
    modal('Add note', body, UI.btn('Cancel', 'close-modal') +
      UI.btn('Save note', 'do-note', 'primary', { t: targetType, id: targetId }));
  }

  function pdfModal(invId) {
    var i = invoiceById(invId), s = studentById(i.studentId);
    var paid = i.status === 'paid';
    var body = '<div style="font-family:var(--serif)">' +
      '<div style="display:flex;align-items:flex-start"><div><div style="font-size:22px">' + UI.esc(DB.studio.name) + '</div>' +
      '<div class="tiny muted">' + UI.esc(DB.studio.defaultLocation) + '</div></div>' +
      '<div style="margin-left:auto;text-align:right"><div style="font-size:15px">' + (paid ? 'Receipt' : 'Invoice') + '</div>' +
      '<div>' + UI.uid(i.publicId) + '</div></div></div>' +
      '<hr style="border:0;border-top:1px solid var(--hair);margin:14px 0">' +
      '<div class="row"><div><div class="tiny muted">Billed to</div><div>' + UI.esc(s.name) + '</div><div class="tiny mono">' + UI.esc(s.email) + '</div></div>' +
      '<div><div class="tiny muted">Issued</div><div class="mono">' + fmtDate(i.issuedAt) + '</div></div>' +
      '<div><div class="tiny muted">Due</div><div class="mono">' + fmtDate(i.dueAt) + '</div></div></div>' +
      '<table style="margin-top:14px"><thead><tr><th>Covers</th><th>Date</th><th class="num">Amount</th></tr></thead><tbody>' +
      i.lines.map(function (ln) {
        return '<tr><td>' + (ln.lessonPublicId ? UI.uid(ln.lessonPublicId) : UI.esc(ln.periodLabel)) + '</td>' +
          '<td class="tiny mono">' + (ln.date ? fmtDate(ln.date) : '—') + '</td><td class="num">' + money(ln.total) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="2" style="text-align:right;font-weight:600;padding:10px 16px">Total</td>' +
      '<td class="num" style="font-weight:600;padding:10px 16px">' + money(i.total) + '</td></tr></tfoot></table>' +
      '<div class="note" style="margin-top:14px">' + UI.esc(i.lines[0] ? i.lines[0].policyNote : DB.studio.policyNote) + '</div>' +
      '</div>';
    modal(paid ? 'Receipt PDF' : 'Invoice PDF', body, UI.btn('Close', 'close-modal', 'primary'), true);
  }

  /* ---------- action dispatch ---------- */
  function onClick(ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (act === 'close-scrim' && ev.target !== el) return;
    ev.preventDefault();
    var id = el.dataset.id;

    switch (act) {
      case 'login':
        DB.session.role = el.dataset.role;
        DB.session.studentId = el.dataset.id || null;
        if (DB.session.role === 'student') {
          var st = studentById(DB.session.studentId);
          if (st.portalStatus !== 'active') {
            var tok = DB.invitations.filter(function (i) { return i.studentId === st.id && !i.consumed; })[0];
            if (tok) {
              var r = Engine.consumeInvitation(tok.token, st.email);
              if (!r.ok) { alert(r.error); return; }
            }
          }
          go('p-overview');
        } else go('dashboard');
        break;

      case 'logout': DB.session = { role: 'teacher', studentId: null }; go('gate'); break;
      case 'go': go(el.dataset.route, {}); break;
      case 'menu': document.querySelector('.rail').classList.toggle('open'); break;
      case 'week': go('calendar', { w: el.dataset.w }); break;
      case 'student': go('student', { id: id }); break;
      case 'series': go('series', { id: id }); break;
      case 'invoice': go('invoice', { id: id }); break;
      case 'notification': go('notification', { id: id }); break;
      case 'p-invoice': go('p-invoice', { pid: invoiceById(id).publicId }); break;

      case 'lesson': lessonModal(id); break;
      case 'close-modal': case 'close-scrim': state.modal = null; render(); break;

      case 'transition':
        result(Engine.transition(id, el.dataset.to, actorName(), DB.session.role),
          'Lesson moved to ' + LESSON_STATES[el.dataset.to].label + '.');
        break;

      case 'revert':
        var rr = Engine.revert(id, actorName());
        result(rr, rr.ok ? 'Lesson reverted to Scheduled. Nothing was deleted.' : null);
        break;

      case 'p-cancel':
        var l = lessonById(id);
        var late = Engine.isLateCancel(l, new Date());
        if (!confirm((late
          ? 'This is inside the ' + DB.studio.lateCancelWindowHours + '-hour window, so it will be billed at ' +
          DB.studio.lateCancelChargePct + '% of your rate.\n\n'
          : 'This cancellation is outside the late window, so nothing will be charged.\n\n') +
          DB.studio.policyNote + '\n\nCancel this lesson?')) return;
        result(Engine.transition(id, 'cancelled_student', actorName(), 'student'), 'Lesson cancelled. Notices sent.');
        break;

      case 'new-invoice': invoiceModal(id); break;
      case 'do-invoice':
        var sid = document.getElementById('inv-student').value;
        var mode = document.getElementById('inv-mode').value;
        state.modal = null;
        var ri = Engine.createInvoice(sid, mode, null, actorName());
        result(ri, ri.ok ? 'Invoice ' + ri.value.publicId + ' created and emailed.' : null);
        break;

      case 'new-student': studentModal(); break;
      case 'do-student':
        var nm = document.getElementById('ns-name').value.trim();
        var em = document.getElementById('ns-email').value.trim();
        if (!nm || !em) { toast('Name and email are both required.', true); return; }
        var ns = mkStudent(nm, em, Math.round(+document.getElementById('ns-rate').value * 100),
          document.getElementById('ns-mode').value, +document.getElementById('ns-rem').value, 'none', new Date());
        ns.legacy = false;
        ns.publicId = nextId('STU');
        ns.monthlyAmount = ns.rate * 4;
        logActivity(actorName(), 'Student ' + ns.publicId + ' added to the roster.', { studentId: ns.id, kind: 'student' });
        state.modal = null;
        go('student', { id: ns.id });
        toast('Added ' + nm + ' as ' + ns.publicId + '.');
        break;

      case 'new-series': seriesModal(); break;
      case 'do-series':
        var ss = document.getElementById('se-student').value;
        var bound = document.getElementById('se-bound').value;
        var endv = document.getElementById('se-end').value;
        if (bound === 'end_date' && !endv) { toast('A fixed boundary needs an end date.', true); return; }
        var today0 = new Date(); today0.setHours(0, 0, 0, 0);
        var se = mkSeries(ss, +document.getElementById('se-day').value, document.getElementById('se-time').value,
          +document.getElementById('se-dur').value, today0, bound, endv ? new Date(endv + 'T00:00') : null);
        var before = DB.lessons.length;
        materializeSeries(se, today0);
        DB.lessons.slice(before).forEach(function (nl) { nl.legacy = false; nl.publicId = nextId('LSN'); });
        Engine.notify('reschedule', studentById(ss).email, { studentId: ss });
        logActivity(actorName(), 'Series created — ' + (DB.lessons.length - before) + ' occurrences materialized.', { studentId: ss, kind: 'series' });
        state.modal = null;
        go('series', { id: se.id });
        toast('Series created with ' + (DB.lessons.length - before) + ' occurrences.');
        break;

      case 'new-lesson':
        toast('Use “New lesson series” in this prototype — one-off booking follows the same rules.');
        break;

      case 'revise-series': reviseModal(id); break;
      case 'do-revise':
        var rv = {
          dayOfWeek: document.getElementById('rv-day').value,
          time: document.getElementById('rv-time').value,
          durationMin: document.getElementById('rv-dur').value,
          boundaryType: document.getElementById('rv-bound').value,
          endDate: document.getElementById('rv-end').value ? new Date(document.getElementById('rv-end').value + 'T00:00').toISOString() : null
        };
        state.modal = null;
        var res = Engine.reviseSeries(id, rv, actorName());
        if (res.value && res.value.noop) { render(); toast('Nothing changed, so no revision was recorded and no notice was sent.'); }
        else result(res, 'Revision #' + res.value.seq + ' recorded — ' + res.value.affected + ' occurrence(s) moved.');
        break;

      case 'new-note': noteModal(el.dataset.t, id); break;
      case 'do-note':
        var content = document.getElementById('nt-body').value.trim();
        if (!content) { toast('A note needs some text.', true); return; }
        var vis = document.getElementById('nt-vis').value;
        state.modal = null;
        var rn = Engine.addNote(el.dataset.t, id, content, vis, actorName());
        result(rn, 'Note ' + rn.value.publicId + ' saved (' + vis + ').');
        break;

      case 'pdf': pdfModal(id); break;
      case 'regen':
        var inv = invoiceById(id);
        var sn = Engine.snapshot(inv, actorName());
        render();
        toast('Snapshot #' + sn.seq + ' added' + (sn.discarded ? ' — snapshot #' + sn.discarded.seq + ' discarded, its number is not reused.' : '.'));
        break;

      case 'alert-invoice':
        var iv = invoiceById(id);
        Engine.notify('unpaid_alert', studentById(iv.studentId).email, { invoiceId: iv.id, studentId: iv.studentId });
        logActivity(actorName(), 'Unpaid-invoice alert sent for ' + iv.publicId + '.', { invoiceId: iv.id, studentId: iv.studentId, kind: 'email' });
        render(); toast('Alert sent for ' + iv.publicId + '.');
        break;

      case 'resend': result(Engine.resend(id), 'Resent as a new notification record.'); break;

      case 'send-invite':
        var rsi = Engine.sendInvite(id);
        result(rsi, 'Invitation sent. The link is valid once.');
        break;

      case 'try-invite':
        var ri2 = Engine.consumeInvitation(el.dataset.token, 'link opened from access log');
        render();
        toast(ri2.ok ? 'Link accepted for ' + ri2.value.name + '. It is now consumed.' : ri2.error, !ri2.ok);
        break;

      case 'pay':
        var rp = Engine.pay(id, actorName());
        result(rp, rp.ok ? 'Paid. Receipt ' + rp.value.receipt.publicId + ' issued and emailed.' : null);
        break;

      case 'probe':
        var pid = document.getElementById('probe').value.trim().toUpperCase();
        if (!pid) { toast('Enter an invoice identifier.', true); return; }
        go('p-invoice', { pid: pid });
        break;

      case 'save-studio':
        DB.studio.name = document.getElementById('studio-name').value;
        DB.studio.teacherName = document.getElementById('studio-teacher').value;
        DB.studio.timezone = document.getElementById('studio-tz').value;
        DB.studio.defaultDuration = +document.getElementById('studio-dur').value;
        DB.studio.defaultLocation = document.getElementById('studio-loc').value;
        render(); toast('Studio profile saved.');
        break;

      case 'save-policy':
        DB.studio.lateCancelWindowHours = +document.getElementById('pol-window').value;
        DB.studio.lateCancelChargePct = +document.getElementById('pol-pct').value;
        DB.studio.policyNote = document.getElementById('pol-note').value;
        render(); toast('Policy saved. Invoices already issued keep the note captured at their own issue time.');
        break;

      case 'save-prefs':
        var stu = studentById(DB.session.studentId);
        stu.unsubscribed = document.getElementById('pref-unsub').checked;
        if (!stu.unsubscribed) stu.reminderHours = +document.getElementById('pref-hours').value;
        render();
        toast(stu.unsubscribed ? 'Unsubscribed from reminders. Invoices and receipts still arrive.' : 'Reminder set to ' + stu.reminderHours + ' hours before.');
        break;
    }
  }

  function actorName() {
    return DB.session.role === 'teacher' ? DB.studio.teacherName : studentById(DB.session.studentId).name;
  }

  function boot() {
    root = document.getElementById('root');
    seed();
    document.addEventListener('click', onClick);
    render();
  }

  return { boot: boot, go: go };
})();

document.addEventListener('DOMContentLoaded', App.boot);
