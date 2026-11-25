/*
 * Sophos ROI Calculator - UI (vanilla JS, no dependencies, inline SVG icons only).
 * State lives in one object `S`; the model (js/model.js) does all maths.
 */
(function () {
  "use strict";
  var CAT = window.ROI_CATALOG, M = window.ROIModel;
  var LS_CUR = "sophosRoi.current.v1", LS_SAVED = "sophosRoi.saved.v1";
  var S, step = 1, persona = "CFO", saveTimer = null, query = "";
  var LS_THEME = "sophosRoi.theme.v1";

  var UNIT = { user: "per user / yr", device: "per endpoint+server / yr", server: "per server / yr", userserver: "per user+server / yr", mobile: "per mobile device / yr", flat: "annual total" };
  var CATL = { endpoint: "Endpoint", edr: "EDR/XDR", search: "Telemetry search", soar: "SOAR", mdr: "MDR", ir: "Incident response", siem: "SIEM", logstore: "Log storage",
    retention: "Retention", identity: "Identity (ITDR)", ndr: "NDR", vuln: "Vulnerability mgmt", email: "Email", ztna: "ZTNA/VPN", firewall: "Firewall", mobile: "Mobile", cloud: "Cloud workloads" };
  var STEPS = [["Customer basics", "Size, currency, SOC team"], ["Current stack", "Vendors & products in use"], ["Sophos proposal", "Auto-mapped, adjustable"], ["Results", "ROI, TCO, talking points"]];
  var ADV = [
    ["growth", "Growth of consumption-billed costs", "%", "Data volumes grow each year"], ["analystHours", "Working hours per analyst / yr", "n", ""],
    ["triagePct", "Analyst time on triage & response", "%", ""], ["offloadMDR", "Triage work offloaded with Sophos MDR", "%", "24/7 managed"],
    ["offloadXDR", "Triage work offloaded with self-managed XDR", "%", "Automation / AI assist"], ["consFactor", "Conservative: share of soft value counted", "%", ""],
    ["incidents", "Incidents needing response / yr", "n", ""], ["incidentCostHr", "Business cost per incident hour", "cur", "Disruption + response effort"],
    ["curMTTD", "Current mean time to detect (h)", "n", ""], ["curMTTR", "Current mean time to respond (h)", "n", ""],
    ["sMTTD", "Sophos mean time to detect (h)", "n", "Sophos publishes 1 min avg (MDR)"], ["sMTTR", "Sophos mean time to respond (h)", "n", "Sophos publishes 25 min investigate + 12 min respond"],
    ["insPremium", "Annual cyber insurance premium", "cur", "0 = exclude"], ["insReduction", "Potential premium reduction", "%", "Potential only - not guaranteed"]
  ];

  // ---------- helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sym() { return CAT.currencies[S.customer.currency] || "£"; }
  function money(x) { return M.fmtMoney(x, sym()); }
  function short(x) { var a = Math.abs(x), s = sym(); return (x < 0 ? "-" : "") + (a >= 1e6 ? s + (a / 1e6).toFixed(1) + "m" : a >= 1e3 ? s + Math.round(a / 1e3) + "k" : s + Math.round(a)); }
  function n0(x) { return Math.round(x).toLocaleString("en-GB"); }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function vendorName(id) { if (id === "custom") return "Custom"; var n = id; CAT.competitors.forEach(function (c) { if (c.id === id) n = c.name; }); return n; }
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function cite(t) { return esc(t).replace(/\[(S\d+)\]/g, '<a href="#src-$1" class="cite">[$1]</a>'); }
  function lineByPid(pid) { for (var i = 0; i < S.lines.length; i++) if (S.lines[i].pid === pid) return S.lines[i]; return null; }
  function lineByUid(uid) { for (var i = 0; i < S.lines.length; i++) if (S.lines[i].uid === uid) return S.lines[i]; return null; }
  function retireLabel(r) { return r === "keep" ? "Retained" : "Year " + r; }

  // ---------- state & persistence ----------
  function sanitize(o) {
    var d = M.defaultState(CAT);
    if (!o || typeof o !== "object") return d;
    ["scenario", "platform", "presetId"].forEach(function (k) { if (o[k] !== undefined) d[k] = o[k]; });
    if (d.scenario !== "Conservative") d.scenario = "Expected";
    if (o.customer) Object.keys(d.customer).forEach(function (k) { if (o.customer[k] !== undefined) d.customer[k] = k === "name" || k === "currency" ? String(o.customer[k]) : M.num(o.customer[k]); });
    if (!CAT.currencies[d.customer.currency]) d.customer.currency = "GBP";
    if (o.adv) Object.keys(d.adv).forEach(function (k) { if (o.adv[k] !== undefined) d.adv[k] = M.num(o.adv[k]); });
    ["endpointPhaseYear", "onboarding"].forEach(function (k) { if (o[k] !== undefined) d[k] = M.num(o[k]); });
    if (o.addons && typeof o.addons === "object") Object.keys(o.addons).forEach(function (k) { d.addons[k] = !!o.addons[k]; });
    if (o.prices && typeof o.prices === "object") Object.keys(o.prices).forEach(function (k) { d.prices[k] = M.num(o.prices[k]); });
    if (Array.isArray(o.lines)) d.lines = o.lines.filter(function (l) { return l && l.unit && UNIT[l.unit]; }).map(function (l) {
      return { uid: String(l.uid || ("l" + Math.random().toString(36).slice(2, 8))), pid: l.pid || null, vendor: String(l.vendor || "custom"), name: String(l.name || "Custom line"),
        cats: Array.isArray(l.cats) ? l.cats.filter(function (c) { return CATL[c]; }) : [], unit: l.unit, price: M.num(l.price), grows: !!l.grows,
        billing: l.billing || "per-unit", retire: l.retire === "keep" || l.retire === "auto" ? l.retire : (l.retire ? M.num(l.retire, 1) : "auto") };
    });
    d.vendors = Array.isArray(o.vendors) ? o.vendors.filter(function (v) { return typeof v === "string"; }) : [];
    d.lines.forEach(function (l) { var v = l.vendor === "custom" ? "other" : l.vendor; if (d.vendors.indexOf(v) < 0) d.vendors.push(v); });
    return d;
  }
  function encodeState(st) {
    var bytes = new TextEncoder().encode(JSON.stringify(st)), bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeState(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "=";
    var bin = atob(str), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function shareUrl() { return location.href.split("#")[0] + "#s=" + encodeState(S); }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_CUR, JSON.stringify(S)); } catch (e) { /* storage may be disabled */ }
      try { history.replaceState(null, "", "#s=" + encodeState(S)); } catch (e) { /* file:// in some browsers */ }
    }, 350);
  }
  function loadInitial() {
    var h = location.hash;
    if (h.indexOf("#s=") === 0) { try { step = 4; return sanitize(decodeState(h.slice(3))); } catch (e) { console.warn("Bad share link", e); } }
    try { var c = localStorage.getItem(LS_CUR); if (c) return sanitize(JSON.parse(c)); } catch (e) { /* ignore */ }
    return sanitize(M.defaultState(CAT));
  }
  function setState(ns, goStep, msg) { S = sanitize(ns); if (goStep) step = goStep; render(); persist(); if (msg) toast(msg); }

  // ---------- icons (inline SVG, no external assets) ----------
  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 17H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16"/>', export: '<path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    save: '<path d="M5 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-7-4-7 4z"/>', moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', trash: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', right: '<path d="M5 12h14m-6-6 6 6-6 6"/>', left: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    bulb: '<path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };
  function ic(n, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>"; }
  function pill(txt, kind) { return '<span class="pill ' + (kind || "grey") + '"><i></i>' + txt + "</span>"; }
  function tip(txt) { return '<span class="tip">' + ic("bulb") + "<span><b>Tip:</b> " + txt + "</span></span>"; }
  function cardHead(title, sub, right) { return '<div class="card-h"><div><h2>' + title + "</h2>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (right ? '<div class="card-r">' + right + "</div>" : "") + "</div>"; }
  function dark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  // ---------- rendering: chrome ----------
  function stepCount(i) {
    if (i === 2) return S.lines.length;
    if (i === 3) { var R = M.resolve(S, CAT); return 1 + R.addons.filter(function (a) { return a.on; }).length; }
    return null;
  }
  function renderTabs() {
    var r = M.compute(S, CAT);
    var tabs = STEPS.map(function (s, i) {
      var n = i + 1, c = stepCount(n);
      return '<button type="button" class="tab' + (n < step ? " done" : "") + '" data-go="' + n + '"' + (n === step ? ' aria-current="step"' : "") + '><span class="num">' + (n < step ? ic("check") : n) + "</span>" + s[0] + (c != null ? '<span class="cnt">' + c + "</span>" : "") + "</button>";
    }).join("");
    var sc = ["Expected", "Conservative"].map(function (k) {
      return '<button type="button" class="chip" data-scen="' + k + '" aria-pressed="' + (S.scenario === k) + '">' + k + '<span class="cnt">' + (k === "Expected" ? "100%" : pct(S.adv.consFactor)) + "</span></button>";
    }).join("");
    $("#tabs").innerHTML = '<nav class="tabs-l" aria-label="Steps">' + tabs + '</nav><div class="tabs-r" role="group" aria-label="Scenario"><span class="lbl">Soft value counted</span>' + sc + "</div>";
  }
  function tile(k, v, s, cls) { return '<div class="tile"><div class="k">' + k + '</div><div class="v ' + (cls || "") + '">' + v + '</div><div class="s">' + s + "</div></div>"; }
  function renderHero(r) {
    var el = $("#hero"), has = S.lines.length > 0, nm = S.customer.name;
    if (step < 4) {
      el.className = "hero";
      el.innerHTML = '<div class="hero-l"><div class="eyebrow">Sophos ROI Calculator</div><h1>Build the business case for any customer</h1>' +
        "<p>Compare the current security stack with a Sophos proposal: 3-year TCO, ROI, payback and SOC impact, ready for your CFO, Procurement and CISO conversations.</p>" +
        '<button type="button" class="btn primary pill-btn" data-newscn>' + ic("plus") + " New scenario</button></div>" +
        '<div class="tiles" aria-live="polite" aria-label="Live summary">' +
        tile("3-yr total value", has ? short(r.tot3) : "&mdash;", has ? esc(nm || "Customer") + " &middot; " + S.scenario : "Add the current stack", "w") +
        tile("3-yr ROI", has ? pct(r.roi) : "&mdash;", has ? "Value &divide; Sophos investment" : "Step 2", "amber") +
        tile("Payback", has ? r.payback.toFixed(1) + "<small> mo</small>" : "&mdash;", has ? "Year-1 investment recovered" : "Step 2", "teal") + "</div>";
    } else {
      var neg = r.tot3 < 0;
      el.className = "hero results";
      el.innerHTML = '<div class="hero-top"><div class="hero-l"><div class="eyebrow">Sophos ROI &middot; Results</div>' +
        "<h1>" + (neg ? "<em>" + money(-r.tot3) + "</em> net investment over 3 years" : "<em>" + money(r.tot3) + "</em> value over 3 years") + "</h1>" +
        "<p>" + esc(nm || "Customer") + ": current stack vs " + esc(r.resolved.platform.name) + " &middot; " + S.scenario + " scenario" + (S.scenario === "Conservative" ? " (" + pct(r.sf) + " of soft value counted)" : "") + ".</p></div>" +
        '<span class="status"><i></i>Illustrative pricing</span></div>' +
        '<div class="strip">' +
        tile("3-yr total value", money(r.tot3), money(r.hard3) + " hard + " + money(r.soft3) + " soft", "blue") +
        tile("3-yr ROI", pct(r.roi), "Value &divide; Sophos investment", "orange") +
        tile("Payback", r.payback.toFixed(1) + "<small> months</small>", "Year-1 investment recovered", "amber") +
        tile("3-yr TCO", (r.hard3 >= 0 ? pct(r.tcoRed) + "<small> lower</small>" : pct(-r.tcoRed) + "<small> higher</small>"), money(r.sop3) + " vs " + money(r.cur3) + " today", "red") + "</div>";
    }
  }
  function renderDock(r) {
    var has = S.lines.length > 0, live = has ? '<span class="d-m"><span>3-yr value</span><b>' + short(r.tot3) + '</b></span><span class="d-m"><span>ROI</span><b>' + pct(r.roi) + '</b></span><span class="d-m"><span>Payback</span><b>' + r.payback.toFixed(1) + " mo</b></span>" : '<span class="d-hint">Add the current stack in step 2 to see live savings.</span>';
    $("#dock").innerHTML = '<div class="dock-in">' + (step > 1 ? '<button type="button" class="btn ghost" data-go="' + (step - 1) + '">' + ic("left") + " Back</button>" : "<span></span>") +
      '<div class="d-live">' + (step < 4 ? live : '<span class="d-hint">Scenario &middot; ' + S.scenario + "</span>") + "</div>" +
      (step < 4 ? '<button type="button" class="btn primary" data-go="' + (step + 1) + '">' + (step === 3 ? "View results" : "Next: " + STEPS[step][0]) + " " + ic("right") + "</button>" : '<button type="button" class="btn primary" data-dl>' + ic("download") + " Download report</button>") + "</div>";
  }
  function field(label, key, val, opts) {
    opts = opts || {};
    var id = "f_" + key, attr = opts.attr || 'data-c="' + key + '"';
    var input = opts.select ? '<select id="' + id + '" ' + attr + ">" + opts.select + "</select>"
      : '<input id="' + id + '" ' + attr + ' type="' + (opts.text ? "text" : "number") + '" ' + (opts.text ? "" : 'min="0" step="' + (opts.step || "any") + '" inputmode="decimal"') + ' value="' + esc(val) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + ">";
    return '<div class="field"><label for="' + id + '">' + label + "</label>" + input + (opts.sub ? '<span class="sub">' + opts.sub + "</span>" : "") + "</div>";
  }

  // ---------- step 1 ----------
  function step1() {
    var c = S.customer;
    var cur = '<div class="field"><label id="curLbl">Currency</label><div class="chips cur" role="group" aria-labelledby="curLbl">' + Object.keys(CAT.currencies).map(function (k) {
      return '<button type="button" class="chip" data-cur="' + k + '" aria-pressed="' + (k === c.currency) + '">' + CAT.currencies[k] + " " + k + "</button>"; }).join("") + '</div><span class="sub">Symbol only - no FX conversion</span></div>';
    return '<div class="two">' +
      '<section class="card" aria-labelledby="h1s">' + cardHead('<span id="h1s">Customer basics</span>', "Who you are building the case for and how big they are.", tip("use <b>Load example</b> above to start from a worked scenario.")) +
      '<div class="grid">' +
      field("Customer name", "name", c.name, { text: true, ph: "e.g. Acme Ltd" }) +
      field("Users", "users", c.users, { sub: "Licensed users (per-user pricing)" }) +
      field("Endpoints", "endpoints", c.endpoints, { sub: "Laptops and desktops" }) +
      field("Servers", "servers", c.servers, { sub: "Physical, virtual and cloud" }) +
      field("Mobile devices", "mobile", c.mobile, { sub: "Phones and tablets (0 = none)" }) +
      "</div></section>" +
      '<section class="card" aria-labelledby="h1b">' + cardHead('<span id="h1b">SOC team &amp; currency</span>', "Drives the analyst-capacity value.") +
      '<div class="grid one">' + cur +
      field("SOC / security analysts", "analysts", c.analysts, { sub: "People triaging alerts today" }) +
      field("Loaded cost per analyst (" + sym() + ")", "analystCost", c.analystCost, { sub: "Salary + on-costs, per year" }) +
      "</div></section></div>";
  }

  // ---------- step 2 ----------
  function retireSelect(l, resolved) {
    var auto = "Auto (" + (resolved === "keep" ? "keep" : "retire Y" + resolved) + ")";
    var opts = [["auto", auto], ["1", "Retire Year 1"], ["2", "Retire Year 2"], ["3", "Retire Year 3"], ["keep", "Keep (not replaced)"]];
    return '<select class="mini" data-retire="' + l.uid + '" aria-label="When is ' + esc(l.name) + ' replaced">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(l.retire) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>";
  }
  function productRow(p, comp, R) {
    var l = lineByPid(p.id), on = !!l, line = l || { price: p.price, unit: p.unit };
    var res = on ? R.lines.filter(function (x) { return x.line.uid === l.uid; })[0] : null;
    var q = M.qty(p.unit, S.customer);
    return '<div class="tr prow' + (on ? "" : " off") + '" data-s="' + esc((comp.name + " " + p.name + " " + p.cats.join(" ")).toLowerCase()) + '">' +
      '<input type="checkbox" data-prod="' + p.id + '" id="p_' + p.id + '"' + (on ? " checked" : "") + ' aria-label="' + esc(comp.name + " " + p.name) + ' in use">' +
      '<label class="pname" for="p_' + p.id + '"><b>' + esc(on ? l.name : p.name) + "</b>" + (p.billing === "consumption" ? '<span class="badge cons" title="Billed on data ingested / stored">Consumption</span>' : "") +
      "<small>" + p.cats.map(function (c) { return CATL[c]; }).join(" · ") + "</small></label>" +
      '<span class="status-c">' + (on ? pill("In use", "green") : pill("Not used", "grey")) + "</span>" +
      '<span class="in-pre when-on">' + '<span class="cur">' + sym() + '</span><input class="in-num" type="number" min="0" step="any" inputmode="decimal" data-lp="' + (on ? l.uid : "") + '" value="' + line.price + '" aria-label="' + esc(p.name) + ' price ' + UNIT[p.unit] + '"' + (on ? "" : " disabled") + '><small class="qty">' + UNIT[p.unit] + "</small></span>" +
      '<span class="qty r when-on">' + (p.unit === "flat" ? "&ndash;" : "× " + n0(q)) + "</span>" +
      '<span class="cost r when-on" data-out="line:' + (on ? l.uid : "") + '">' + (on ? money(q * l.price) : "") + "</span>" +
      '<span class="opts when-on">' + (on ? '<label class="chk"><input type="checkbox" data-grows="' + l.uid + '"' + (l.grows ? " checked" : "") + "> grows with data</label>" + retireSelect(l, res.retire) : "") + "</span></div>";
  }
  function customRow(l, R) {
    var res = R.lines.filter(function (x) { return x.line.uid === l.uid; })[0], q = M.qty(l.unit, S.customer);
    var cats = Object.keys(CATL).map(function (c) { return '<option value="' + c + '"' + (l.cats[0] === c ? " selected" : "") + ">" + CATL[c] + "</option>"; }).join("");
    var units = Object.keys(UNIT).map(function (u) { return '<option value="' + u + '"' + (l.unit === u ? " selected" : "") + ">" + UNIT[u] + "</option>"; }).join("");
    return '<div class="tr prow" data-s="' + esc((l.name + " custom").toLowerCase()) + '"><button type="button" class="icon-btn sm" data-remove="' + l.uid + '" aria-label="Remove ' + esc(l.name) + '">' + ic("trash") + "</button>" +
      '<span class="pname"><input class="custom-name" data-ln="' + l.uid + '" value="' + esc(l.name) + '" aria-label="Custom line name"><span class="pair"><select class="mini" data-lcat="' + l.uid + '" aria-label="Category">' + cats + '</select><select class="mini" data-lunit="' + l.uid + '" aria-label="Unit">' + units + "</select></span></span>" +
      '<span class="status-c">' + pill("Custom", "blue") + "</span>" +
      '<span class="in-pre">' + '<span class="cur">' + sym() + '</span><input class="in-num" type="number" min="0" step="any" data-lp="' + l.uid + '" value="' + l.price + '" aria-label="Custom line price"></span>' +
      '<span class="qty r">' + (l.unit === "flat" ? "&ndash;" : "× " + n0(q)) + '</span><span class="cost r" data-out="line:' + l.uid + '">' + money(q * l.price) + "</span>" +
      '<span class="opts"><label class="chk"><input type="checkbox" data-grows="' + l.uid + '"' + (l.grows ? " checked" : "") + "> grows with data</label>" + retireSelect(l, res.retire) + "</span></div>";
  }
  var T2HEAD = '<div class="tr th"><span></span><span>Product</span><span class="status-c">Status</span><span>Annual unit cost</span><span class="r">Qty</span><span class="r">Annual cost</span><span>Options</span></div>';
  function step2() {
    var R = M.resolve(S, CAT);
    var chips = CAT.competitors.map(function (c) {
      var cnt = S.lines.filter(function (l) { return l.vendor === c.id || (c.id === "other" && l.vendor === "custom"); }).length;
      return '<button type="button" class="chip" data-vendor="' + c.id + '" aria-pressed="' + (S.vendors.indexOf(c.id) >= 0) + '">' + esc(c.name) + (cnt ? '<span class="cnt">' + cnt + "</span>" : "") + "</button>";
    }).join("");
    var cards = CAT.competitors.filter(function (c) { return S.vendors.indexOf(c.id) >= 0; }).map(function (c) {
      var rows = c.products.map(function (p) { return productRow(p, c, R); }).join("");
      var cnt = S.lines.filter(function (l) { return l.vendor === c.id || (c.id === "other" && l.vendor === "custom"); }).length;
      if (c.id === "other") rows += S.lines.filter(function (l) { return l.vendor === "custom"; }).map(function (l) { return customRow(l, R); }).join("") +
        '<div class="tr add"><span></span><button type="button" class="btn ghost sm" data-addcustom>' + ic("plus") + " Add custom line</button></div>";
      return '<section class="card vendor" data-vcard>' + cardHead(esc(c.name), "Tick what the customer uses and edit the annual cost.", cnt ? pill(cnt + " in use", "green") : pill("None selected", "grey")) +
        '<div class="table">' + T2HEAD + rows + "</div></section>";
    }).join("");
    var y1 = 0; R.lines.forEach(function (x) { y1 += M.qty(x.line.unit, S.customer) * x.line.price; });
    return '<section class="card" aria-labelledby="h2s">' + cardHead('<span id="h2s">Current stack</span>', "Select every vendor in use (multi-vendor is fine), then tick their products. Costs are <b>illustrative placeholders</b>: overwrite with the customer's invoices.",
        tip("<span class=\"badge cons\">Consumption</span> lines grow with data volume each year.")) +
      '<div class="filters"><div class="chips" role="group" aria-label="Vendors in use">' + chips + '</div><label class="search">' + ic("search") + '<span class="sr-only">Search products</span><input type="search" data-q placeholder="Search products" value="' + esc(query) + '"></label></div></section>' +
      (cards || '<div class="empty">Choose one or more vendors above to see their product lines.</div>') +
      (S.lines.length ? '<p class="stack-total">Year-1 current cost <b data-out="stack-total">' + money(y1) + "</b></p>" : "");
  }
  function applyFilter() {
    var q = query.trim().toLowerCase();
    $$("[data-vcard]").forEach(function (v) {
      var any = false;
      $$(".prow", v).forEach(function (r) { var show = !q || (r.dataset.s || "").indexOf(q) >= 0; r.hidden = !show; if (show) any = true; });
      var add = $(".tr.add", v); if (add) add.hidden = !!q;
      v.hidden = !!q && !any;
    });
    var m = $("#noMatch");
    if (q && $$("[data-vcard]").length && !$$("[data-vcard]").some(function (v) { return !v.hidden; })) { if (!m) { m = document.createElement("div"); m.id = "noMatch"; m.className = "empty"; m.textContent = "No products match your search."; $("#step").appendChild(m); } }
    else if (m) m.remove();
  }

  // ---------- step 3 ----------
  function coveredBy(l, R) {
    var names = [];
    l.cats.forEach(function (c) {
      if (R.platform.covers.indexOf(c) >= 0) { if (names.indexOf(R.platform.name) < 0) names.push(R.platform.name); return; }
      R.addons.forEach(function (a) { if (a.on && a.def.covers.indexOf(c) >= 0 && names.indexOf(a.def.name) < 0) names.push(a.def.name); });
    });
    return names;
  }
  function step3() {
    var R = M.resolve(S, CAT), c = S.customer;
    var map = S.lines.length ? '<div class="table map"><div class="tr th"><span>Current tool</span><span>Covered by Sophos</span><span>Timing</span></div>' + R.lines.map(function (x) {
      var by = coveredBy(x.line, R);
      return '<div class="tr"><span class="pname"><b>' + esc(x.line.name) + "</b><small>" + esc(vendorName(x.line.vendor)) + "</small></span>" +
        "<span>" + (by.length ? esc(by.join(" + ")) : '<span class="muted">Not covered by the selected Sophos products</span>') + "</span>" +
        "<span>" + (x.retire === "keep" ? pill("Retained", "amber") : pill("Retire Year " + x.retire, "green")) + "</span></div>";
    }).join("") + "</div>" : '<div class="empty">No current stack yet. Add it in step 2, or this becomes a new-capability business case.</div>';
    var tiers = CAT.sophos.platforms.map(function (p) {
      var sel = p.id === R.platform.id;
      return '<label class="tier' + (sel ? " sel" : "") + '"><input type="radio" name="tier" data-tier="' + p.id + '"' + (sel ? " checked" : "") + '><span class="tn">' + esc(p.name) + "</span>" +
        (p.id === R.suggestedPlatform ? pill("Suggested", "green") : "") + "<p>" + esc(p.blurb) + "</p></label>";
    }).join("");
    var pu = "platform_" + R.platform.id + "_user", ps = "platform_" + R.platform.id + "_server";
    var platRows = '<div class="table"><div class="tr th a"><span>Item</span><span>Annual unit cost</span><span class="r">Qty</span><span class="r">Annual cost</span></div>' +
      '<div class="tr a"><span class="pname"><b>' + esc(R.platform.name) + "</b><small>Users</small></span>" +
      '<span class="in-pre">' + '<span class="cur">' + sym() + '</span><input class="in-num" type="number" min="0" step="any" data-pp="' + pu + '" value="' + R.userPrice + '" aria-label="Price per user per year"><small class="qty">per user / yr</small></span><span class="qty r">× ' + n0(c.users) + '</span><span class="cost r" data-out="plat:user">' + money(c.users * R.userPrice) + "</span></div>" +
      '<div class="tr a"><span class="pname"><b>' + esc(R.platform.name) + "</b><small>Servers</small></span>" +
      '<span class="in-pre">' + '<span class="cur">' + sym() + '</span><input class="in-num" type="number" min="0" step="any" data-pp="' + ps + '" value="' + R.serverPrice + '" aria-label="Price per server per year"><small class="qty">per server / yr</small></span><span class="qty r">× ' + n0(c.servers) + '</span><span class="cost r" data-out="plat:server">' + money(c.servers * R.serverPrice) + "</span></div></div>";
    var addons = '<div class="table"><div class="tr th b"><span></span><span>Add-on</span><span>Annual unit cost</span><span class="r">Qty</span><span class="r">Annual cost</span></div>' + R.addons.map(function (a) {
      var q = M.qty(a.def.unit, c), badges = (a.suggested ? pill("Suggested", "green") : "") + (a.def.newCapability ? pill("New capability", "blue") : "") + (a.available ? "" : pill("Needs XDR or MDR", "amber"));
      return '<div class="tr b' + (a.available ? "" : " dis") + '"><label class="switch"><input type="checkbox" data-addon="' + a.def.id + '"' + (a.on ? " checked" : "") + (a.available ? "" : " disabled") + ' aria-label="Include ' + esc(a.def.name) + '"><span></span></label>' +
        '<span class="pname"><b>' + esc(a.def.name) + "</b>" + badges + "<small>" + esc(a.def.blurb) + (a.why ? " · <i>" + esc(a.why) + "</i>" : "") + "</small></span>" +
        '<span class="in-pre">' + '<span class="cur">' + sym() + '</span><input class="in-num" type="number" min="0" step="any" data-ap="' + a.def.id + '" value="' + a.price + '" aria-label="' + esc(a.def.name) + ' price"><small class="qty">' + UNIT[a.def.unit] + "</small></span>" +
        '<span class="qty r">' + (a.def.unit === "flat" ? "&ndash;" : "× " + n0(q)) + '</span><span class="cost r" data-out="addon:' + a.def.id + '">' + (a.on ? money(q * a.price) : "&ndash;") + "</span></div>";
    }).join("") + "</div>";
    var ngOn = R.addons.some(function (a) { return a.on && a.def.id === "ngsiem"; });
    var py = [1, 2, 3].map(function (y) { return '<option value="' + y + '"' + (S.endpointPhaseYear === y ? " selected" : "") + ">Year " + y + "</option>"; }).join("");
    return '<section class="card" aria-labelledby="h3s">' + cardHead('<span id="h3s">How the current stack maps</span>', "Auto-suggested from step 2. Change anything below, or <button type=\"button\" class=\"link\" data-resetsug>reset to suggestions</button>.", tip("prices are illustrative; use your Sophos quote.")) + map + "</section>" +
      '<section class="card">' + cardHead("Platform", "Choose one. The suggested tier is based on what the customer runs today.") + '<div class="tiers" role="radiogroup" aria-label="Sophos platform">' + tiers + "</div>" + platRows + "</section>" +
      '<section class="card">' + cardHead("Add-ons", "Switch on what is in the proposal.") + addons +
      '<div class="note' + (ngOn ? "" : " warn") + '">' + ic("info") + '<span><b>Retention:</b> standard Sophos MDR/XDR data lake retention is <b>90 days</b>. 12+ months comes from <b>Sophos Next-Gen SIEM</b> (13 months by default, no ingest charges) or the Data Storage 1-year pack.</span></div></section>' +
      '<section class="card">' + cardHead("Timing &amp; services", "When existing tools are switched off and what migration costs.") + '<div class="grid">' +
      field("Retire existing endpoint/EDR from", "endpointPhaseYear", "", { select: py, attr: 'data-g="endpointPhaseYear"', sub: "Lets current contracts run to term (overlap is costed)" }) +
      field("One-time onboarding / migration (" + sym() + ")", "onboarding", S.onboarding, { attr: 'data-g="onboarding"', sub: "Partner services and internal effort (Year 1)" }) +
      "</div></section>";
  }

  // ---------- step 4 ----------
  function advField(a) {
    var v = S.adv[a[0]], disp = a[2] === "%" ? +(v * 100).toFixed(2) : v;
    var label = a[1] + (a[2] === "%" ? " (%)" : a[2] === "cur" ? " (" + sym() + ")" : "");
    return field(label, "adv_" + a[0], disp, { attr: 'data-adv="' + a[0] + '"' + (a[2] === "%" ? " data-pct" : ""), sub: a[3] });
  }
  function step4() {
    return '<div id="resultsOut"></div>' +
      '<details class="card adv" id="advanced"><summary><span><b>Advanced assumptions</b><small>SOC, risk and growth. Illustrative: edit to match the customer.</small></span></summary><div class="grid">' + ADV.map(advField).join("") + "</div></details>" +
      '<details class="card adv method" id="sources"><summary><span><b>Method &amp; sources</b><small>How every number is calculated, and where the facts come from.</small></span></summary>' +
      "<p><b>Current cost</b> = each ticked product × quantity × annual unit cost. Lines marked <i>grows with data</i> (consumption/ingest billing) increase by the growth % each year.</p>" +
      "<p><b>Sophos cost</b> = platform (users + servers) + enabled add-ons + one-time onboarding + any current lines still running (overlap until their retire year, or retained lines kept on both sides).</p>" +
      "<p><b>Hard saving</b> = current − Sophos. <b>Soft value</b> = analyst capacity freed (analysts × loaded cost × % triage × % offloaded) + incident cost avoided (incidents × hours saved × cost/hour) + potential insurance reduction. <b>Conservative</b> counts only the chosen share of soft value.</p>" +
      "<p><b>ROI</b> = 3-year total value ÷ 3-year Sophos investment (Sophos cost excluding retained tools). <b>Payback</b> = Year-1 investment ÷ monthly (Year-1 current cost avoided + soft value).</p>" +
      "<p>Analyst value is capacity redeployed, not necessarily headcount reduction. Insurance savings are potential only. Vendor facts below are from public pages (competitive claims are as stated by Sophos on its compare pages). <b>All prices are illustrative placeholders, not vendor pricing.</b></p>" +
      '<ol class="sources">' + CAT.sources.map(function (s) { return '<li id="src-' + s.id + '"><b>[' + s.id + "]</b> " + esc(s.text) + ' - <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + "</a></li>"; }).join("") + "</ol></details>";
  }
  function chartSVG(r) {
    var W = 560, H = 240, p = { l: 56, r: 12, t: 22, b: 30 }, max = Math.max.apply(null, r.cur.concat(r.sop, [1])) * 1.15, iw = W - p.l - p.r, ih = H - p.t - p.b;
    var y = function (v) { return p.t + ih - Math.max(v, 0) / max * ih; }, s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Annual cost, current stack versus Sophos, years 1 to 3">';
    for (var k = 0; k <= 4; k++) { var v = max * k / 4; s += '<line class="gl" x1="' + p.l + '" x2="' + (W - p.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (p.l - 6) + '" y="' + (y(v) + 4) + '" font-size="11" text-anchor="end">' + short(v) + "</text>"; }
    var gw = iw / 3, bw = Math.min(58, gw * 0.3);
    for (var i = 0; i < 3; i++) {
      var cx = p.l + gw * i + gw / 2;
      s += '<rect x="' + (cx - bw - 3) + '" y="' + y(r.cur[i]) + '" width="' + bw + '" height="' + (p.t + ih - y(r.cur[i])) + '" rx="4" fill="#B4BDD1"/><text class="vl" x="' + (cx - bw / 2 - 3) + '" y="' + (y(r.cur[i]) - 5) + '" font-size="11.5" text-anchor="middle">' + short(r.cur[i]) + "</text>";
      s += '<rect x="' + (cx + 3) + '" y="' + y(r.sop[i]) + '" width="' + bw + '" height="' + (p.t + ih - y(r.sop[i])) + '" rx="4" fill="#2f46f0"/><text class="vs" x="' + (cx + bw / 2 + 3) + '" y="' + (y(r.sop[i]) - 5) + '" font-size="11.5" text-anchor="middle" font-weight="700">' + short(r.sop[i]) + "</text>";
      s += '<text class="ax2" x="' + cx + '" y="' + (H - 9) + '" font-size="12" text-anchor="middle">Year ' + (i + 1) + "</text>";
    }
    return s + "</svg>";
  }
  function barRow(label, sub, frac, val, color, valColor) {
    return '<div class="brow"><div class="bl"><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + '</div><div class="bar"><i style="width:' + Math.max(0, Math.min(1, frac)) * 100 + "%;background:" + color + '"></i></div><div class="bv" style="color:' + (valColor || color) + '">' + val + "</div></div>";
  }
  function cumBars(r) {
    var m = Math.max.apply(null, r.cum.map(Math.abs).concat([1]));
    return r.cum.map(function (c, i) { return barRow("Year " + (i + 1), "", Math.max(0, c) / m, money(c), c < 0 ? "#e5484d" : "#12b886"); }).join("");
  }
  function table3(r) {
    var row = function (l, a, cls) { var t = a[0] + a[1] + a[2]; return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + esc(l) + "</td>" + a.map(function (x) { return '<td class="' + (x < 0 ? "neg" : "") + '">' + money(x) + "</td>"; }).join("") + '<td class="' + (t < 0 ? "neg" : "") + '">' + money(t) + "</td></tr>"; };
    var sec = function (t) { return '<tr class="sec"><td colspan="5">' + esc(t) + "</td></tr>"; };
    var h = '<table class="t3"><thead><tr><th scope="col">' + sym() + '</th><th scope="col">Year 1</th><th scope="col">Year 2</th><th scope="col">Year 3</th><th scope="col">3-yr total</th></tr></thead><tbody>' + sec("Current stack");
    r.curLines.forEach(function (l) { h += row(l.name + " (" + vendorName(l.vendor) + ")", l.costs); });
    if (!r.curLines.length) h += '<tr><td colspan="5" class="hint">No current stack entered</td></tr>';
    h += row("Total current cost", r.cur, "tot") + sec("Sophos (incl. overlap and retained tools)");
    r.sopLines.forEach(function (l) { h += row(l.name, l.costs); });
    h += row("Total Sophos-side cost", r.sop, "tot") + row("Hard cost saving", r.hard, "tot") + sec("Productivity & risk value" + (S.scenario === "Conservative" ? " (conservative: " + pct(r.sf) + " counted)" : ""));
    var f = function (v) { return [v, v, v]; };
    h += row("Analyst capacity freed", f(r.analystVal)) + row("Incident cost avoided (faster MTTD/MTTR)", f(r.incidentVal)) + row("Cyber insurance reduction (potential)", f(r.insVal)) + row("Total soft value", f(r.soft), "tot") + row("TOTAL VALUE (hard + soft)", r.total, "grand");
    return h + "</tbody></table>";
  }
  function compareTable(r) {
    var sum = function (a) { return a[0] + a[1] + a[2]; }, f = function (v) { return [v, v, v]; };
    var row = function (l, a, cls, dot) { return '<tr class="' + (cls || "") + '"><td>' + (dot ? '<i class="dot ' + dot + '"></i>' : "") + l + "</td>" + a.map(function (x) { return '<td class="r' + (x < 0 ? " neg" : "") + '">' + money(x) + "</td>"; }).join("") + '<td class="r tot' + (sum(a) < 0 ? " neg" : "") + '">' + money(sum(a)) + "</td></tr>"; };
    return '<div class="scroll"><table class="cmp"><thead><tr><th scope="col">Cost comparison</th><th class="r" scope="col">Year 1</th><th class="r" scope="col">Year 2</th><th class="r" scope="col">Year 3</th><th class="r" scope="col">3-yr total</th></tr></thead><tbody>' +
      row("Current stack", r.cur, "", "grey") + row("Sophos (incl. overlap &amp; retained)", r.sop, "", "blue") + row("Hard cost saving", r.hard, "key", r.hard3 >= 0 ? "green" : "red") +
      row("Soft value (analysts, incidents, insurance)", f(r.soft), "", "amber") + row("Total value", r.total, "grand", "green") + "</tbody></table></div>";
  }
  function renderResults(r) {
    var out = $("#resultsOut"); if (!out) return;
    var tp = M.talkingPoints(S, r, CAT), keys = Object.keys(tp);
    if (keys.indexOf(persona) < 0) persona = keys[0];
    var ng = r.resolved.addons.some(function (a) { return a.on && a.def.id === "ngsiem"; });
    // value breakdown (3-year)
    var items = [["Hard cost saving", "Current stack minus Sophos", r.hard3, "#2f46f0"], ["Analyst capacity freed", r.fte.toFixed(1) + " FTE redeployed from triage", r.analystVal * 3, "#12b886"],
      ["Incident cost avoided", "Faster MTTD / MTTR", r.incidentVal * 3, "#f59f00"], ["Cyber insurance (potential)", "Premium reduction, not guaranteed", r.insVal * 3, "#f76707"]];
    var mx = Math.max.apply(null, items.map(function (i) { return Math.abs(i[2]); }).concat([1]));
    var vb = items.map(function (i) { return barRow(i[0], i[1], Math.abs(i[2]) / mx, money(i[2]), i[2] < 0 ? "#e5484d" : i[3]); }).join("");
    // Sophos investment by line (3-yr)
    var inv = r.sopLines.map(function (l) { return { n: l.name, v: l.costs[0] + l.costs[1] + l.costs[2], k: l.kind }; }).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    var imx = Math.max.apply(null, inv.map(function (i) { return i.v; }).concat([1]));
    var invH = inv.slice(0, 8).map(function (i) { return '<div class="lrow"><div class="ll"><span>' + esc(i.n) + '</span><b>' + short(i.v) + '</b></div><div class="bar thin"><i style="width:' + (i.v / imx * 100) + "%;background:" + (i.k === "sophos" ? "#2f46f0" : "#f59f00") + '"></i></div></div>'; }).join("");
    // SOC impact
    var soc = [["MTTD faster", r.mttdImp, "MTTD " + S.adv.curMTTD + "h → " + S.adv.sMTTD + "h", "#2f46f0"], ["MTTR faster", r.mttrImp, "MTTR " + S.adv.curMTTR + "h → " + S.adv.sMTTR + "h", "#12b886"],
      ["Triage offloaded", r.offload, n0(r.hours) + " analyst hours / yr", "#f59f00"], ["TCO vs current", Math.abs(r.tcoRed), r.hard3 >= 0 ? "lower with Sophos" : "higher with Sophos", r.hard3 >= 0 ? "#f76707" : "#e5484d"]];
    var socH = soc.map(function (s) { return '<div class="lrow"><div class="ll"><span>' + s[0] + '<small>' + s[2] + '</small></span><b style="color:' + s[3] + '">' + pct(s[1]) + '</b></div><div class="bar thin"><i style="width:' + Math.min(100, s[1] * 100) + "%;background:" + s[3] + '"></i></div></div>'; }).join("");
    out.innerHTML = (S.lines.length ? "" : '<div class="note warn">' + ic("info") + "<span>No current stack entered yet: results show Sophos cost only. Add the customer's tools in step 2 or load an example.</span></div>") +
      '<div class="res-grid"><div class="res-main">' +
      '<section class="card">' + cardHead("Value breakdown", "Where the " + money(r.tot3) + " of 3-year value comes from.", tip("switch to <b>Conservative</b> to count less soft value.")) + vb + "</section>" +
      '<section class="card">' + cardHead("Annual cost: current stack vs Sophos", "Including overlap while existing tools run to term.", '<span class="legend"><span><i style="background:#B4BDD1"></i>Current stack</span><span><i style="background:#2f46f0"></i>Sophos</span></span>') + chartSVG(r) +
      '<h3 class="sub-h">Cumulative value (hard + soft)</h3>' + cumBars(r) + "</section>" +
      '</div><aside class="res-side">' +
      '<section class="card">' + cardHead("Sophos investment", "3-year cost by line") + invH + "</section>" +
      '<section class="card">' + cardHead("SOC &amp; risk impact", "Operational outcomes") + socH +
      '<div class="kv"><span>Searchable retention</span><b>' + (ng ? "13 months" : "90 days") + "</b></div>" +
      '<div class="kv"><span>Proposed platform</span><b>' + esc(r.resolved.platform.name) + "</b></div>" +
      '<p class="hint">Sophos-published MDR averages: 1 min to detect, 25 min to investigate, 12 min to respond <a href="#src-S19" class="cite">[S19]</a>. Defaults here are deliberately more conservative.</p></section>' +
      "</aside></div>" +
      '<section class="card">' + cardHead("Cost comparison", "Current stack vs Sophos over three years.") + compareTable(r) +
      '<details class="inline"><summary>Show full line-by-line table</summary><div class="scroll">' + table3(r) + "</div></details></section>" +
      '<section class="card">' + cardHead("Talking points", "Tailored to the chosen competitors.") + '<div class="chips" role="tablist" aria-label="Persona">' + keys.map(function (k) {
        return '<button type="button" class="chip" role="tab" id="tab-' + k.replace(/\W/g, "") + '" aria-selected="' + (k === persona) + '" aria-pressed="' + (k === persona) + '" aria-controls="tp-panel" data-persona="' + esc(k) + '">' + esc(k) + '<span class="cnt">' + tp[k].length + "</span></button>"; }).join("") +
      '</div><div id="tp-panel" role="tabpanel"><ul class="tp">' + tp[persona].map(function (t) { return "<li>" + cite(t) + "</li>"; }).join("") + "</ul></div></section>" ;
  }

  // ---------- print summary ----------
  function buildPrint() {
    var r = M.compute(S, CAT), tp = M.talkingPoints(S, r, CAT), d = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    var R = r.resolved, sophos = [R.platform.name].concat(R.addons.filter(function (a) { return a.on; }).map(function (a) { return a.def.name; }));
    var vendors = []; S.lines.forEach(function (l) { var n = vendorName(l.vendor); if (vendors.indexOf(n) < 0) vendors.push(n); });
    var a = S.adv;
    $("#printSummary").innerHTML =
      '<div class="ps-head"><h1>' + esc(S.customer.name || "Customer") + ': Sophos value summary</h1><p>Current stack: ' + esc(vendors.join(", ") || "not entered") + " → Proposed: " + esc(sophos.join(", ")) + " · " + d + " · " + S.scenario + " scenario</p></div>" +
      '<div class="ps-cards"><div><span>3-year total value</span><b>' + money(r.tot3) + '</b></div><div><span>3-year ROI</span><b>' + pct(r.roi) + '</b></div><div><span>Payback</span><b>' + r.payback.toFixed(1) + " months</b></div>" +
      "<div><span>3-year TCO</span><b>" + money(r.sop3) + '</b><small> vs ' + money(r.cur3) + "</small></div><div><span>Analyst hours freed / yr</span><b>" + n0(r.hours) + "</b></div><div><span>MTTD / MTTR</span><b>" + pct(r.mttdImp) + " / " + pct(r.mttrImp) + "</b><small> faster</small></div></div>" +
      '<div class="ps-cols avoid"><div><h2>Annual cost: current vs Sophos</h2>' + chartSVG(r) + '<div class="legend"><span><i style="background:#B4BDD1"></i>Current stack</span><span><i style="background:#2f46f0"></i>Sophos</span></div></div>' +
      '<div class="ps-tp"><h2>Why it matters</h2>' + ["CFO", "Procurement", "CISO"].map(function (k) { return "<h3>" + k + "</h3><ul>" + tp[k].slice(0, 4).map(function (t) { return "<li>" + esc(t.replace(/\s*\[S\d+\]/g, "")) + "</li>"; }).join("") + "</ul>"; }).join("") + "</div></div>" +
      '<h2>3-year TCO &amp; value</h2>' + table3(r) +
      '<h2>Key assumptions</h2><p class="ps-small">' + esc(n0(S.customer.users) + " users, " + n0(S.customer.endpoints) + " endpoints, " + n0(S.customer.servers) + " servers, " + n0(S.customer.mobile) + " mobile devices; " + S.customer.analysts + " analysts at " + money(S.customer.analystCost) +
        "; consumption growth " + pct(a.growth) + "/yr; " + pct(a.triagePct) + " of analyst time on triage, " + pct(r.offload) + " offloaded; " + a.incidents + " incidents/yr at " + money(a.incidentCostHr) + "/h; MTTD " + a.curMTTD + "h→" + a.sMTTD + "h, MTTR " + a.curMTTR + "h→" + a.sMTTR + "h; existing endpoint retired from Year " + S.endpointPhaseYear + "; onboarding " + money(S.onboarding) + ".") + "</p>" +
      '<p class="ps-small"><b>Important:</b> figures are estimates based on illustrative assumptions and customer-provided inputs; they are not vendor price quotes. Analyst value is capacity redeployed; insurance reduction is potential only. Standard Sophos MDR/XDR data lake retention is 90 days; 13 months requires Sophos Next-Gen SIEM. Sources: sophos.com compare pages and product documentation, vendor public pricing/terms pages, IBM Cost of a Data Breach 2025.</p>';
  }

  // ---------- main render ----------
  function renderStep() {
    $("#step").innerHTML = [null, step1, step2, step3, step4][step]();
  }
  function render() { renderStep(); applyFilter(); refresh(); }
  function refresh() {
    var r = M.compute(S, CAT);
    renderTabs(); renderHero(r); renderDock(r);
    // live cells in steps 2/3
    r.curLines.forEach(function (l) { var e = $('[data-out="line:' + l.uid + '"]'); if (e) e.textContent = money(l.costs[0]); });
    var st = $('[data-out="stack-total"]'); if (st) st.textContent = money(r.cur[0]);
    var pu = $('[data-out="plat:user"]'); if (pu) pu.textContent = money(S.customer.users * r.resolved.userPrice);
    var ps = $('[data-out="plat:server"]'); if (ps) ps.textContent = money(S.customer.servers * r.resolved.serverPrice);
    r.resolved.addons.forEach(function (a) { var e = $('[data-out="addon:' + a.def.id + '"]'); if (e) e.textContent = a.on ? money(M.qty(a.def.unit, S.customer) * a.price) : "-"; });
    if (step === 4) renderResults(r);
    persist();
    return r;
  }

  // ---------- events ----------
  function onInput(e) {
    var t = e.target, d = t.dataset, v = t.value;
    if (d.q !== undefined) { query = v; applyFilter(); return; }
    if (d.c) { if (d.c === "name") S.customer.name = v; else if (d.c !== "currency") S.customer[d.c] = M.num(v); }
    else if (d.adv) S.adv[d.adv] = M.num(v) / (d.pct !== undefined ? 100 : 1);
    else if (d.lp) { var l = lineByUid(d.lp); if (l) l.price = M.num(v); }
    else if (d.ln) { var l2 = lineByUid(d.ln); if (l2) l2.name = v; }
    else if (d.pp) S.prices[d.pp] = M.num(v);
    else if (d.ap) S.prices["addon_" + d.ap] = M.num(v);
    else if (d.g === "onboarding") S.onboarding = M.num(v);
    else return;
    refresh();
  }
  function onChange(e) {
    var t = e.target, d = t.dataset, rerender = true;
    if (d.c === "currency") S.customer.currency = t.value;
    else if (d.c && ["users", "endpoints", "servers", "mobile", "analysts"].indexOf(d.c) >= 0 && step !== 1) { /* handled by input */ }
    else if (d.prod) {
      if (t.checked) { var nl = M.lineFromProduct(CAT, d.prod); if (nl) S.lines.push(nl); }
      else S.lines = S.lines.filter(function (l) { return l.pid !== d.prod; });
    }
    else if (d.grows) { var l = lineByUid(d.grows); if (l) l.grows = t.checked; }
    else if (d.retire) { var l2 = lineByUid(d.retire); if (l2) l2.retire = t.value === "keep" || t.value === "auto" ? t.value : M.num(t.value, 1); }
    else if (d.lcat) { var l3 = lineByUid(d.lcat); if (l3) l3.cats = [t.value]; }
    else if (d.lunit) { var l4 = lineByUid(d.lunit); if (l4) l4.unit = t.value; }
    else if (d.tier) S.platform = d.tier;
    else if (d.addon) S.addons[d.addon] = t.checked;
    else if (d.g === "endpointPhaseYear") S.endpointPhaseYear = M.num(t.value, 2);
    else rerender = false;
    if (rerender) { var y = window.scrollY, f = t.id || null; render(); window.scrollTo(0, y); if (f && document.getElementById(f)) document.getElementById(f).focus(); }
  }
  function onClick(e) {
    var b = e.target.closest("button, a"); if (!b) return;
    var d = b.dataset;
    if (d.go) { step = M.num(d.go, 1); render(); window.scrollTo(0, 0); $("#main").focus({ preventScroll: true }); }
    else if (d.scen) { S.scenario = d.scen; var y0 = window.scrollY; render(); window.scrollTo(0, y0); }
    else if (d.cur) { S.customer.currency = d.cur; var y1 = window.scrollY; render(); window.scrollTo(0, y1); var cb = $('[data-cur="' + d.cur + '"]'); if (cb) cb.focus(); }
    else if (d.newscn !== undefined) { if (window.confirm("Clear all inputs and start a new scenario?")) { persona = "CFO"; setState(M.defaultState(CAT), 1, "New scenario: start with customer basics"); window.scrollTo(0, 0); } }
    else if (d.dl !== undefined) { buildPrint(); window.print(); }
    else if (d.vendor) {
      var i = S.vendors.indexOf(d.vendor);
      if (i >= 0) {
        var before = S.lines.length; S.vendors.splice(i, 1);
        S.lines = S.lines.filter(function (l) { return !(l.vendor === d.vendor || (d.vendor === "other" && l.vendor === "custom")); });
        if (before !== S.lines.length) toast("Removed " + (before - S.lines.length) + " " + vendorName(d.vendor) + " line(s)");
      } else S.vendors.push(d.vendor);
      var y = window.scrollY; render(); window.scrollTo(0, y);
      var nb = $('[data-vendor="' + d.vendor + '"]'); if (nb) nb.focus();
    }
    else if (d.addcustom !== undefined) {
      S.lines.push({ uid: "c" + Math.random().toString(36).slice(2, 8), pid: null, vendor: "custom", name: "Custom line", cats: ["siem"], unit: "flat", price: 10000, grows: false, billing: "per-unit", retire: "auto" });
      render(); var inp = $$("[data-ln]").pop(); if (inp) { inp.focus(); inp.select(); }
    }
    else if (d.remove) { S.lines = S.lines.filter(function (l) { return l.uid !== d.remove; }); render(); }
    else if (d.resetsug !== undefined) { S.platform = null; S.addons = {}; render(); toast("Sophos proposal reset to suggestions"); }
    else if (d.persona) { persona = d.persona; refresh(); var tb = $('[data-persona="' + persona + '"]'); if (tb) tb.focus(); }
    else if (b.classList.contains("cite")) { var det = $("#sources"); if (det) det.open = true; }
  }
  function onKey(e) {
    if (!e.target.matches('[role="tab"]') || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    var tabs = $$('[role="tab"]'), i = tabs.indexOf(e.target), n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    n.click();
  }

  // ---------- toolbar ----------
  function savedAll() { try { return JSON.parse(localStorage.getItem(LS_SAVED) || "{}"); } catch (e) { return {}; } }
  function renderSaved() {
    var all = savedAll(), names = Object.keys(all).sort();
    $("#savedList").innerHTML = names.length ? names.map(function (n) {
      return "<li><span>" + esc(n) + "<br><small>" + esc(new Date(all[n].savedAt).toLocaleString("en-GB")) + '</small></span><span><button type="button" class="btn small" data-load="' + esc(n) + '">Load</button> <button type="button" class="btn light small" data-del="' + esc(n) + '">Delete</button></span></li>';
    }).join("") : '<li><small>No saved scenarios yet.</small></li>';
  }
  function initToolbar() {
    var ps = $("#presetSel");
    CAT.presets.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; ps.appendChild(o); });
    ps.addEventListener("change", function () { if (!ps.value) return; var p = ps.value; ps.value = ""; setState(M.presetState(CAT, p), 4, "Example loaded - walk through steps 1-3 to tailor it"); });
    var th = $("#btnTheme");
    function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); th.innerHTML = ic(t === "dark" ? "sun" : "moon"); th.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
    var savedTheme = null; try { savedTheme = localStorage.getItem(LS_THEME); } catch (e) { /* ignore */ }
    applyTheme(savedTheme === "dark" ? "dark" : "light");
    th.addEventListener("click", function () { var t = dark() ? "light" : "dark"; applyTheme(t); try { localStorage.setItem(LS_THEME, t); } catch (e) { /* ignore */ } });
    $$("[data-ic]").forEach(function (el) { el.innerHTML = ic(el.getAttribute("data-ic")); });
    $("#btnPrint").addEventListener("click", function () { buildPrint(); window.print(); });
    window.addEventListener("beforeprint", buildPrint);
    $("#btnShare").addEventListener("click", function () { var u = shareUrl(); $("#shareUrl").value = u; $("#dlgShare").showModal(); $("#shareUrl").select(); });
    $("#btnCopy").addEventListener("click", function () {
      var u = $("#shareUrl"); u.select();
      var done = function () { toast("Link copied"); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(u.value).then(done, function () { document.execCommand("copy"); done(); });
      else { document.execCommand("copy"); done(); }
    });
    $("#btnScenarios").addEventListener("click", function () { renderSaved(); $("#saveName").value = S.customer.name || ""; $("#dlgScenarios").showModal(); });
    $("#btnSave").addEventListener("click", function () {
      var n = $("#saveName").value.trim() || S.customer.name || "Scenario " + new Date().toLocaleString("en-GB");
      var all = savedAll(); all[n] = { savedAt: Date.now(), state: S };
      try { localStorage.setItem(LS_SAVED, JSON.stringify(all)); toast("Saved \u201c" + n + "\u201d"); } catch (e) { toast("Could not save (storage disabled?) - use Export JSON"); }
      renderSaved();
    });
    $("#savedList").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; var all = savedAll();
      if (b.dataset.load && all[b.dataset.load]) { $("#dlgScenarios").close(); setState(all[b.dataset.load].state, 4, "Loaded \u201c" + b.dataset.load + "\u201d"); }
      if (b.dataset.del) { delete all[b.dataset.del]; localStorage.setItem(LS_SAVED, JSON.stringify(all)); renderSaved(); }
    });
    function doExport() {
      var blob = new Blob([JSON.stringify({ app: "sophos-roi-calculator", catalog: CAT.version, exportedAt: new Date().toISOString(), state: S }, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "sophos-roi-" + (S.customer.name || "scenario").replace(/[^\w-]+/g, "-").toLowerCase() + ".json";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    $("#btnExport").addEventListener("click", doExport);
    $("#btnExport2").addEventListener("click", doExport);
    $("#fileImport").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { try { var o = JSON.parse(rd.result); $("#dlgScenarios").close(); setState(o.state || o, 4, "Imported " + f.name); } catch (err) { toast("Not a valid scenario file"); } e.target.value = ""; };
      rd.readAsText(f);
    });
    $$("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
    window.addEventListener("hashchange", function () {
      if (location.hash.indexOf("#s=") !== 0) return;
      try { var st = decodeState(location.hash.slice(3)); if (JSON.stringify(sanitize(st)) !== JSON.stringify(S)) { S = sanitize(st); step = 4; render(); } } catch (e) { /* ignore */ }
    });
  }

  // ---------- boot ----------
  S = loadInitial();
  var main = $("#main");
  main.addEventListener("input", onInput);
  main.addEventListener("change", onChange);
  document.addEventListener("click", onClick);
  main.addEventListener("keydown", onKey);
  initToolbar();
  render();
  // test hook (read-only snapshot)
  window.__roi = { state: function () { return JSON.parse(JSON.stringify(S)); }, result: function () { return M.compute(S, CAT); }, step: function () { return step; } };
})();
