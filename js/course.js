/**
 * Course page progressive enhancement for /teaching/spring2026/cs486-introduction-to-artificial-intelligence/.
 *
 * Adds row state and a "next deadline" pill, sourced entirely from data-date / data-deadline
 * attributes already in the markup. The page renders fully without this script.
 */
(function () {
  'use strict';

  function toMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseISO(str) {
    if (!str) return null;
    var parts = str.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d);
  }

  function formatRelative(date, now) {
    var oneDay = 86400000;
    var diffDays = Math.round((toMidnight(date) - toMidnight(now)) / oneDay);
    var weekday = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (diffDays === 0) return 'today (' + weekday + ')';
    if (diffDays === 1) return 'tomorrow (' + weekday + ')';
    if (diffDays > 1 && diffDays < 7) return 'in ' + diffDays + ' days (' + weekday + ')';
    return weekday;
  }

  function annotateScheduleRows() {
    var today = toMidnight(new Date());
    var rows = document.querySelectorAll('.schedule-table tr[data-date]');
    var firstUpcoming = null;

    rows.forEach(function (tr) {
      var d = parseISO(tr.getAttribute('data-date'));
      if (!d) return;
      if (d < today) {
        tr.classList.add('row--past');
      } else if (d.getTime() === today.getTime()) {
        tr.classList.add('row--today');
        if (!firstUpcoming) firstUpcoming = tr;
      } else if (!firstUpcoming) {
        firstUpcoming = tr;
      }
    });

    if (firstUpcoming && !firstUpcoming.classList.contains('row--today')) {
      firstUpcoming.classList.add('row--upcoming-next');
    }
    return firstUpcoming;
  }

  function populateNextDeadline() {
    var pill = document.querySelector('[data-next-deadline]');
    if (!pill) return;
    var now = new Date();
    var today = toMidnight(now);

    var candidates = [];
    document.querySelectorAll('.schedule-table tr[data-date], .course-table tr[data-date]').forEach(function (tr) {
      var d = parseISO(tr.getAttribute('data-date'));
      if (!d || d < today) return;
      tr.querySelectorAll('.badge--due, .badge--release, .badge--exam').forEach(function (b) {
        candidates.push({ date: d, label: b.textContent.trim(), kind: b.className });
      });
      // Chat-due rows in the chat table have no badge, only the row itself.
      if (tr.closest && tr.closest('#chats') && tr.matches('tr[data-date]')) {
        var chatNum = tr.querySelector('td[data-label="#"]');
        if (chatNum) candidates.push({ date: d, label: chatNum.textContent.trim() + ' due', kind: 'chat' });
      }
    });

    candidates.sort(function (a, b) { return a.date - b.date; });
    if (candidates.length === 0) {
      pill.hidden = true;
      return;
    }
    var next = candidates[0];
    var textEl = pill.querySelector('.text');
    if (textEl) {
      textEl.textContent = next.label + ' \u2014 ' + formatRelative(next.date, now);
    }
    pill.hidden = false;
  }

  function init() {
    annotateScheduleRows();
    populateNextDeadline();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
