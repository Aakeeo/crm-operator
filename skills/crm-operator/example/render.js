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
  function bucket(type) {
    if (type && type.indexOf("obj:") === 0) return (CRM.objects && CRM.objects[type.slice(4)]) || {};
    return CRM[PLURAL[type] || type] || {};
  }
  function get(type, id) { return bucket(type)[id]; }
  function all(type) { return Object.values(bucket(type)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function money(n) { return n == null ? "" : "$" + Number(n).toLocaleString("en-US"); }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  // ---- business profile (per-business labels, stages, custom fields) -------
  // meta.profile lets one CRM read as a law firm, another as a brokerage, etc.
  // Everything below falls back to the generic defaults when no profile is set.
  var PROFILE = META.profile || {};
  var DEFAULT_LABELS = {
    contact: { one: "Contact", many: "Contacts" }, company: { one: "Company", many: "Companies" },
    deal: { one: "Deal", many: "Deals" }, interaction: { one: "Interaction", many: "Interactions" },
    task: { one: "Task", many: "Tasks" }
  };
  function label(type, many) {
    if (type && type.indexOf("obj:") === 0) {
      var def = objectDef(type.slice(4));
      if (def) return many ? (def.many || def.type) : (def.one || def.type);
      return type.slice(4);
    }
    var d = DEFAULT_LABELS[type] || { one: type, many: type };
    var l = (PROFILE.labels && PROFILE.labels[type]) || {};
    return many ? (l.many || d.many) : (l.one || d.one);
  }
  var DEFAULT_OPEN_STAGES = ["lead", "qualified", "proposal", "negotiation"];
  function openStages() { return (PROFILE.stages && PROFILE.stages.length) ? PROFILE.stages.slice() : DEFAULT_OPEN_STAGES.slice(); }
  function allStages() { return openStages().concat(["closed-won", "closed-lost"]); }
  function stageLabel(s) { return (PROFILE.stageLabels && PROFILE.stageLabels[s]) || s; }
  function isClosed(s) { return s === "closed-won" || s === "closed-lost"; }
  function fieldDefs(type) { return (PROFILE.fields && PROFILE.fields[type]) || []; }
  function fmtVal(f, v) { return f && f.num ? Number(v).toLocaleString("en-US") : v; }
  // Render a definition list for any field set that carries a value (stored on e.fields).
  function fieldsDl(defs, e) {
    if (!defs || !defs.length) return "";
    var rows = defs.map(function (f) {
      var v = e.fields && e.fields[f.key];
      if (v == null || v === "") return "";
      return '<div class="dt">' + esc(f.label || f.key) + '</div><div class="dd">' + esc(fmtVal(f, v)) + "</div>";
    }).filter(Boolean).join("");
    return rows ? '<div class="fielddl">' + rows + "</div>" : "";
  }
  function extrasHtml(type, e) { return fieldsDl(fieldDefs(type), e); }

  // ---- custom objects (per-business entity types beyond the core five) -----
  function objectDefs() { return PROFILE.objects || []; }
  function objectDef(ot) { var a = objectDefs(); for (var i = 0; i < a.length; i++) if (a[i].type === ot) return a[i]; return null; }

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
  // Color a stage badge. Honors explicit profile.stageColors, then known defaults,
  // then infers a gradient by position for custom pipelines (later = warmer).
  function stageKind(s) {
    if (s === "closed-won") return "good";
    if (s === "closed-lost") return "bad";
    if (PROFILE.stageColors && PROFILE.stageColors[s] != null) return PROFILE.stageColors[s];
    if (!(PROFILE.stages && PROFILE.stages.length) && STAGE_KIND[s] != null) return STAGE_KIND[s];
    var arr = openStages(), i = arr.indexOf(s), n = arr.length;
    if (i === -1) return STAGE_KIND[s] || "";
    if (i >= n - 1) return "warn";
    if (i >= Math.ceil(n / 2)) return "accent";
    return "";
  }
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
    applyNavLabels();
  }
  // Relabel the static nav from the profile, and append one item per custom object type.
  function applyNavLabels() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    var map = { deals: ["deal", true], contacts: ["contact", true], companies: ["company", true] };
    var links = document.querySelectorAll(".topnav a[data-nav]");
    for (var i = 0; i < links.length; i++) {
      var k = links[i].getAttribute && links[i].getAttribute("data-nav");
      if (map[k]) links[i].textContent = label(map[k][0], map[k][1]);
    }
    var objs = PROFILE.objects || [];
    var nav = document.querySelector ? document.querySelector(".topnav") : null;
    if (nav && objs.length && typeof document.createElement === "function" && !(nav.getAttribute && nav.getAttribute("data-objs"))) {
      var settings = nav.querySelector ? nav.querySelector('a[data-nav="settings"]') : null;
      objs.forEach(function (o) {
        var a = document.createElement("a");
        a.setAttribute("data-nav", "obj:" + o.type);
        a.setAttribute("href", "list.html?type=obj:" + encodeURIComponent(o.type));
        a.textContent = o.many || o.type;
        if (settings) nav.insertBefore(a, settings); else nav.appendChild(a);
      });
      nav.setAttribute("data-objs", "1");
    }
  }

  // ---- avatars (deterministic initials chip) -------------------------------
  var AV_PALETTE = [["#4f46e5", "#eef2ff"], ["#2563eb", "#eff6ff"], ["#7c3aed", "#f5f3ff"], ["#16a34a", "#f0fdf4"], ["#d97706", "#fffbeb"]];
  function initials(name) {
    var p = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function nhash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function avatar(name, opts) {
    opts = opts || {}; var size = opts.size || 24, pair = AV_PALETTE[nhash(String(name || "")) % AV_PALETTE.length];
    return '<span class="avatar' + (opts.square ? " sq" : "") + '" title="' + esc(name) + '" style="width:' + size + "px;height:" + size + "px;font-size:" + Math.round(size * 0.38) + "px;color:" + pair[0] + ";background:" + pair[1] + '">' + esc(initials(name)) + "</span>";
  }
  function avatarLink(type, id, square) {
    var e = get(type, id), name = (e && e.name) || id;
    return '<span class="av-cell">' + avatar(name, { size: 24, square: square }) + link(type, id) + "</span>";
  }
  function chip(type, id, square) {
    var e = get(type, id), name = (e && e.name) || id;
    return '<a href="' + href(type, id) + '" class="chip">' + avatar(name, { size: 22, square: square }) + esc(name) + "</a>";
  }
  function setActiveNav(key) {
    var links = document.querySelectorAll(".topnav a");
    for (var i = 0; i < links.length; i++) if (links[i].classList) links[i].classList.toggle("active", links[i].getAttribute("data-nav") === key);
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
      '<p class="kicker">' + esc(label("contact")) + '</p><h1 class="has-av">' + avatar(e.name, { size: 40 }) + "<span>" + esc(e.name) + "</span></h1>" +
      '<div class="meta">' +
      (e.role ? "<span><b>" + esc(e.role) + "</b></span>" : "") +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      "<span>" + badge(e.status || "—", STATUS_KIND[e.status]) + "</span>" +
      (e.email ? '<span><a href="mailto:' + esc(e.email) + '">' + esc(e.email) + "</a></span>" : "") +
      (e.phone ? "<span>" + esc(e.phone) + "</span>" : "") +
      (e.last_contacted ? "<span>last contacted <b>" + esc(e.last_contacted) + "</b></span>" : "") +
      "</div>";
    mount(head + tagline(e) + extrasHtml("contact", e) +
      sectionsHtml(e) +
      relatedBlock(label("interaction", true) + " History", ints.map(function (i) { return link("interaction", i.id, i.date + " · " + i.name); })) +
      relatedBlock("Linked " + label("deal", true), deals.map(function (d) { return link("deal", d.id); })));
  }

  function renderCompany(e) {
    var contacts = all("contact").filter(function (c) { return c.company === e.id; });
    var deals = all("deal").filter(function (d) { return d.company === e.id && d.stage !== "closed-lost"; });
    var head =
      '<p class="kicker">' + esc(label("company")) + '</p><h1 class="has-av">' + avatar(e.name, { size: 40, square: true }) + "<span>" + esc(e.name) + "</span></h1>" +
      '<div class="meta">' +
      (e.industry ? "<span><b>" + esc(e.industry) + "</b></span>" : "") +
      (e.size ? "<span>" + esc(e.size) + "</span>" : "") +
      (e.location ? "<span>" + esc(e.location) + "</span>" : "") +
      "<span>" + badge(e.status || "—", STATUS_KIND[e.status]) + "</span>" +
      (e.domain ? '<span><a href="https://' + esc(e.domain) + '" target="_blank" rel="noopener">' + esc(e.domain) + "</a></span>" : "") +
      (e.arr_potential ? "<span>ARR potential <b>" + money(e.arr_potential) + "</b></span>" : "") +
      "</div>";
    var ctable = contacts.length ? table(["Name", "Role", "Status", "Last contact"], contacts.map(function (c) {
      return [avatarLink("contact", c.id), esc(c.role || ""), badge(c.status || "—", STATUS_KIND[c.status]), { num: c.last_contacted || "—" }];
    })) : '<p class="empty">No contacts yet.</p>';
    var dtable = deals.length ? table(["Deal", "Stage", "Value", "Prob"], deals.map(function (d) {
      return [link("deal", d.id), badge(stageLabel(d.stage), stageKind(d.stage)), { num: money(d.value) }, { num: (d.probability || 0) + "%" }];
    })) : '<p class="empty">No active deals.</p>';
    mount(head + tagline(e) + extrasHtml("company", e) + sectionsHtml(e) + "<h2>Key " + esc(label("contact", true)) + "</h2>" + ctable + "<h2>Active " + esc(label("deal", true)) + "</h2>" + dtable);
  }

  function renderDeal(e) {
    var ints = all("interaction").filter(function (i) { return i.deal === e.id; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var head =
      '<p class="kicker">' + esc(label("deal")) + '</p><h1>' + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      "<span><b>" + money(e.value) + "</b> " + esc(e.currency || "") + "</span>" +
      "<span>" + badge(stageLabel(e.stage), stageKind(e.stage)) + "</span>" +
      "<span>" + (e.probability || 0) + "% prob</span>" +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      (e.primary_contact ? "<span>" + link("contact", e.primary_contact) + "</span>" : "") +
      (e.expected_close ? "<span>close <b>" + esc(e.expected_close) + "</b></span>" : "") +
      "</div>";
    mount(head + tagline(e) + extrasHtml("deal", e) + sectionsHtml(e) +
      relatedBlock(label("interaction", true), ints.map(function (i) { return link("interaction", i.id, i.date + " · " + i.name); })));
  }

  function renderInteraction(e) {
    var parts = (e.participants || []).map(function (p) { return link("contact", p); });
    var head =
      '<p class="kicker">' + esc(label("interaction")) + " · " + esc(e.interaction_type || "") + '</p><h1>' + esc(e.name) + "</h1>" +
      '<div class="meta">' +
      (e.date ? "<span><b>" + esc(e.date) + "</b></span>" : "") +
      (e.company ? "<span>" + link("company", e.company) + "</span>" : "") +
      (e.deal ? "<span>" + link("deal", e.deal) + "</span>" : "") +
      (e.source && e.source.meet_url ? '<span><a href="' + esc(e.source.meet_url) + '" target="_blank" rel="noopener">Join Meet</a></span>' : "") +
      (e.source && e.source.event_url ? '<span><a href="' + esc(e.source.event_url) + '" target="_blank" rel="noopener">Calendar</a></span>' : "") +
      (e.source && e.source.channel && e.source.channel !== "manual" ? "<span>" + badge("via " + e.source.channel) + "</span>" : "") +
      "</div>" +
      (e.summary ? '<p class="subtle">' + esc(e.summary) + "</p>" : "");
    mount(head + extrasHtml("interaction", e) +
      relatedBlock("Participants", parts) +
      sectionsHtml(e));
  }

  function renderTask(e) {
    var rel = (e.related_to || []).map(function (name) {
      var r = resolveName(name); return r ? link(r.type, r.id) : '<span class="empty">' + esc(name) + "</span>";
    });
    var overdue = e.due_date && e.status !== "done" && e.due_date < today();
    var head =
      '<p class="kicker">' + esc(label("task")) + '</p><h1>' + esc(e.title || e.name) + "</h1>" +
      '<div class="meta">' +
      "<span>" + badge(e.status || "todo", e.status === "done" ? "good" : "") + "</span>" +
      "<span>" + badge((e.priority || "medium") + " priority", PRIO_KIND[e.priority]) + "</span>" +
      (e.due_date ? "<span>due <b>" + esc(e.due_date) + "</b>" + (overdue ? " " + badge("overdue", "bad") : "") + "</span>" : "") +
      (e.assigned_to ? "<span>" + esc(e.assigned_to) + "</span>" : "") +
      "</div>";
    mount(head + extrasHtml("task", e) + sectionsHtml(e) + relatedBlock("Related", rel));
  }

  // ---- shared table builder ------------------------------------------------
  function cell(c) {
    if (c && typeof c === "object" && "num" in c) return '<td class="num">' + c.num + "</td>";
    return "<td>" + c + "</td>";
  }
  function table(cols, rows, foot) {
    var head = "<tr>" + cols.map(function (c) {
      return /prob|value|arr|due|close|contact/i.test(c) ? '<th class="num">' + esc(c) + "</th>" : "<th>" + esc(c) + "</th>";
    }).join("") + "</tr>";
    var body = rows.map(function (r) { return "<tr>" + r.map(cell).join("") + "</tr>"; }).join("");
    var footer = foot ? "<tfoot><tr>" + foot.map(cell).join("") + "</tr></tfoot>" : "";
    return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody>" + footer + "</table>";
  }

  // ---- home / dashboards ---------------------------------------------------
  function renderHome() {
    applyBrand();
    setActiveNav("home");
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
      kpi(open.length, "Open " + label("deal", true), "plain"),
      kpi(all("contact").length, label("contact", true), "plain"),
      kpi(overdue.length, "Overdue " + label("task", true), overdue.length ? "bad" : "plain")
    ].join("") + "</div>";

    var stageOrder = allStages();
    var pipeRows = open.slice().sort(function (a, b) {
      return stageOrder.indexOf(b.stage) - stageOrder.indexOf(a.stage) || (b.value || 0) - (a.value || 0);
    }).map(function (d) {
      return [link("deal", d.id), d.company ? avatarLink("company", d.company, true) : "", badge(stageLabel(d.stage), stageKind(d.stage)),
        { num: money(d.value) }, { num: (d.probability || 0) + "%" }];
    });

    var taskRows = tasks.map(function (t) {
      var od = t.due_date && t.due_date < today();
      return { overdue: od, cells: [link("task", t.id, t.title || t.name), badge(t.priority || "medium", PRIO_KIND[t.priority]), { num: t.due_date || "—" }] };
    });

    var ints = all("interaction").sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 8);

    mount(
      '<div id="update-banner"></div>' +
      '<p class="kicker">' + esc(META.business || "CRM") + "</p><h1>Home</h1>" +
      (META.tagline ? '<p class="subtle">' + esc(META.tagline) + "</p>" : "") + kpis +
      "<h2>Pipeline</h2>" + (pipeRows.length ? table([label("deal"), label("company"), "Stage", "Value", "Prob"], pipeRows,
        ["<strong>Total</strong>", "", "", { num: "<strong>" + money(pipeline) + "</strong>" }, ""]) : '<p class="empty">No open deals.</p>') +
      "<h2>Follow-ups</h2>" + (taskRows.length ? tableRows(["Task", "Priority", "Due"], taskRows) : '<p class="empty">Nothing open.</p>') +
      "<h2>Recent activity</h2>" + (ints.length ? table(["Date", "Interaction", "Company"], ints.map(function (i) {
        return [esc(i.date || ""), link("interaction", i.id), i.company ? link("company", i.company) : ""];
      })) : '<p class="empty">No interactions yet.</p>') +
      directories()
    );
    checkForUpdate();
  }
  function checkForUpdate() {
    if (typeof fetch !== "function") return;
    fetch("__crm").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.updateAvailable) return;
      var el = document.getElementById("update-banner");
      if (el) el.innerHTML = '<div class="banner">A newer version is available — <b>' + esc(j.latest) +
        "</b> (you have " + esc(j.version) + "). Run <code>npx skills update</code>, then reopen this CRM.</div>";
    }).catch(function () {});
  }
  function kpi(n, l, kind) { return '<div class="card kpi"><div class="n' + (kind ? " " + kind : "") + '">' + n + '</div><div class="l">' + esc(l) + "</div></div>"; }
  function tableRows(cols, rows) { // rows: {overdue, cells}
    var head = "<tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) { return '<tr class="' + (r.overdue ? "overdue" : "") + '">' + r.cells.map(cell).join("") + "</tr>"; }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
  }
  function directories() {
    var c = all("contact").sort(byName).map(function (x) { return chip("contact", x.id); });
    return relatedBlock(label("contact", true), c);
  }
  function byName(a, b) { return (a.name || "").localeCompare(b.name || ""); }

  // ---- list views ----------------------------------------------------------
  var LIST_CFG = {
    deals: {
      kicker: "Deals", title: "All Deals", rows: function () { return all("deal"); },
      head: [label("deal"), label("company"), "Stage", "Value", "Prob"],
      cell: function (d) { return [link("deal", d.id), d.company ? avatarLink("company", d.company, true) : "", badge(stageLabel(d.stage), stageKind(d.stage)), { num: money(d.value) }, { num: (d.probability || 0) + "%" }]; },
    },
    contacts: {
      kicker: "Contacts", title: "All Contacts", rows: function () { return all("contact").sort(byName); },
      head: ["Name", "Role", label("company"), "Status", "Last contact"],
      cell: function (c) { return [avatarLink("contact", c.id), esc(c.role || ""), c.company ? link("company", c.company) : "", badge(c.status || "—", STATUS_KIND[c.status]), { num: c.last_contacted || "—" }]; },
    },
    companies: {
      kicker: "Companies", title: "All Companies", rows: function () { return all("company").sort(byName); },
      head: [label("company"), "Industry", "Location", "Status", "ARR potential"],
      cell: function (c) { return [avatarLink("company", c.id, true), esc(c.industry || ""), esc(c.location || ""), badge(c.status || "—", STATUS_KIND[c.status]), { num: c.arr_potential ? money(c.arr_potential) : "—" }]; },
    },
    interactions: {
      kicker: "Activity", title: "All Interactions", rows: function () { return all("interaction").sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }); },
      head: ["Due", label("interaction"), label("company"), "Type"],
      cell: function (i) { return [{ num: i.date || "" }, link("interaction", i.id), i.company ? link("company", i.company) : "", esc(i.interaction_type || "")]; },
    },
    tasks: {
      kicker: "Tasks", title: "All Tasks", rows: function () { return all("task").sort(function (a, b) { return (a.due_date || "").localeCompare(b.due_date || ""); }); },
      head: [label("task"), "Priority", "Due", "Status"],
      cell: function (t) { return [link("task", t.id, t.title || t.name), badge(t.priority || "medium", PRIO_KIND[t.priority]), { num: t.due_date || "—" }, badge(t.status || "todo", t.status === "done" ? "good" : "")]; },
    },
  };
  function renderList() {
    applyBrand();
    var type = new URLSearchParams(location.search).get("type");
    setActiveNav(type);
    if (type && type.indexOf("obj:") === 0) return renderObjectList(type.slice(4));
    var cfg = LIST_CFG[type];
    if (!cfg) { mount('<h1>Not found</h1><p class="empty">Unknown list "' + esc(type || "") + '".</p><p><a href="index.html">← Home</a></p>'); return; }
    var sing = SINGULAR[type], ttl = sing ? "All " + label(sing, true) : cfg.title, kick = sing ? label(sing, true) : cfg.kicker;
    document.title = ttl + " · CRM";
    var rows = cfg.rows();
    mount('<p class="kicker">' + esc(kick) + "</p><h1>" + esc(ttl) + ' <span class="count">· ' + rows.length + "</span></h1>" +
      (rows.length ? table(cfg.head, rows.map(cfg.cell)) : '<p class="empty">Nothing here yet.</p>'));
  }

  // ---- search --------------------------------------------------------------
  function searchIndex() {
    var idx = [];
    TYPES.forEach(function (plur) {
      var sing = SINGULAR[plur];
      Object.keys(CRM[plur] || {}).forEach(function (id) {
        var e = CRM[plur][id], sub = "";
        if (sing === "contact") sub = [e.role, e.company && (get("company", e.company) || {}).name, e.email].filter(Boolean).join(" · ");
        else if (sing === "company") sub = [e.industry, e.location].filter(Boolean).join(" · ");
        else if (sing === "deal") sub = [e.company && (get("company", e.company) || {}).name, e.stage].filter(Boolean).join(" · ");
        else if (sing === "interaction") sub = e.date || "";
        else if (sing === "task") sub = [e.priority, e.due_date].filter(Boolean).join(" · ");
        var nm = e.name || e.title || id;
        idx.push({ type: sing, id: id, name: nm, sub: sub, hay: (nm + " " + sub + " " + (e.email || "") + " " + (e.tags || []).join(" ")).toLowerCase() });
      });
    });
    objectDefs().forEach(function (def) {
      var b = bucket("obj:" + def.type);
      Object.keys(b).forEach(function (id) {
        var e = b[id], nm = e.name || id;
        idx.push({ type: "obj:" + def.type, id: id, name: nm, sub: def.one || def.type, hay: (nm + " " + Object.keys(e.fields || {}).map(function (k) { return e.fields[k]; }).join(" ") + " " + (e.tags || []).join(" ")).toLowerCase() });
      });
    });
    return idx;
  }
  function wireSearch() {
    if (typeof document === "undefined" || !document.getElementById) return;
    var input = document.getElementById("crm-search");
    if (!input || typeof document.createElement !== "function") return;
    var idx = searchIndex();
    var box = document.createElement("div");
    box.className = "search-results"; box.style.display = "none";
    input.parentNode.appendChild(box);
    function close() { box.style.display = "none"; }
    function draw(q) {
      q = q.trim().toLowerCase();
      if (!q) return close();
      var hits = idx.filter(function (e) { return e.hay.indexOf(q) !== -1; }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (h) {
        return '<a class="sr-item" href="' + href(h.type, h.id) + '">' + avatar(h.name, { size: 22, square: h.type === "company" || h.type.indexOf("obj:") === 0 }) +
          '<span class="sr-main">' + esc(h.name) + "<small>" + esc(h.sub) + "</small></span><span class=\"badge\">" + esc(label(h.type)) + "</span></a>";
      }).join("") : '<div class="sr-empty">No matches</div>';
      box.style.display = "block";
    }
    input.addEventListener("input", function () { draw(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { var f = box.querySelector(".sr-item"); if (f) location.href = f.getAttribute("href"); }
      else if (ev.key === "Escape") { input.value = ""; close(); }
    });
    document.addEventListener("click", function (ev) { if (input.parentNode && !input.parentNode.contains(ev.target)) close(); });
  }

  // ---- new (create an entity, written to data.js via serve.mjs) ------------
  function optList(type) { return all(type).sort(byName).map(function (e) { return { v: e.id, t: e.name }; }); }
  function formCfg() {
    var base = {
      contact: { label: label("contact"), name: "name", fields: [
        { k: "name", label: "Name", req: true }, { k: "email", label: "Email" }, { k: "role", label: "Role" },
        { k: "company", label: label("company"), sel: optList("company") }, { k: "status", label: "Status", sel: ["prospect", "active", "inactive", "churned"] }] },
      company: { label: label("company"), name: "name", fields: [
        { k: "name", label: "Name", req: true }, { k: "industry", label: "Industry" }, { k: "location", label: "Location" },
        { k: "status", label: "Status", sel: ["prospect", "customer", "partner", "churned"] }, { k: "arr_potential", label: "ARR potential", num: true }] },
      deal: { label: label("deal"), name: "name", fields: [
        { k: "name", label: label("deal") + " name", req: true }, { k: "company", label: label("company"), sel: optList("company") },
        { k: "primary_contact", label: "Primary " + label("contact"), sel: optList("contact") }, { k: "value", label: "Value", num: true },
        { k: "stage", label: "Stage", sel: allStages().map(function (s) { return { v: s, t: stageLabel(s) }; }) }, { k: "probability", label: "Probability %", num: true }] },
      task: { label: label("task"), name: "title", fields: [
        { k: "title", label: "Title", req: true }, { k: "priority", label: "Priority", sel: ["high", "medium", "low"] },
        { k: "due_date", label: "Due date (YYYY-MM-DD)" }, { k: "status", label: "Status", sel: ["todo", "in-progress", "done"] }] },
    };
    // Append the business's custom fields for each entity (stored on entity.fields).
    Object.keys(base).forEach(function (t) {
      fieldDefs(t).forEach(function (f) {
        base[t].fields.push({ k: f.key, label: f.label || f.key, num: !!f.num, custom: true, sel: f.options || null });
      });
    });
    return base;
  }
  function renderNew() {
    applyBrand(); setActiveNav(null);
    var cfgs = formCfg();
    // One create form per custom object type too: name + its fields + links to core entities.
    objectDefs().forEach(function (def) {
      cfgs["obj:" + def.type] = { label: def.one || def.type, name: "name", obj: def.type, fields:
        [{ k: "name", label: "Name", req: true }]
          .concat((def.fields || []).map(function (f) { return { k: f.key, label: f.label || f.key, num: !!f.num, custom: true, sel: f.options || null }; }))
          .concat((def.links || []).map(function (lt) { return { k: "link__" + lt, label: label(lt), sel: optList(lt), linkType: lt }; }))
      };
    });
    var type = new URLSearchParams(location.search).get("type") || "contact";
    if (!cfgs[type]) type = "contact";
    var cfg = cfgs[type];
    var tabs = Object.keys(cfgs).map(function (t) { return '<a href="new.html?type=' + encodeURIComponent(t) + '" class="newtab' + (t === type ? " active" : "") + '">' + esc(cfgs[t].label) + "</a>"; }).join("");
    var fields = cfg.fields.map(function (f) {
      var input;
      if (f.sel) {
        var os = (f.sel || []).map(function (s) { return (s && typeof s === "object") ? s : { v: s, t: s }; });
        input = '<select id="f-' + f.k + '" class="inp"><option value="">—</option>' + os.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.t) + "</option>"; }).join("") + "</select>";
      } else input = '<input id="f-' + f.k + '" class="inp" type="text"' + (f.num ? ' inputmode="numeric"' : "") + ">";
      return '<label class="fld">' + esc(f.label) + (f.req ? ' <span style="color:var(--bad)">*</span>' : "") + "</label>" + input;
    }).join("");
    mount(
      '<p class="kicker">New</p><h1>Create</h1><div class="newtabs">' + tabs + "</div>" +
      '<div class="card" style="max-width:560px">' + fields +
      '<div style="margin-top:18px;display:flex;gap:10px;align-items:center"><button id="create-btn" class="btn">Create ' + esc(cfg.label) + '</button><span id="create-status" class="subtle"></span></div></div>' +
      '<div id="create-fallback"></div>'
    );
    wireNew(type, cfg);
  }
  function wireNew(type, cfg) {
    var btn = document.getElementById("create-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var nameVal = valOf("f-" + cfg.name).trim();
      var status = document.getElementById("create-status");
      if (!nameVal) { status.textContent = "Name is required."; return; }
      var id = slug(nameVal), entity = { type: cfg.obj || type, id: id };
      cfg.fields.forEach(function (f) {
        var v = valOf("f-" + f.k); if (v === "" || v == null) return;
        var val = f.num ? Number(v) : v;
        if (f.linkType) { (entity.links = entity.links || {})[f.linkType] = [val]; }
        else if (f.custom) { (entity.fields = entity.fields || {})[f.k] = val; }
        else entity[f.k] = val;
      });
      entity.name = (type === "task") ? entity.title : nameVal;
      entity.created = today(); entity.updated = today(); entity.sections = {};
      status.textContent = "Creating…";
      var payload = cfg.obj ? { objType: cfg.obj, id: id, entity: entity } : { type: type, id: id, entity: entity };
      var dest = cfg.obj ? "obj:" + cfg.obj : type;
      fetch("__create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(t); }); })
        .then(function (j) { status.textContent = "Created — opening…"; setTimeout(function () { location.href = href(dest, j.id || id); }, 400); })
        .catch(function (e) {
          status.textContent = "Couldn't save.";
          document.getElementById("create-fallback").innerHTML = '<div class="callout" style="margin-top:14px">Creating writes to <code>data.js</code>, so the CRM must be served by <code>serve.mjs</code> (not a static server or <code>file://</code>). <br>' + esc(String((e && e.message) || e)) + "</div>";
        });
    });
  }

  // ---- custom object renderers ---------------------------------------------
  function renderObject(def, e) {
    var head = '<p class="kicker">' + esc(def.one || def.type) + '</p><h1 class="has-av">' + avatar(e.name, { size: 40, square: true }) + "<span>" + esc(e.name) + "</span></h1>";
    var links = (def.links || []).map(function (lt) {
      var ids = (e.links && e.links[lt]) || [];
      return relatedBlock(label(lt, true), ids.map(function (id) { return link(lt, id); }));
    }).join("");
    mount(head + tagline(e) + fieldsDl(def.fields, e) + sectionsHtml(e) + links);
  }
  function renderObjectList(ot) {
    var def = objectDef(ot);
    if (!def) { mount('<h1>Not found</h1><p class="empty">Unknown type "' + esc(ot) + '".</p><p><a href="index.html">← Home</a></p>'); return; }
    var b = bucket("obj:" + ot);
    var rows = Object.keys(b).map(function (id) { return b[id]; }).sort(byName);
    var fcols = (def.fields || []).slice(0, 4);
    var cols = ["Name"].concat(fcols.map(function (f) { return f.label || f.key; }));
    var body = rows.map(function (r) {
      return [avatarLink("obj:" + ot, r.id, true)].concat(fcols.map(function (f) {
        var v = r.fields && r.fields[f.key];
        return f.num ? { num: (v != null && v !== "" ? Number(v).toLocaleString("en-US") : "—") } : esc(v == null ? "" : v);
      }));
    });
    document.title = "All " + (def.many || ot) + " · CRM";
    mount('<p class="kicker">' + esc(def.many || ot) + '</p><h1>All ' + esc(def.many || ot) + ' <span class="count">· ' + rows.length + "</span></h1>" +
      (rows.length ? table(cols, body) : '<p class="empty">Nothing here yet.</p>'));
  }
  // Custom objects that point at a given core entity (reverse links).
  function objBacklinks(coreType, id) {
    var out = "";
    objectDefs().forEach(function (def) {
      if ((def.links || []).indexOf(coreType) === -1) return;
      var b = bucket("obj:" + def.type);
      var hits = Object.keys(b).map(function (k) { return b[k]; }).filter(function (r) { return ((r.links && r.links[coreType]) || []).indexOf(id) !== -1; });
      if (hits.length) out += relatedBlock(def.many || def.type, hits.map(function (r) { return link("obj:" + def.type, r.id); }));
    });
    return out;
  }

  // ---- router --------------------------------------------------------------
  var DISPATCH = { contact: renderContact, company: renderCompany, deal: renderDeal, interaction: renderInteraction, task: renderTask };
  function renderView() {
    applyBrand();
    setActiveNav(null);
    var q = new URLSearchParams(location.search);
    var type = q.get("type"), id = q.get("id");
    if (type && type.indexOf("obj:") === 0) {
      var def = objectDef(type.slice(4)), oe = get(type, id);
      if (!def || !oe) { mount('<h1>Not found</h1><p class="empty">No ' + esc(type) + ' with id "' + esc(id || "") + '".</p><p><a href="index.html">← Home</a></p>'); return; }
      setActiveNav(type);
      document.title = oe.name + " · CRM";
      renderObject(def, oe); return;
    }
    var e = get(type, id);
    if (!e) { mount('<h1>Not found</h1><p class="empty">No ' + esc(type || "entity") + ' with id "' + esc(id || "") + '".</p><p><a href="index.html">← Home</a></p>'); return; }
    document.title = e.name + " · CRM";
    DISPATCH[type](e);
    var bl = objBacklinks(type, id);
    if (bl) { var app = document.getElementById("app"); if (app) app.innerHTML += bl; }
  }

  // ---- settings (in-app branding editor) -----------------------------------
  function fieldRow(label, key, value, type) {
    return '<label class="fld">' + esc(label) + "</label>" +
      '<input id="f-' + key + '" type="' + type + '" value="' + esc(value) + '" class="inp">';
  }
  function renderSettings() {
    applyBrand();
    setActiveNav("settings");
    mount(
      '<p class="kicker">Settings</p><h1>Branding</h1>' +
      '<p class="subtle">Personalize how your CRM looks. Saves to <code>data.js</code> when served locally.</p>' +
      '<div class="card" style="max-width:540px">' +
        fieldRow("Business name", "business", META.business || "", "text") +
        fieldRow("Tagline", "tagline", META.tagline || "", "text") +
        '<label class="fld">Accent color</label>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<input id="f-accent" type="color" value="' + esc(META.accent || "#4f46e5") + '" class="inp-color">' +
          '<input id="f-accent-hex" type="text" value="' + esc(META.accent || "#4f46e5") + '" class="inp" style="width:120px">' +
        "</div>" +
        '<div style="margin-top:18px;display:flex;gap:10px;align-items:center">' +
          '<button id="save-brand" class="btn">Save</button>' +
          '<span id="save-status" class="subtle"></span>' +
        "</div>" +
      "</div><div id=\"save-fallback\"></div>"
    );
    wireSettings();
  }
  function wireSettings() {
    var color = document.getElementById("f-accent");
    var hex = document.getElementById("f-accent-hex");
    function preview(v) { if (document.documentElement && document.documentElement.style) document.documentElement.style.setProperty("--accent", v); }
    if (color) color.addEventListener("input", function () { if (hex) hex.value = color.value; preview(color.value); });
    if (hex) hex.addEventListener("input", function () { if (color) color.value = hex.value; preview(hex.value); });
    var btn = document.getElementById("save-brand");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var meta = { business: valOf("f-business"), tagline: valOf("f-tagline"), accent: valOf("f-accent-hex") || valOf("f-accent") };
      var status = document.getElementById("save-status");
      status.textContent = "Saving…";
      fetch("__save-meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(meta) })
        .then(function (r) { if (!r.ok) throw new Error("no server"); status.textContent = "Saved — reloading…"; setTimeout(function () { location.href = "index.html"; }, 500); })
        .catch(function () {
          preview(meta.accent);
          var b = document.getElementById("brand"); if (b) b.textContent = meta.business || "CRM";
          status.textContent = "Previewed — couldn't reach the save endpoint.";
          document.getElementById("save-fallback").innerHTML =
            '<div class="callout" style="margin-top:14px">Couldn\'t write to disk. The CRM must be served by crm-operator\'s own server (<code>scripts/serve.mjs</code>) — a plain static server or <code>file://</code> can\'t save. Restart it with <code>serve.mjs</code>, or paste this into <code>data.js</code>:<br><br><code>meta: ' + esc(JSON.stringify(meta)) + ',</code></div>';
        });
    });
  }
  function valOf(id) { var e = document.getElementById(id); return e ? e.value : ""; }

  window.CRMRender = { home: renderHome, view: renderView, settings: renderSettings, list: renderList, create: renderNew };
  wireSearch();
})();
