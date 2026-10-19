/* Reused from the Implicit Chain-of-Thought Research Map:
 * https://github.com/latent-implicit-thinking/latent-implicit-thinking.github.io/blob/main/assets/js/lit-hub.js
 * MIT license; see LICENSE.txt. The implementation below is unchanged.
 */
(function () {
  "use strict";

  var list = document.getElementById("paper-list");
  if (!list) return;

  var papers = Array.prototype.slice.call(list.querySelectorAll(".lit-paper-row"));
  var search = document.getElementById("paper-search");
  var sort = document.getElementById("paper-sort");
  var reset = document.getElementById("paper-reset");
  var share = document.getElementById("paper-share");
  var count = document.getElementById("paper-result-count");
  var empty = document.getElementById("paper-empty");
  var filterSets = Array.prototype.slice.call(document.querySelectorAll("[data-filter-set]"));
  var filterSelects = Array.prototype.slice.call(document.querySelectorAll("[data-filter-select]"));
  var advanced = document.getElementById("paper-advanced");
  var params = new URLSearchParams(window.location.search);
  var state = {};
  var searchTimer;

  function track(name, parameters) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, parameters || {});
  }

  filterSets.forEach(function (set) {
    var name = set.dataset.filterSet;
    var requested = params.get(name) || "all";
    var valid = Array.prototype.some.call(set.querySelectorAll("[data-filter-value]"), function (button) {
      return button.dataset.filterValue === requested;
    });
    state[name] = valid ? requested : "all";
    if (advanced && advanced.contains(set) && state[name] !== "all") advanced.open = true;
  });

  filterSelects.forEach(function (select) {
    var name = select.dataset.filterSelect;
    var requested = params.get(name) || "all";
    var valid = Array.prototype.some.call(select.options, function (option) { return option.value === requested; });
    state[name] = valid ? requested : "all";
    select.value = state[name];
    if (advanced && state[name] !== "all") advanced.open = true;
  });

  function tokenMatch(value, selected) {
    if (selected === "all") return true;
    return (value || "").split(/\s+/).indexOf(selected) !== -1;
  }

  function normalizeSearch(value) {
    return (value || "").toLowerCase().replace(/[-\u2010-\u2015]/g, " ").replace(/\s+/g, " ").trim();
  }

  function updateUrl() {
    var next = new URLSearchParams();
    var query = search.value.trim();
    if (query) next.set("q", query);
    Object.keys(state).forEach(function (name) {
      if (state[name] !== "all") next.set(name, state[name]);
    });
    if (sort.value !== "date-asc") next.set("sort", sort.value);
    var queryString = next.toString();
    window.history.replaceState(null, "", window.location.pathname + (queryString ? "?" + queryString : "") + window.location.hash);
  }

  function sortPapers() {
    var mode = sort.value;
    papers.sort(function (a, b) {
      var stableIdOrder = a.dataset.paperId.localeCompare(b.dataset.paperId);
      if (mode === "date-asc") return a.dataset.date.localeCompare(b.dataset.date) || stableIdOrder;
      if (mode === "date-desc") return b.dataset.date.localeCompare(a.dataset.date) || stableIdOrder;
      if (mode === "added-desc") return (b.dataset.added || "").localeCompare(a.dataset.added || "") || b.dataset.date.localeCompare(a.dataset.date) || stableIdOrder;
      if (mode === "title") return a.dataset.title.localeCompare(b.dataset.title) || stableIdOrder;
      return a.dataset.date.localeCompare(b.dataset.date) || stableIdOrder;
    });
    papers.forEach(function (paper) { list.appendChild(paper); });
  }

  function applyFilters() {
    var query = normalizeSearch(search.value);
    var visible = 0;

    papers.forEach(function (paper) {
      var matchesSearch = !query || normalizeSearch(paper.dataset.search).indexOf(query) !== -1;
      var matchesFilters = Object.keys(state).every(function (name) {
        return tokenMatch(paper.dataset[name], state[name]);
      });
      var show = matchesSearch && matchesFilters;
      paper.hidden = !show;
      if (show) visible += 1;
    });

    count.textContent = "Showing " + visible + (visible === 1 ? " paper" : " papers");
    var advancedCount = document.getElementById("paper-advanced-count");
    if (advancedCount) {
      var activeAdvanced = Object.keys(state).filter(function (name) { return name !== "lens" && state[name] !== "all"; }).length;
      advancedCount.textContent = activeAdvanced ? " (" + activeAdvanced + " active)" : "";
    }
    empty.hidden = visible !== 0;
    sortPapers();
    updateUrl();
  }

  function syncButtons() {
    filterSets.forEach(function (set) {
      var name = set.dataset.filterSet;
      var selected = state[name];
      Array.prototype.forEach.call(set.querySelectorAll("[data-filter-value]"), function (button) {
        var active = button.dataset.filterValue === selected;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
  }

  filterSets.forEach(function (set) {
    set.addEventListener("click", function (event) {
      var button = event.target.closest("[data-filter-value]");
      if (!button) return;
      state[set.dataset.filterSet] = button.dataset.filterValue;
      syncButtons();
      applyFilters();
      track("paper_filter", {
        filter_name: set.dataset.filterSet,
        filter_value: button.dataset.filterValue
      });
    });
  });

  filterSelects.forEach(function (select) {
    select.addEventListener("change", function () {
      state[select.dataset.filterSelect] = select.value;
      applyFilters();
      track("paper_filter", {
        filter_name: select.dataset.filterSelect,
        filter_value: select.value
      });
    });
  });

  search.value = params.get("q") || "";
  sort.value = params.get("sort") || "date-asc";
  if (!sort.value) sort.value = "date-asc";

  search.addEventListener("input", function () {
    applyFilters();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      if (search.value.trim().length >= 2) {
        track("paper_search", {
          visible_results: papers.filter(function (paper) { return !paper.hidden; }).length
        });
      }
    }, 600);
  });
  sort.addEventListener("change", function () {
    applyFilters();
    track("paper_sort", { sort_order: sort.value });
  });
  reset.addEventListener("click", function () {
    search.value = "";
    sort.value = "date-asc";
    Object.keys(state).forEach(function (name) { state[name] = "all"; });
    filterSelects.forEach(function (select) { select.value = "all"; });
    syncButtons();
    applyFilters();
    search.focus();
    track("paper_filters_reset");
  });

  function confirmCopied() {
    var previous = share.textContent;
    share.textContent = "Link copied";
    window.setTimeout(function () { share.textContent = previous; }, 1800);
    track("paper_view_copied", { visible_results: papers.filter(function (paper) { return !paper.hidden; }).length });
  }

  function legacyCopy(url) {
    var helper = document.createElement("textarea");
    helper.value = url;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    } finally {
      document.body.removeChild(helper);
    }
    if (copied) {
      confirmCopied();
    } else {
      share.textContent = "Copy the URL from your address bar";
    }
  }

  function copyFilteredView() {
    updateUrl();
    var url = window.location.href;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(confirmCopied).catch(function () { legacyCopy(url); });
      return;
    }
    legacyCopy(url);
  }

  if (share) share.addEventListener("click", copyFilteredView);

  syncButtons();
  applyFilters();
})();
