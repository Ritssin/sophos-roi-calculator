/*
 * Sophos ROI Calculator - UI (vanilla JS, no dependencies).
 * State lives in one object `S`; the model (js/model.js) does all maths.
 */
(function () {
  "use strict";
  var CAT = window.ROI_CATALOG, M = window.ROIModel;
  var LS_CUR = "sophosRoi.current.v1", LS_SAVED = "sophosRoi.saved.v1";
  var S, step = 1, persona = "CFO", saveTimer = null;

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

  // ---------- rendering: chrome ----------
  function renderStepper() {
    $("#stepper").innerHTML = STEPS.map(function (s, i) {
      var n = i + 1;
      return '<button type="button" data-go="' + n + '"' + (n === step ? ' aria-current="step"' : "") + (n < step ? ' class="done"' : "") + '><span class="n">' + n + '</span><span><span class="t">' + s[0] + '</span><span class="d">' + s[1] + "</span></span></button>";
    }).join("");
    $$(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.scen === S.scenario)); });
  }
  function nav(prev, next) {
    return '<div class="navrow">' + (prev ? '<button type="button" class="btn light" data-go="' + prev + '">← Back</button>' : "<span></span>") +
      (next ? '<button type="button" class="btn" data-go="' + next + '">Next: ' + STEPS[next - 1][0] + " →</button>" : "") + "</div>";
  }
  function field(label, key, val, opts) {
    opts = opts || {};
    var id = "f_" + key, attr = opts.attr || 'data-c="' + key + '"';
    var input = opts.select ? '<select id="' + id + '" ' + attr + ">" + opts.select + "</select>"
      : '<input id="' + id + '" ' + attr + ' type="' + (opts.text ? "text" : "number") + '" ' + (opts.text ? "" : 'min="0" step="' + (opts.step || "any") + '" inputmode="decimal"') + ' value="' + esc(val) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + ">";
    return '<div class="field"><label for="' + id + '">' + label + (opts.sub ? '<span class="sub">' + opts.sub + "</span>" : "") + "</label>" + input + "</div>";
  }

  // ---------- step 1 ----------
  function step1() {
    var c = S.customer, cur = Object.keys(CAT.currencies).map(function (k) { return '<option value="' + k + '"' + (k === c.currency ? " selected" : "") + ">" + k + " (" + CAT.currencies[k] + ")</option>"; }).join("");
    return '<section class="panel" aria-labelledby="h1s"><h2 id="h1s">1. Customer basics</h2><p class="hint">Start here, or pick <b>Load example</b> at the top. Every number can be changed later.</p>' +
      '<div class="grid">' +
      field("Customer name", "name", c.name, { text: true, ph: "e.g. Acme Ltd" }) +
      field("Currency", "currency", "", { select: cur, sub: "Symbol only - no FX conversion" }) +
      field("Users", "users", c.users, { sub: "Licensed users (per-user pricing)" }) +
      field("Endpoints (workstations)", "endpoints", c.endpoints, { sub: "Laptops / desktops" }) +
      field("Servers", "servers", c.servers, { sub: "Physical, virtual and cloud" }) +
      field("Mobile devices", "mobile", c.mobile, { sub: "Phones / tablets (0 = none)" }) +
      field("SOC / security analysts", "analysts", c.analysts, { sub: "People triaging alerts today" }) +
      field("Fully loaded cost per analyst (" + sym() + ")", "analystCost", c.analystCost, { sub: "Salary + on-costs, per year" }) +
      "</div></section>" + nav(0, 2);
  }

  // ---------- step 2 ----------
  function retireSelect(l, resolved) {
    var auto = "Auto (" + (resolved === "keep" ? "keep" : "retire Y" + resolved) + ")";
    var opts = [["auto", auto], ["1", "Retire Year 1"], ["2", "Retire Year 2"], ["3", "Retire Year 3"], ["keep", "Keep (not replaced)"]];
    return '<label>When <select data-retire="' + l.uid + '" aria-label="When is ' + esc(l.name) + ' replaced">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(l.retire) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
  }
  function productRow(p, comp, R) {
    var l = lineByPid(p.id), on = !!l, line = l || { price: p.price, unit: p.unit };
    var res = on ? R.lines.filter(function (x) { return x.line.uid === l.uid; })[0] : null;
    var q = M.qty(p.unit, S.customer);
    return '<div class="prow' + (on ? "" : " off") + '">' +
      '<input type="checkbox" data-prod="' + p.id + '" id="p_' + p.id + '"' + (on ? " checked" : "") + ' aria-label="' + esc(comp.name + " " + p.name) + ' in use">' +
      '<label class="pname" for="p_' + p.id + '">' + esc(on ? l.name : p.name) + (p.billing === "consumption" ? '<span class="badge cons" title="Billed on data ingested / stored">Consumption</span>' : "") +
      '<small>' + p.cats.map(function (c) { return CATL[c]; }).join(" · ") + "</small></label>" +
      '<span class="in-pre when-on">' + sym() + '<input class="in-num" type="number" min="0" step="any" inputmode="decimal" data-lp="' + (on ? l.uid : "") + '" value="' + line.price + '" aria-label="' + esc(p.name) + ' price ' + UNIT[p.unit] + '"' + (on ? "" : " disabled") + '><small class="qty">' + UNIT[p.unit] + "</small></span>" +
      '<span class="qty when-on">' + (p.unit === "flat" ? "" : "× " + n0(q)) + "</span>" +
      '<span class="cost when-on" data-out="line:' + (on ? l.uid : "") + '">' + (on ? money(q * l.price) : "") + "</span>" +
      '<span class="opts when-on">' + (on ? '<label><input type="checkbox" data-grows="' + l.uid + '"' + (l.grows ? " checked" : "") + '> grows with data</label>' + retireSelect(l, res.retire) : "") + "</span></div>";
  }
  function customRow(l, R) {
    var res = R.lines.filter(function (x) { return x.line.uid === l.uid; })[0], q = M.qty(l.unit, S.customer);
    var cats = Object.keys(CATL).map(function (c) { return '<option value="' + c + '"' + (l.cats[0] === c ? " selected" : "") + ">" + CATL[c] + "</option>"; }).join("");
    var units = Object.keys(UNIT).map(function (u) { return '<option value="' + u + '"' + (l.unit === u ? " selected" : "") + ">" + UNIT[u] + "</option>"; }).join("");
    return '<div class="prow"><button type="button" class="btn link small" data-remove="' + l.uid + '" aria-label="Remove ' + esc(l.name) + '">✕</button>' +
      '<span><input class="custom-name" data-ln="' + l.uid + '" value="' + esc(l.name) + '" aria-label="Custom line name"><span class="opts" style="margin-top:4px"><select data-lcat="' + l.uid + '" aria-label="Category">' + cats + '</select><select data-lunit="' + l.uid + '" aria-label="Unit">' + units + "</select></span></span>" +
      '<span class="in-pre">' + sym() + '<input class="in-num" type="number" min="0" step="any" data-lp="' + l.uid + '" value="' + l.price + '" aria-label="Custom line price"></span>' +
      '<span class="qty">' + (l.unit === "flat" ? "" : "× " + n0(q)) + '</span><span class="cost" data-out="line:' + l.uid + '">' + money(q * l.price) + "</span>" +
      '<span class="opts"><label><input type="checkbox" data-grows="' + l.uid + '"' + (l.grows ? " checked" : "") + "> grows with data</label>" + retireSelect(l, res.retire) + "</span></div>";
  }
  function step2() {
    var R = M.resolve(S, CAT);
    var chips = CAT.competitors.map(function (c) {
      var cnt = S.lines.filter(function (l) { return l.vendor === c.id || (c.id === "other" && l.vendor === "custom"); }).length;
      return '<button type="button" class="chip" data-vendor="' + c.id + '" aria-pressed="' + (S.vendors.indexOf(c.id) >= 0) + '">' + esc(c.name) + (cnt ? '<span class="cnt">' + cnt + "</span>" : "") + "</button>";
    }).join("");
    var cards = CAT.competitors.filter(function (c) { return S.vendors.indexOf(c.id) >= 0; }).map(function (c) {
      var rows = c.products.map(function (p) { return productRow(p, c, R); }).join("");
      if (c.id === "other") rows += S.lines.filter(function (l) { return l.vendor === "custom"; }).map(function (l) { return customRow(l, R); }).join("") +
        '<div class="prow"><span></span><button type="button" class="btn light small" data-addcustom>+ Add custom line</button></div>';
      return '<div class="vendor"><header><b>' + esc(c.name) + '</b><span class="hint" style="margin:0">Tick what the customer uses; edit the annual cost</span></header>' + rows + "</div>";
    }).join("");
    var y1 = 0; R.lines.forEach(function (x) { y1 += M.qty(x.line.unit, S.customer) * x.line.price; });
    return '<section class="panel" aria-labelledby="h2s"><h2 id="h2s">2. Current stack</h2><p class="hint">Select every vendor in use (multi-vendor is fine), then tick their products. Costs are <b>illustrative placeholders</b> - overwrite with the customer\'s invoices. <span class="badge cons">Consumption</span> lines grow with data volume each year.</p>' +
      '<div class="chips" role="group" aria-label="Vendors in use">' + chips + "</div>" +
      (cards || '<div class="note">Choose one or more vendors above to see their product lines.</div>') +
      (S.lines.length ? '<p style="text-align:right;margin:6px 0 0">Year-1 current cost: <b data-out="stack-total">' + money(y1) + "</b></p>" : "") +
      "</section>" + nav(1, 3);
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
    var map = S.lines.length ? '<table class="map"><tbody>' + R.lines.map(function (x) {
      var by = coveredBy(x.line, R);
      return "<tr><td><b>" + esc(x.line.name) + '</b><br><small class="hint">' + esc(vendorName(x.line.vendor)) + '</small></td><td class="arrow">→</td><td>' +
        (x.retire === "keep" ? '<span class="badge keep">Retained</span> ' + (by.length ? "partly covered by " + esc(by.join(", ")) : "not covered by the selected Sophos products") :
          esc(by.join(" + ")) + ' <span class="badge sug">retire Year ' + x.retire + "</span>") + "</td></tr>";
    }).join("") + "</tbody></table>" : '<div class="note">No current stack yet - add it in step 2, or this becomes a new-capability business case.</div>';
    var tiers = CAT.sophos.platforms.map(function (p) {
      var sel = p.id === R.platform.id;
      return '<label class="tier' + (sel ? " sel" : "") + '"><input type="radio" name="tier" data-tier="' + p.id + '"' + (sel ? " checked" : "") + '><span class="tn">' + esc(p.name) + "</span>" +
        (p.id === R.suggestedPlatform ? '<span class="badge sug">Suggested</span>' : "") + "<p>" + esc(p.blurb) + "</p></label>";
    }).join("");
    var pu = "platform_" + R.platform.id + "_user", ps = "platform_" + R.platform.id + "_server";
    var platRows = '<div class="arow"><span></span><span class="pname">' + esc(R.platform.name) + " - users</span>" +
      '<span class="in-pre">' + sym() + '<input class="in-num" type="number" min="0" step="any" data-pp="' + pu + '" value="' + R.userPrice + '" aria-label="Price per user per year"><small class="qty">per user / yr</small></span><span class="qty">× ' + n0(c.users) + '</span><span class="cost" data-out="plat:user">' + money(c.users * R.userPrice) + "</span></div>" +
      '<div class="arow"><span></span><span class="pname">' + esc(R.platform.name) + " - servers</span>" +
      '<span class="in-pre">' + sym() + '<input class="in-num" type="number" min="0" step="any" data-pp="' + ps + '" value="' + R.serverPrice + '" aria-label="Price per server per year"><small class="qty">per server / yr</small></span><span class="qty">× ' + n0(c.servers) + '</span><span class="cost" data-out="plat:server">' + money(c.servers * R.serverPrice) + "</span></div>";
    var addons = R.addons.map(function (a) {
      var q = M.qty(a.def.unit, c);
      return '<div class="arow' + (a.available ? "" : " dis") + '"><label class="switch"><input type="checkbox" data-addon="' + a.def.id + '"' + (a.on ? " checked" : "") + (a.available ? "" : " disabled") + ' aria-label="Include ' + esc(a.def.name) + '"><span></span></label>' +
        '<span class="pname">' + esc(a.def.name) + (a.suggested ? '<span class="badge sug">Suggested</span>' : "") + (a.def.newCapability ? '<span class="badge new">New capability</span>' : "") +
        "<small>" + esc(a.def.blurb) + (a.why ? " · <i>" + esc(a.why) + "</i>" : "") + (a.available ? "" : " · requires Sophos XDR or MDR") + "</small></span>" +
        '<span class="in-pre">' + sym() + '<input class="in-num" type="number" min="0" step="any" data-ap="' + a.def.id + '" value="' + a.price + '" aria-label="' + esc(a.def.name) + ' price"><small class="qty">' + UNIT[a.def.unit] + "</small></span>" +
        '<span class="qty">' + (a.def.unit === "flat" ? "" : "× " + n0(q)) + '</span><span class="cost" data-out="addon:' + a.def.id + '">' + (a.on ? money(q * a.price) : "-") + "</span></div>";
    }).join("");
    var ngOn = R.addons.some(function (a) { return a.on && a.def.id === "ngsiem"; });
    var py = [1, 2, 3].map(function (y) { return '<option value="' + y + '"' + (S.endpointPhaseYear === y ? " selected" : "") + ">Year " + y + "</option>"; }).join("");
    return '<section class="panel" aria-labelledby="h3s"><h2 id="h3s">3. Sophos proposal</h2><p class="hint">Auto-suggested from the current stack. Change anything - <button type="button" class="btn link small" data-resetsug>reset to suggestions</button>. Prices are illustrative; use your Sophos quote.</p>' +
      "<h3>How the current stack maps</h3>" + map + "</section>" +
      '<section class="panel"><h3>Platform (choose one)</h3><div class="tiers" role="radiogroup" aria-label="Sophos platform">' + tiers + "</div>" + platRows + "</section>" +
      '<section class="panel"><h3>Add-ons</h3>' + addons +
      '<div class="note' + (ngOn ? "" : " warn") + '"><b>Retention:</b> standard Sophos MDR/XDR data lake retention is <b>90 days</b>. 12+ months comes from <b>Sophos Next-Gen SIEM</b> (13 months by default, no ingest charges) or the Data Storage 1-year pack.</div></section>' +
      '<section class="panel"><h3>Timing &amp; services</h3><div class="grid">' +
      field("Retire existing endpoint/EDR from", "endpointPhaseYear", "", { select: py, attr: 'data-g="endpointPhaseYear"', sub: "Lets current contracts run to term (overlap costed)" }) +
      field("One-time onboarding / migration (" + sym() + ")", "onboarding", S.onboarding, { attr: 'data-g="onboarding"', sub: "Partner services, internal effort (Year 1)" }) +
      "</div></section>" + nav(2, 4);
  }

  // ---------- step 4 ----------
  function advField(a) {
    var v = S.adv[a[0]], disp = a[2] === "%" ? +(v * 100).toFixed(2) : v;
    var label = a[1] + (a[2] === "%" ? " (%)" : a[2] === "cur" ? " (" + sym() + ")" : "");
    return field(label, "adv_" + a[0], disp, { attr: 'data-adv="' + a[0] + '"' + (a[2] === "%" ? " data-pct" : ""), sub: a[3] });
  }
  function step4() {
    return '<div id="resultsOut"></div>' +
      '<details class="adv" id="advanced"><summary>Advanced assumptions (SOC, risk, growth) - illustrative, edit to match the customer</summary><div class="grid">' + ADV.map(advField).join("") + "</div></details>" +
      '<details class="adv method" id="sources"><summary>Method &amp; sources</summary>' +
      "<p><b>Current cost</b> = each ticked product × quantity × annual unit cost. Lines marked <i>grows with data</i> (consumption/ingest billing) increase by the growth % each year.</p>" +
      "<p><b>Sophos cost</b> = platform (users + servers) + enabled add-ons + one-time onboarding + any current lines still running (overlap until their retire year, or retained lines kept on both sides).</p>" +
      "<p><b>Hard saving</b> = current − Sophos. <b>Soft value</b> = analyst capacity freed (analysts × loaded cost × % triage × % offloaded) + incident cost avoided (incidents × hours saved × cost/hour) + potential insurance reduction. <b>Conservative</b> counts only the chosen share of soft value.</p>" +
      "<p><b>ROI</b> = 3-year total value ÷ 3-year Sophos investment (Sophos cost excluding retained tools). <b>Payback</b> = Year-1 investment ÷ monthly (Year-1 current cost avoided + soft value).</p>" +
      "<p>Analyst value is capacity redeployed, not necessarily headcount reduction. Insurance savings are potential only. Vendor facts below are from public pages (competitive claims are as stated by Sophos on its compare pages). <b>All prices are illustrative placeholders, not vendor pricing.</b></p>" +
      '<ol class="sources">' + CAT.sources.map(function (s) { return '<li id="src-' + s.id + '"><b>[' + s.id + "]</b> " + esc(s.text) + ' - <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + "</a></li>"; }).join("") + "</ol></details>" + nav(3, 0);
  }
  function chartSVG(r) {
    var W = 560, H = 240, p = { l: 56, r: 12, t: 22, b: 30 }, max = Math.max.apply(null, r.cur.concat(r.sop, [1])) * 1.15, iw = W - p.l - p.r, ih = H - p.t - p.b;
    var y = function (v) { return p.t + ih - Math.max(v, 0) / max * ih; }, s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Annual cost, current stack versus Sophos, years 1 to 3">';
    for (var k = 0; k <= 4; k++) { var v = max * k / 4; s += '<line x1="' + p.l + '" x2="' + (W - p.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E6EBF5"/><text x="' + (p.l - 6) + '" y="' + (y(v) + 4) + '" font-size="11" text-anchor="end" fill="#5B6578">' + short(v) + "</text>"; }
    var gw = iw / 3, bw = Math.min(58, gw * 0.3);
    for (var i = 0; i < 3; i++) {
      var cx = p.l + gw * i + gw / 2;
      s += '<rect x="' + (cx - bw - 3) + '" y="' + y(r.cur[i]) + '" width="' + bw + '" height="' + (p.t + ih - y(r.cur[i])) + '" rx="3" fill="#9AA5B8"/><text x="' + (cx - bw / 2 - 3) + '" y="' + (y(r.cur[i]) - 5) + '" font-size="11.5" text-anchor="middle" fill="#1D2433">' + short(r.cur[i]) + "</text>";
      s += '<rect x="' + (cx + 3) + '" y="' + y(r.sop[i]) + '" width="' + bw + '" height="' + (p.t + ih - y(r.sop[i])) + '" rx="3" fill="#1A5CFF"/><text x="' + (cx + bw / 2 + 3) + '" y="' + (y(r.sop[i]) - 5) + '" font-size="11.5" text-anchor="middle" fill="#1A5CFF" font-weight="700">' + short(r.sop[i]) + "</text>";
      s += '<text x="' + cx + '" y="' + (H - 9) + '" font-size="12" text-anchor="middle" fill="#1D2433">Year ' + (i + 1) + "</text>";
    }
    return s + "</svg>";
  }
  function cumBars(r) {
    var m = Math.max.apply(null, r.cum.map(Math.abs).concat([1]));
    return r.cum.map(function (c, i) { return '<div class="cumrow"><span style="width:48px">Year ' + (i + 1) + '</span><div class="bar"><div style="width:' + (Math.max(0, c) / m * 100) + '%"></div></div><b style="min-width:86px;text-align:right;color:' + (c < 0 ? "#B42318" : "#0B8A5F") + '">' + money(c) + "</b></div>"; }).join("");
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
  function card(k, v, s, hero) { return '<div class="card' + (hero ? " hero" : "") + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + "</div></div>"; }
  function cardsHTML(r) {
    return card("3-year total value", money(r.tot3), money(r.hard3) + " hard saving + " + money(r.soft3) + " soft value", 1) +
      card("3-year ROI", pct(r.roi), "Total value ÷ Sophos investment", 1) + card("Payback", r.payback.toFixed(1) + " months", "Year-1 investment recovered", 1) +
      card("3-year TCO", money(r.sop3) + " vs " + money(r.cur3), (r.hard3 >= 0 ? pct(r.tcoRed) + " lower" : pct(-r.tcoRed) + " higher") + " than current stack") +
      card("Analyst hours freed", n0(r.hours) + " h / yr", r.fte.toFixed(1) + " FTE redeployed from triage") +
      card("MTTD / MTTR", pct(r.mttdImp) + " / " + pct(r.mttrImp) + " faster", n0(r.incHours) + " incident hours avoided / yr");
  }
  function renderResults(r) {
    var out = $("#resultsOut"); if (!out) return;
    var tp = M.talkingPoints(S, r, CAT), keys = Object.keys(tp);
    if (keys.indexOf(persona) < 0) persona = keys[0];
    var ng = r.resolved.addons.some(function (a) { return a.on && a.def.id === "ngsiem"; });
    out.innerHTML = (S.lines.length ? "" : '<div class="note warn">No current stack entered yet - results show Sophos cost only. Add the customer\'s tools in step 2 or load an example.</div>') +
      '<div class="cards">' + cardsHTML(r) + "</div>" +
      '<div class="two"><section class="panel"><h3>Annual cost: current stack vs Sophos</h3>' + chartSVG(r) +
      '<div class="legend"><span><i style="background:#9AA5B8"></i>Current stack</span><span><i style="background:#1A5CFF"></i>Sophos (incl. overlap)</span></div>' +
      '<h3 style="margin-top:12px">Cumulative value (hard + soft)</h3>' + cumBars(r) + "</section>" +
      '<section class="panel"><h3>SOC &amp; risk impact</h3><div class="ops">' +
      '<div class="op"><b>' + pct(r.mttdImp) + ' faster</b><span>MTTD ' + S.adv.curMTTD + "h → " + S.adv.sMTTD + "h</span></div>" +
      '<div class="op"><b>' + pct(r.mttrImp) + ' faster</b><span>MTTR ' + S.adv.curMTTR + "h → " + S.adv.sMTTR + "h</span></div>" +
      '<div class="op"><b>' + money(r.analystVal) + '</b><span>Analyst capacity value / yr (' + pct(r.offload) + " of triage offloaded)</span></div>" +
      '<div class="op"><b>' + money(r.incidentVal) + "</b><span>Incident cost avoided / yr</span></div>" +
      '<div class="op"><b>' + (ng ? "13 months" : "90 days") + "</b><span>Searchable retention on Sophos" + (ng ? " (NG SIEM)" : " (add NG SIEM for 13 months)") + "</span></div>" +
      '<div class="op"><b>' + esc(r.resolved.platform.name) + "</b><span>Proposed platform" + (r.resolved.platform.rank >= 2 ? " · automation included" : "") + "</span></div>" +
      '</div><p class="hint" style="margin-top:10px">Sophos-published MDR averages: 1 min to detect, 25 min to investigate, 12 min to respond <a href="#src-S19" class="cite">[S19]</a>. Defaults here are deliberately more conservative.</p></section></div>' +
      '<section class="panel"><h3>Talking points</h3><div class="tabs" role="tablist" aria-label="Persona">' + keys.map(function (k) {
        return '<button type="button" role="tab" id="tab-' + k.replace(/\W/g, "") + '" aria-selected="' + (k === persona) + '" aria-controls="tp-panel" data-persona="' + esc(k) + '">' + esc(k) + "</button>"; }).join("") +
      '</div><div id="tp-panel" role="tabpanel"><ul class="tp">' + tp[persona].map(function (t) { return "<li>" + cite(t) + "</li>"; }).join("") + "</ul></div></section>" +
      '<section class="panel"><h3>3-year TCO &amp; value</h3><div style="overflow-x:auto">' + table3(r) + "</div></section>";
  }

  // ---------- summary sidebar ----------
  function renderSummary(r) {
    var el = $("#summary");
    var head = "<h2>Live summary" + (S.customer.name ? '<span class="hint" style="display:block;margin:0;font-weight:400">' + esc(S.customer.name) + "</span>" : "") + "</h2>";
    if (!S.lines.length) { el.innerHTML = head + '<p class="empty">Add the current stack (step 2) or <b>Load example</b> to see savings.</p><div class="kpi"><span>Sophos 3-yr cost</span><b>' + money(r.sop3) + "</b></div>"; return; }
    el.innerHTML = head +
      '<div class="kpi hero"><span>3-yr total value</span><b>' + money(r.tot3) + "</b></div>" +
      '<div class="kpi"><span>ROI</span><b>' + pct(r.roi) + "</b></div>" +
      '<div class="kpi"><span>Payback</span><b>' + r.payback.toFixed(1) + " mo</b></div>" +
      '<div class="kpi"><span>3-yr cost today</span><b>' + money(r.cur3) + "</b></div>" +
      '<div class="kpi"><span>3-yr cost Sophos</span><b>' + money(r.sop3) + "</b></div>" +
      '<div class="kpi"><span>Analyst hours / yr</span><b>' + n0(r.hours) + "</b></div>" +
      '<div class="kpi"><span>Scenario</span><b style="font-size:14px">' + S.scenario + "</b></div>" +
      (step < 4 ? '<div class="act" style="margin-top:10px"><button type="button" class="btn" style="width:100%" data-go="4">View results →</button></div>' : "");
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
      '<div class="ps-cols avoid"><div><h2>Annual cost: current vs Sophos</h2>' + chartSVG(r) + '<div class="legend"><span><i style="background:#9AA5B8"></i>Current stack</span><span><i style="background:#1A5CFF"></i>Sophos</span></div></div>' +
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
  function render() { renderStepper(); renderStep(); refresh(); }
  function refresh() {
    var r = M.compute(S, CAT);
    renderSummary(r);
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
    $$(".seg button").forEach(function (b) { b.addEventListener("click", function () { S.scenario = b.dataset.scen; renderStepper(); refresh(); }); });
    $("#btnReset").addEventListener("click", function () { if (window.confirm("Clear all inputs and start a new scenario?")) { persona = "CFO"; setState(M.defaultState(CAT), 1, "Reset - start with customer basics"); } });
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
    $("#btnExport").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify({ app: "sophos-roi-calculator", catalog: CAT.version, exportedAt: new Date().toISOString(), state: S }, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "sophos-roi-" + (S.customer.name || "scenario").replace(/[^\w-]+/g, "-").toLowerCase() + ".json";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
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
