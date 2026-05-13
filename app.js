(function () {
  "use strict";

  const ATTR_LABELS = {
    threadSpec: "Thread",
    system: "System",
    length: "Length",
    productType: "Product type",
    material: "Material",
    coating: "Coating",
    standard: "Standard",
  };

  const form = document.getElementById("match-form");
  const customerSearch = document.getElementById("customer-search");
  const customerSelect = document.getElementById("customer-select");
  const queryInput = document.getElementById("query-input");
  const matchButton = document.getElementById("match-button");
  const parsedRow = document.getElementById("parsed-row");
  const statusArea = document.getElementById("status-area");
  const decisionPanel = document.getElementById("decision-panel");
  const flagsBanner = document.getElementById("flags-banner");
  const advisoryPanel = document.getElementById("advisory-panel");
  const historyPanel = document.getElementById("history-panel");
  const emptyState = document.getElementById("empty-state");
  const resultsList = document.getElementById("results-list");
  const selectionPanel = document.getElementById("selection-panel");

  /** @type {{ id: string, name: string }[]} */
  let allCustomers = [];
  let latestMatch = null;
  let selectedSku = null;

  function getCustomersMap() {
    const raw = window.customers;
    if (!raw || typeof raw !== "object") return {};
    return raw;
  }

  function buildCustomerList() {
    const map = getCustomersMap();
    allCustomers = Object.keys(map)
      .sort()
      .map((id) => ({ id, name: map[id].name || id }));
  }

  function populateCustomerSelect(filterText) {
    const q = (filterText || "").trim().toLowerCase();
    const select = customerSelect;
    const prev = select.value;

    select.innerHTML = "";

    const anon = document.createElement("option");
    anon.value = "";
    anon.textContent = "No customer selected (anonymous)";
    select.appendChild(anon);

    for (const { id, name } of allCustomers) {
      const label = `${id} — ${name}`;
      if (q && !label.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) {
        continue;
      }
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      select.appendChild(opt);
    }

    if ([...select.options].some((o) => o.value === prev)) {
      select.value = prev;
    }
  }

  function formatDescription(item) {
    if (Array.isArray(item.displayParts) && item.displayParts.length) {
      return item.displayParts.join(" · ");
    }
    return item.rawDescription || "";
  }

  function renderParsedAttrs(queryAttrs) {
    if (!queryAttrs || typeof queryAttrs !== "object") {
      parsedRow.classList.add("hidden");
      parsedRow.innerHTML = "";
      return;
    }

    const parts = [];
    for (const key of Object.keys(ATTR_LABELS)) {
      const val = queryAttrs[key];
      if (val != null && String(val).trim() !== "") {
        parts.push({ key, val: String(val).trim() });
      }
    }

    if (!parts.length) {
      parsedRow.classList.add("hidden");
      parsedRow.innerHTML = "";
      return;
    }

    parsedRow.classList.remove("hidden");
    const chips = parts
      .map(
        (p) =>
          `<span class="chip" title="${escapeHtml(ATTR_LABELS[p.key])}">${escapeHtml(
            p.val
          )}</span>`
      )
      .join("");

    parsedRow.innerHTML = `<span class="parsed-label">Parsed as:</span><div class="parsed-chips">${chips}</div>`;
  }

  function renderFlags(flags) {
    flagsBanner.innerHTML = "";
    if (!flags) return;

    const items = [];
    if (flags.lowConfidence) {
      items.push({
        className: "flag-item flag-low",
        text:
          "⚠ Low confidence — results may not be accurate. Try adding more detail.",
      });
    }
    if (flags.isReferential) {
      items.push({
        className: "flag-item flag-ref",
        text: "📋 Referential query detected — showing items from order history.",
      });
    }
    if (flags.isMultiProduct) {
      items.push({
        className: "flag-item flag-multi",
        text:
          "🔀 Multi-product query detected — showing best single match. Try separate queries for each item.",
      });
    }

    for (const it of items) {
      const div = document.createElement("div");
      div.className = it.className;
      div.textContent = it.text;
      flagsBanner.appendChild(div);
    }
  }

  function renderDecision(decision) {
    decisionPanel.innerHTML = "";
    if (!decision) {
      decisionPanel.classList.add("hidden");
      return;
    }

    decisionPanel.className = `decision-panel decision-${decision.tone || "warn"}`;
    const reasons = Array.isArray(decision.reasons) ? decision.reasons : [];
    const reasonList = reasons.length
      ? `<ul class="decision-reasons">${reasons
          .map((reason) => `<li>${escapeHtml(reason)}</li>`)
          .join("")}</ul>`
      : "";

    decisionPanel.innerHTML = `
      <div class="decision-head">
        <span class="decision-badge">${escapeHtml(decision.label || "Review")}</span>
        <p class="decision-message">${escapeHtml(decision.message || "")}</p>
      </div>
      ${reasonList}
    `;
    decisionPanel.classList.remove("hidden");
  }

  function renderAdvisories(unsupportedSignals) {
    advisoryPanel.innerHTML = "";
    if (!Array.isArray(unsupportedSignals) || unsupportedSignals.length === 0) {
      advisoryPanel.classList.add("hidden");
      return;
    }

    advisoryPanel.innerHTML = `
      <p class="panel-title">Unverified request details</p>
      <ul class="panel-list">
        ${unsupportedSignals
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.message)}</li>`
          )
          .join("")}
      </ul>
    `;
    advisoryPanel.classList.remove("hidden");
  }

  function renderHistoryPanel(historyComparison) {
    historyPanel.innerHTML = "";
    if (!historyComparison) {
      historyPanel.classList.add("hidden");
      return;
    }

    const summary = historyComparison.summary || "Customer history was considered.";
    const extra =
      historyComparison.withoutHistoryTopSku &&
      historyComparison.withHistoryTopSku &&
      historyComparison.withoutHistoryTopSku !== historyComparison.withHistoryTopSku
        ? `<p class="history-detail">Without history: ${escapeHtml(
            historyComparison.withoutHistoryTopSku
          )} · With history: ${escapeHtml(historyComparison.withHistoryTopSku)}</p>`
        : historyComparison.liftPct > 0
          ? `<p class="history-detail">Top result received a ${historyComparison.liftPct}-point boost from order history.</p>`
          : "";

    historyPanel.innerHTML = `
      <p class="panel-title">Customer history</p>
      <p class="history-summary">${escapeHtml(summary)}</p>
      ${extra}
    `;
    historyPanel.classList.remove("hidden");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function confidenceClass(label) {
    if (label === "High") return "conf-high";
    if (label === "Medium") return "conf-medium";
    return "conf-low";
  }

  function renderScoreBar(label, value) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return `
      <div class="score-row">
        <div class="score-row-label">
          <span>${escapeHtml(label)}</span>
          <span>${pct}%</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }

  function renderCard(item, rank) {
    const desc = formatDescription(item);
    const scores = item.scores || {};
    const badgeLabel = item.confidenceLabel || "Low";
    const badgePct =
      typeof item.confidencePct === "number" ? item.confidencePct : 0;

    const inactive =
      item.active === false
        ? `<span class="tag-muted" role="status">⚠ Inactive SKU</span>`
        : "";

    const history =
      item.historyBoosted === true
        ? `<span class="tag-muted tag-history">📦 Ordered before</span>`
        : "";
    const uncertainty =
      Array.isArray(item.uncertainty) && item.uncertainty.length
        ? `<ul class="card-notes">${item.uncertainty
            .map((note) => `<li>${escapeHtml(note)}</li>`)
            .join("")}</ul>`
        : "";
    const historyDetail =
      item.historyContributionPct > 0
        ? `<p class="result-subnote">History contribution: +${item.historyContributionPct} pts</p>`
        : "";
    const actionLabel =
      latestMatch && latestMatch.decision && latestMatch.decision.route === "auto-match"
        ? "Select SKU"
        : "Send to review";

    return `
      <article class="result-card">
        <div class="result-card-header">
          <span class="rank-badge rank-${rank}">#${rank}</span>
          <div class="result-heading">
            <p class="result-sku">${escapeHtml(item.sku || "")}</p>
            <p class="result-desc">${escapeHtml(desc)}</p>
          </div>
        </div>
        <div class="result-meta">
          <span class="confidence-badge ${confidenceClass(badgeLabel)}">
            ${escapeHtml(badgeLabel)} · ${badgePct}%
          </span>
          ${inactive}
          ${history}
        </div>
        <p class="result-rationale">${escapeHtml(item.rationale || "")}</p>
        ${historyDetail}
        ${uncertainty}
        <div class="result-actions">
          <button
            type="button"
            class="result-action-btn"
            data-sku="${escapeHtml(item.sku || "")}"
          >
            ${actionLabel}
          </button>
        </div>
        <details class="score-details">
          <summary>Score breakdown</summary>
          <div class="score-rows">
            ${renderScoreBar("BM25 / lexical", scores.bm25 ?? 0)}
            ${renderScoreBar("Attribute fit", scores.attribute ?? 0)}
            ${renderScoreBar("History prior", scores.history ?? 0)}
            ${renderScoreBar("Without history", scores.baseFinal ?? 0)}
            ${renderScoreBar("Final", scores.final ?? 0)}
          </div>
        </details>
      </article>
    `;
  }

  function renderSelectionPanel() {
    selectionPanel.innerHTML = "";
    if (!latestMatch || !selectedSku) {
      selectionPanel.classList.add("hidden");
      return;
    }

    const selected = (latestMatch.results || []).find((item) => item.sku === selectedSku);
    if (!selected) {
      selectionPanel.classList.add("hidden");
      return;
    }

    const desc = formatDescription(selected);
    const customerId = customerSelect.value || "Anonymous";
    const routeLabel =
      latestMatch.decision && latestMatch.decision.route === "auto-match"
        ? "Ready to proceed"
        : "Review handoff";

    selectionPanel.innerHTML = `
      <div class="selection-head">
        <div>
          <p class="panel-title">Selected SKU</p>
          <h2 class="selection-sku">${escapeHtml(selected.sku)}</h2>
          <p class="selection-desc">${escapeHtml(desc)}</p>
        </div>
        <span class="selection-route">${escapeHtml(routeLabel)}</span>
      </div>
      <p class="selection-rationale">${escapeHtml(selected.rationale || "")}</p>
      <div class="selection-grid">
        <div class="selection-field">
          <span class="selection-label">Customer</span>
          <span>${escapeHtml(customerId)}</span>
        </div>
        <div class="selection-field">
          <span class="selection-label">Confidence</span>
          <span>${escapeHtml(selected.confidenceLabel)} · ${selected.confidencePct}%</span>
        </div>
        <div class="selection-field">
          <span class="selection-label">Decision</span>
          <span>${escapeHtml(latestMatch.decision ? latestMatch.decision.label : "Review")}</span>
        </div>
        <div class="selection-field">
          <span class="selection-label">Prototype next step</span>
          <span>Mock order review handoff</span>
        </div>
      </div>
      <p class="selection-note">This prototype stops at review handoff. There is no live inventory or order-submission backend yet.</p>
    `;
    selectionPanel.classList.remove("hidden");
  }

  function setLoading(isLoading) {
    statusArea.innerHTML = "";
    if (isLoading) {
      const p = document.createElement("p");
      p.className = "status-loading";
      p.textContent = "Matching…";
      statusArea.appendChild(p);
    }
    matchButton.disabled = isLoading;
  }

  function showError(message) {
    statusArea.innerHTML = "";
    const div = document.createElement("div");
    div.className = "status-error";
    div.textContent = message;
    statusArea.appendChild(div);
  }

  function clearError() {
    const err = statusArea.querySelector(".status-error");
    if (err) err.remove();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runMatch();
  });

  function runMatch() {
    clearError();
    const query = queryInput.value.trim();
    const customerId = customerSelect.value || null;

    renderParsedAttrs(null);
    renderFlags(null);
    renderDecision(null);
    renderAdvisories(null);
    renderHistoryPanel(null);
    latestMatch = null;
    selectedSku = null;
    renderSelectionPanel();

    if (!query) {
      setLoading(false);
      emptyState.classList.remove("hidden");
      emptyState.textContent =
        "Enter a product description above to find matching SKUs.";
      resultsList.classList.add("hidden");
      resultsList.innerHTML = "";
      statusArea.innerHTML = "";
      return;
    }

    if (!window.Matcher || typeof window.Matcher.match !== "function") {
      showError("Matcher is not available. Check that data.js and matcher.js loaded.");
      return;
    }

    emptyState.classList.add("hidden");
    resultsList.classList.remove("hidden");
    resultsList.innerHTML = "";
    setLoading(true);

    window.requestAnimationFrame(() => {
      try {
        const result = window.Matcher.match(query, customerId);
        setLoading(false);
        latestMatch = result;
        selectedSku = null;

        renderParsedAttrs(result.queryAttrs);
        renderFlags(result.flags);
        renderDecision(result.decision);
        renderAdvisories(result.unsupportedSignals);
        renderHistoryPanel(result.historyComparison);

        const rows = result.results || [];
        resultsList.innerHTML = rows
          .map((item, i) => renderCard(item, i + 1))
          .join("");
        renderSelectionPanel();
      } catch (err) {
        setLoading(false);
        console.error(err);
        showError(
          "Something went wrong while matching. Please try again or simplify your query."
        );
        resultsList.innerHTML = "";
        emptyState.classList.remove("hidden");
        emptyState.textContent =
          "Enter a product description above to find matching SKUs.";
        resultsList.classList.add("hidden");
        renderDecision(null);
        renderAdvisories(null);
        renderHistoryPanel(null);
        latestMatch = null;
        selectedSku = null;
        renderSelectionPanel();
      }
    });
  }

  customerSearch.addEventListener("input", () => {
    populateCustomerSelect(customerSearch.value);
  });

  resultsList.addEventListener("click", (event) => {
    const button = event.target.closest(".result-action-btn");
    if (!button) return;
    selectedSku = button.getAttribute("data-sku");
    renderSelectionPanel();
    selectionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  buildCustomerList();
  populateCustomerSelect("");
})();
