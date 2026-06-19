/* crm-operator — shared renderer.
 * Reads window.CRM (from data.js) and draws pages. Nothing here is entity-specific
 * data; it is pure presentation. The agent never edits this file — only data.js. */
(function () {
  "use strict";
  var CRM = window.CRM || {};
  var META = CRM.meta || {};
  var TYPES = ["contacts", "companies", "deals", "interactions", "tasks"];
  var SINGULAR = { contacts: "contact", companies: "company", deals: "deal", interactions: "interaction", tasks: "task" };
  var PLURAL = { contact: "contacts", company: "companies", deal: "deals", interaction: "interactions", task: "tasks" };

  // ---- helpers -------------------------------------------------------------
  function bucket(type) { return CRM[PLURAL[type] || type] || {}; }
  function get(type, id) { return bucket(type)[id]; }
  function all(type) { return Object.values(bucket(type)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function money(n) { return n == null ? "" : "$" + Number(n).toLocaleString("en-US"); }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  // Resolve [[Wikilinks]] in prose/relations to pages. Wikilinks may reference a
  // page *title* (-> matches an id via slug) or a frontmatter name (-> NAMEIDX).
  var NAMEIDX = {}, SLUGIDX = {};
  TYPES.forEach(function (plur) {
    Object.keys(CRM[plur] || {}).forEach(function (id) {
      var ref = { type: SINGULAR[plur], id: id };
      NAMEIDX[(CRM[plur][id].name || "").toLowerCase()] = ref;
      SLUGIDX[id] = ref;
    });
  });
  function resolveName(name) { return NAMEIDX[String(name).toLowerCase()] || SLUGIDX[slug(name)]; }

  function href(type, id) { return "view.html?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id); }
  function link(type, id, label) {
    var e = get(type, id);
    var text = label || (e && e.name) || id;
    if (!e) return '<span class="empty">' + esc(text) + "</span>";
    return '<a href="' + href(type, id) + '">' + esc(text) + "</a>";
  }

  function badge(text, kind) { return '<span class="badge' + (kind ? " " + kind : "") + '">' + esc(text) + "</span>"; }
  var STAGE_KIND = { lead: "", qualified: "accent", proposal: "accent", negotiation: "warn", "closed-won": "good", "closed-lost": "bad" };
  var STATUS_KIND = { active: "good", customer: "good", prospect: "accent", partner: "accent", inactive: "", churned: "bad", "closed-lost": "bad" };
  var PRIO_KIND = { high: "bad", medium: "warn", low: "" };

  // ---- tiny markdown (paragraphs, bullet lists, **bold**, [[links]]) -------
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, name, alias) {
      var r = resolveName(name.trim());
      var label = (alias || name).trim();
      return r ? '<a href="' + href(r.type, r.id) + '">' + esc(label) + "</a>" : esc(label);
    });
    s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s;
  }
  function md(text) {
    if (!text) return "";
    var lines = String(text).replace(/\r/g, "").split("\n");
    var html = "", list = null, callout = [];
    function closeList() { if (list) { html += "<ul>" + list.join("") + "</ul>"; list = null; } }
    function closeCallout() { if (callout.length) { html += '<div class="callout">' + callout.map(function (l) { return inline(l); }).join("<br>") + "</div>"; callout = []; } }
    var para = [];
    function closePara() { if (para.length) { html += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; } }
    lines.forEach(function (raw) {
      var line = raw.trimEnd();
      if (/^>\s?/.test(line)) { closeList(); closePara(); callout.push(line.replace(/^>\s?/, "").replace(/^\[!.*?\]-?\s*/, "")); return; }
      closeCallout();
      if (/^\s*[-*]\s+/.test(line)) { closePara(); (list = list || []).push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>"); return; }
      if (line.trim() === "") { closeList(); closePara(); return; }
      closeList(); para.push(line);
    });
    closeList(); closePara(); closeCallout();
    return '<div class="prose">' + html + "</div>";
  }

  function sectionsHtml(e, skip) {
    skip = skip || [];
    var out = "";
    Object.keys(e.sections || {}).forEach(function (h) {
      if (skip.indexOf(h) !== -1) return;
      out += "<h2>" + esc(h) + "</h2>" + md(e.sections[h]);
    });
    return out;
  }
  function relatedBlock(title, items) {
    return "<h2>" + esc(title) + "</h2>" + (items.length
      ? '<div class="related">' + items.join("") + "</div>"
      : '<p class="empty">None.</p>');
  }
  function mount(html) { document.getElementById("app").innerHTML = html; }
  function applyBrand() {
    var root = document.documentElement;
    if (META.accent && root && root.style) root.style.setProperty("--accent", META.accent);
    var b = document.getElementById("brand");
    if (b) b.textContent = META.business || "CRM";
    document.title = (META.business ? META.business + " · " : "") + "CRM";
  }
  function tagline(e) {
    if (!e.tags || !e.tags.length) return "";
    return '<div class="tags">' + e.tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>";
  }

  // ---- entity renderers ----------------------------------------------------
  function renderContact(e) {
    var deals = all("deal").filter(function (d) { return d.primary_contact === e.id || d.company === e.company; });
    var ints = all("interaction").filter(function (i) { return (i.participants || []).indexOf(e.id) !== -1; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var head =
      "<p class=\"kicker\">Contact</p><h1>" + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      (e.role ? "<span><b>" + esc(e.role) + "</b></span>" : "") +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      "<span>" + badge(e.status || "—", STATUS_KIND[e.status]) + "</span>" +
      (e.email ? '<span><a href="mailto:' + esc(e.email) + '">' + esc(e.email) + "</a></span>" : "") +
      (e.phone ? "<span>" + esc(e.phone) + "</span>" : "") +
      (e.last_contacted ? "<span>last contacted <b>" + esc(e.last_contacted) + "</b></span>" : "") +
      "</div>";
    mount(head + tagline(e) +
      sectionsHtml(e) +
      relatedBlock("Interaction History", ints.map(function (i) { return link("interaction", i.id, i.date + " · " + i.name); })) +
      relatedBlock("Linked Deals", deals.map(function (d) { return link("deal", d.id); })));
  }

  function renderCompany(e) {
    var contacts = all("contact").filter(function (c) { return c.company === e.id; });
    var deals = all("deal").filter(function (d) { return d.company === e.id && d.stage !== "closed-lost"; });
    var head =
      "<p class=\"kicker\">Company</p><h1>" + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      (e.industry ? "<span><b>" + esc(e.industry) + "</b></span>" : "") +
      (e.size ? "<span>" + esc(e.size) + "</span>" : "") +
      (e.location ? "<span>" + esc(e.location) + "</span>" : "") +
      "<span>" + badge(e.status || "—", STATUS_KIND[e.status]) + "</span>" +
      (e.domain ? '<span><a href="https://' + esc(e.domain) + '" target="_blank" rel="noopener">' + esc(e.domain) + "</a></span>" : "") +
      (e.arr_potential ? "<span>ARR potential <b>" + money(e.arr_potential) + "</b></span>" : "") +
      "</div>";
    var ctable = contacts.length ? table(["Name", "Role", "Status", "Last contact"], contacts.map(function (c) {
      return [link("contact", c.id), esc(c.role || ""), badge(c.status || "—", STATUS_KIND[c.status]), esc(c.last_contacted || "")];
    })) : '<p class="empty">No contacts yet.</p>';
    var dtable = deals.length ? table(["Deal", "Stage", "Value", "Prob"], deals.map(function (d) {
      return [link("deal", d.id), badge(d.stage, STAGE_KIND[d.stage]), { num: money(d.value) }, { num: (d.probability || 0) + "%" }];
    })) : '<p class="empty">No active deals.</p>';
    mount(head + tagline(e) + sectionsHtml(e) + "<h2>Key Contacts</h2>" + ctable + "<h2>Active Deals</h2>" + dtable);
  }

  function renderDeal(e) {
    var ints = all("interaction").filter(function (i) { return i.deal === e.id; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var head =
      "<p class=\"kicker\">Deal</p><h1>" + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      "<span><b>" + money(e.value) + "</b> " + esc(e.currency || "") + "</span>" +
      "<span>" + badge(e.stage, STAGE_KIND[e.stage]) + "</span>" +
      "<span>" + (e.probability || 0) + "% prob</span>" +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      (e.primary_contact ? "<span>" + link("contact", e.primary_contact) + "</span>" : "") +
      (e.expected_close ? "<span>close <b>" + esc(e.expected_close) + "</b></span>" : "") +
      "</div>";
    mount(head + tagline(e) + sectionsHtml(e) +
      relatedBlock("Interactions", ints.map(function (i) { return link("interaction", i.id, i.date + " · " + i.name); })));
  }

  function renderInteraction(e) {
    var parts = (e.participants || []).map(function (p) { return link("contact", p); });
    var head =
      "<p class=\"kicker\">Interaction · " + esc(e.interaction_type || "") + "</p><h1>" + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      (e.date ? "<span><b>" + esc(e.date) + "</b></span>" : "") +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      (e.deal ? "<span>" + link("deal", e.deal) + "</span>" : "") +
      (e.source && e.source.meet_url ? '<span><a href="' + esc(e.source.meet_url) + '" target="_blank" rel="noopener">Join Meet</a></span>' : "") +
      (e.source && e.source.event_url ? '<span><a href="' + esc(e.source.event_url) + '" target="_blank" rel="noopener">Calendar</a></span>' : "") +
      (e.source && e.source.channel && e.source.channel !== "manual" ? "<span>" + badge("via " + e.source.channel) + "</span>" : "") +
      "</div>" +
      (e.summary ? '<p class="subtle">' + esc(e.summary) + "</p>" : "");
    mount(head +
      relatedBlock("Participants", parts) +
      sectionsHtml(e));
  }

  function renderTask(e) {
    var rel = (e.related_to || []).map(function (name) {
      var r = resolveName(name); return r ? link(r.type, r.id) : '<span class="empty">' + esc(name) + "</span>";
    });
    var overdue = e.due_date && e.status !== "done" && e.due_date < today();
    var head =
      "<p class=\"kicker\">Task</p><h1>" + esc(e.title || e.name) + "</h1>" +
      '<div class="meta">' +
      "<span>" + badge(e.status || "todo", e.status === "done" ? "good" : "") + "</span>" +
      "<span>" + badge((e.priority || "medium") + " priority", PRIO_KIND[e.priority]) + "</span>" +
      (e.due_date ? "<span>due <b>" + esc(e.due_date) + "</b>" + (overdue ? " " + badge("overdue", "bad") : "") + "</span>" : "") +
      (e.assigned_to ? "<span>" + esc(e.assigned_to) + "</span>" : "") +
      "</div>";
    mount(head + sectionsHtml(e) + relatedBlock("Related", rel));
  }

  // ---- shared table builder ------------------------------------------------
  function cell(c) {
    if (c && typeof c === "object" && "num" in c) return '<td class="num">' + c.num + "</td>";
    return "<td>" + c + "</td>";
  }
  function table(cols, rows, foot) {
    var head = "<tr>" + cols.map(function (c) {
      return /prob|value/i.test(c) ? '<th class="num">' + esc(c) + "</th>" : "<th>" + esc(c) + "</th>";
    }).join("") + "</tr>";
    var body = rows.map(function (r) { return "<tr>" + r.map(cell).join("") + "</tr>"; }).join("");
    var footer = foot ? "<tfoot><tr>" + foot.map(cell).join("") + "</tr></tfoot>" : "";
    return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody>" + footer + "</table>";
  }

  // ---- home / dashboards ---------------------------------------------------
  function renderHome() {
    applyBrand();
    var deals = all("deal");
    var open = deals.filter(function (d) { return d.stage !== "closed-lost" && d.stage !== "closed-won"; });
    var pipeline = open.reduce(function (s, d) { return s + (d.value || 0); }, 0);
    var weighted = open.reduce(function (s, d) { return s + (d.value || 0) * (d.probability || 0) / 100; }, 0);
    var tasks = all("task").filter(function (t) { return t.status !== "done"; })
      .sort(function (a, b) { return (a.due_date || "").localeCompare(b.due_date || ""); });
    var overdue = tasks.filter(function (t) { return t.due_date && t.due_date < today(); });

    var kpis = '<div class="grid kpis">' + [
      kpi(money(pipeline), "Open pipeline"),
      kpi(money(Math.round(weighted)), "Weighted"),
      kpi(open.length, "Open deals", "plain"),
      kpi(all("contact").length, "Contacts", "plain"),
      kpi(overdue.length, "Overdue tasks", overdue.length ? "bad" : "plain")
    ].join("") + "</div>";

    var stageOrder = ["lead", "qualified", "proposal", "negotiation", "closed-won"];
    var pipeRows = open.slice().sort(function (a, b) {
      return stageOrder.indexOf(b.stage) - stageOrder.indexOf(a.stage) || (b.value || 0) - (a.value || 0);
    }).map(function (d) {
      return [link("deal", d.id), d.company ? link("company", d.company) : "", badge(d.stage, STAGE_KIND[d.stage]),
        { num: money(d.value) }, { num: (d.probability || 0) + "%" }];
    });

    var taskRows = tasks.map(function (t) {
      var od = t.due_date && t.due_date < today();
      return { overdue: od, cells: [link("task", t.id, t.title || t.name), badge(t.priority || "medium", PRIO_KIND[t.priority]), { num: t.due_date || "—" }] };
    });

    var ints = all("interaction").sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 8);

    mount(
      '<p class="kicker">' + esc(META.business || "CRM") + "</p><h1>Home</h1>" +
      (META.tagline ? '<p class="subtle">' + esc(META.tagline) + "</p>" : "") + kpis +
      "<h2>Pipeline</h2>" + (pipeRows.length ? table(["Deal", "Company", "Stage", "Value", "Prob"], pipeRows,
        ["<strong>Total</strong>", "", "", { num: "<strong>" + money(pipeline) + "</strong>" }, ""]) : '<p class="empty">No open deals.</p>') +
      "<h2>Follow-ups</h2>" + (taskRows.length ? tableRows(["Task", "Priority", "Due"], taskRows) : '<p class="empty">Nothing open.</p>') +
      "<h2>Recent activity</h2>" + (ints.length ? table(["Date", "Interaction", "Company"], ints.map(function (i) {
        return [esc(i.date || ""), link("interaction", i.id), i.company ? link("company", i.company) : ""];
      })) : '<p class="empty">No interactions yet.</p>') +
      directories()
    );
  }
  function kpi(n, l, kind) { return '<div class="card kpi"><div class="n' + (kind ? " " + kind : "") + '">' + n + '</div><div class="l">' + esc(l) + "</div></div>"; }
  function tableRows(cols, rows) { // rows: {overdue, cells}
    var head = "<tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) { return '<tr class="' + (r.overdue ? "overdue" : "") + '">' + r.cells.map(cell).join("") + "</tr>"; }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
  }
  function directories() {
    var c = all("contact").sort(byName).map(function (x) { return link("contact", x.id); });
    var co = all("company").sort(byName).map(function (x) { return link("company", x.id); });
    return relatedBlock("Contacts", c) + relatedBlock("Companies", co);
  }
  function byName(a, b) { return (a.name || "").localeCompare(b.name || ""); }

  // ---- router --------------------------------------------------------------
  var DISPATCH = { contact: renderContact, company: renderCompany, deal: renderDeal, interaction: renderInteraction, task: renderTask };
  function renderView() {
    applyBrand();
    var q = new URLSearchParams(location.search);
    var type = q.get("type"), id = q.get("id");
    var e = get(type, id);
    if (!e) { mount('<h1>Not found</h1><p class="empty">No ' + esc(type || "entity") + ' with id "' + esc(id || "") + '".</p><p><a href="index.html">← Home</a></p>'); return; }
    document.title = e.name + " · CRM";
    DISPATCH[type](e);
  }

  window.CRMRender = { home: renderHome, view: renderView };
})();
