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
  const flagsBanner = document.getElementById("flags-banner");
  const emptyState = document.getElementById("empty-state");
  const resultsList = document.getElementById("results-list");

  /** @type {{ id: string, name: string }[]} */
  let allCustomers = [];

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
        <details class="score-details">
          <summary>Score breakdown</summary>
          <div class="score-rows">
            ${renderScoreBar("BM25 / lexical", scores.bm25 ?? 0)}
            ${renderScoreBar("Attribute fit", scores.attribute ?? 0)}
            ${renderScoreBar("History prior", scores.history ?? 0)}
            ${renderScoreBar("Final", scores.final ?? 0)}
          </div>
        </details>
      </article>
    `;
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

        renderParsedAttrs(result.queryAttrs);
        renderFlags(result.flags);

        const rows = result.results || [];
        resultsList.innerHTML = rows
          .map((item, i) => renderCard(item, i + 1))
          .join("");
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
      }
    });
  }

  customerSearch.addEventListener("input", () => {
    populateCustomerSelect(customerSearch.value);
  });

  buildCustomerList();
  populateCustomerSelect("");
})();
