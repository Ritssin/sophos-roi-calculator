/*
 * Sophos ROI Calculator - MODEL (pure functions, no DOM).
 * Works in the browser (window.ROIModel) and in Node (module.exports) for tests.
 */
(function (root) {
  "use strict";
  var ENDPOINT_CATS = ["endpoint", "edr"];
  var TIER_FOR_CAT = { endpoint: 1, edr: 2, search: 2, soar: 2, mdr: 3, ir: 4 };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(x, d) { x = Number(x); return isFinite(x) ? x : (d || 0); }

  function findProduct(cat, pid) {
    for (var i = 0; i < cat.competitors.length; i++) {
      var c = cat.competitors[i];
      for (var j = 0; j < c.products.length; j++) if (c.products[j].id === pid) return { vendor: c, product: c.products[j] };
    }
    return null;
  }

  function lineFromProduct(cat, pid, over) {
    var f = findProduct(cat, pid); if (!f) return null;
    var p = f.product; over = over || {};
    return {
      uid: pid + "_" + Math.random().toString(36).slice(2, 7), pid: pid, vendor: f.vendor.id,
      name: over.name || p.name, cats: p.cats.slice(), unit: p.unit,
      price: over.price != null ? over.price : p.price,
      grows: over.grows != null ? over.grows : p.billing === "consumption",
      billing: p.billing, retire: over.retire != null ? over.retire : "auto"
    };
  }

  function defaultState(cat) {
    var d = cat.defaults;
    return { v: 1, customer: clone(d.customer), scenario: "Expected", lines: [], platform: null, addons: {}, prices: {},
             endpointPhaseYear: d.endpointPhaseYear, onboarding: d.onboarding, adv: clone(d.adv), presetId: null };
  }

  function presetState(cat, id) {
    var p = null; cat.presets.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return defaultState(cat);
    var s = defaultState(cat);
    Object.assign(s.customer, p.customer || {});
    s.lines = (p.lines || []).map(function (l) { return lineFromProduct(cat, l[0], l[1]); }).filter(Boolean);
    s.platform = p.platform || null; s.addons = Object.assign({}, p.addons || {});
    s.prices = Object.assign({}, p.sophosPrices || {});
    if (p.endpointPhaseYear != null) s.endpointPhaseYear = p.endpointPhaseYear;
    if (p.onboarding != null) s.onboarding = p.onboarding;
    Object.assign(s.adv, p.adv || {});
    s.presetId = id;
    return s;
  }

  function qty(unit, c) {
    var u = num(c.users), e = num(c.endpoints), sv = num(c.servers), m = num(c.mobile);
    return { user: u, device: e + sv, server: sv, userserver: u + sv, mobile: m, flat: 1 }[unit] != null
      ? { user: u, device: e + sv, server: sv, userserver: u + sv, mobile: m, flat: 1 }[unit] : 0;
  }

  function neededCats(s) {
    var set = {};
    s.lines.forEach(function (l) { if (l.retire !== "keep") l.cats.forEach(function (c) { set[c] = true; }); });
    return set;
  }

  function suggestPlatform(s, cat) {
    var need = neededCats(s), rank = 0;
    Object.keys(need).forEach(function (c) { if (TIER_FOR_CAT[c]) rank = Math.max(rank, TIER_FOR_CAT[c]); });
    if (num(s.customer.analysts) > 0) rank = Math.max(rank, 3);
    if (!s.lines.length) rank = Math.max(rank, 3);
    rank = Math.max(rank, 1);
    var pick = cat.sophos.platforms[0];
    cat.sophos.platforms.forEach(function (p) { if (p.rank === rank) pick = p; });
    return pick.id;
  }

  function platformById(cat, id) { var r = null; cat.sophos.platforms.forEach(function (p) { if (p.id === id) r = p; }); return r || cat.sophos.platforms[2]; }

  function suggestAddons(s, cat) {
    var need = neededCats(s), out = {}, why = {};
    cat.sophos.addons.forEach(function (a) {
      var hits = a.covers.filter(function (c) { return need[c]; });
      if (hits.length && !a.suggestOff) { out[a.id] = true; why[a.id] = "covers " + hits.join(", ") + " in current stack"; }
      else out[a.id] = false;
      if (a.newCapability && num(s.customer.mobile) > 0) { out[a.id] = true; why[a.id] = why[a.id] || "new capability for " + s.customer.mobile + " mobile devices"; }
    });
    return { on: out, why: why };
  }

  function resolve(s, cat) {
    var sp = suggestPlatform(s, cat);
    var platform = platformById(cat, s.platform || sp);
    var sug = suggestAddons(s, cat);
    var addons = cat.sophos.addons.map(function (a) {
      var available = !a.requires || platform.rank >= a.requires;
      var on = s.addons[a.id] != null ? !!s.addons[a.id] : sug.on[a.id];
      var price = s.prices["addon_" + a.id] != null ? num(s.prices["addon_" + a.id]) : a.price;
      return { def: a, on: on && available, available: available, suggested: sug.on[a.id], why: sug.why[a.id] || "", price: price };
    });
    var covered = {};
    platform.covers.forEach(function (c) { covered[c] = true; });
    addons.forEach(function (a) { if (a.on) a.def.covers.forEach(function (c) { covered[c] = true; }); });
    var lines = s.lines.map(function (l) {
      var r = l.retire;
      if (r === "auto" || r == null) {
        var all = l.cats.every(function (c) { return covered[c]; });
        r = all ? (l.cats.some(function (c) { return ENDPOINT_CATS.indexOf(c) >= 0; }) ? num(s.endpointPhaseYear, 1) : 1) : "keep";
      }
      return { line: l, retire: r === "keep" ? "keep" : Math.max(1, Math.min(4, num(r, 1))) };
    });
    return {
      suggestedPlatform: sp, platform: platform,
      userPrice: s.prices["platform_" + platform.id + "_user"] != null ? num(s.prices["platform_" + platform.id + "_user"]) : platform.userPrice,
      serverPrice: s.prices["platform_" + platform.id + "_server"] != null ? num(s.prices["platform_" + platform.id + "_server"]) : platform.serverPrice,
      addons: addons, covered: covered, lines: lines
    };
  }

  function compute(s, cat) {
    var R = resolve(s, cat), c = s.customer, a = s.adv, g = num(a.growth);
    var sf = s.scenario === "Conservative" ? num(a.consFactor) : 1;
    var curLines = [], sopLines = [];
    R.lines.forEach(function (x) {
      var l = x.line, q = qty(l.unit, c), costs = [];
      for (var y = 1; y <= 3; y++) costs.push(q * num(l.price) * (l.grows ? Math.pow(1 + g, y - 1) : 1));
      curLines.push({ name: l.name, vendor: l.vendor, uid: l.uid, qty: q, costs: costs, retire: x.retire, grows: l.grows });
      if (x.retire === "keep") sopLines.push({ name: l.name + " (retained)", kind: "kept", costs: costs.slice() });
      else if (x.retire > 1) sopLines.push({ name: l.name + " (until Year " + x.retire + ")", kind: "overlap",
        costs: costs.map(function (v, i) { return i + 1 < x.retire ? v : 0; }) });
    });
    var pu = num(c.users) * R.userPrice, ps = num(c.servers) * R.serverPrice;
    var sophosProducts = [{ name: R.platform.name + " (users)", kind: "sophos", costs: [pu, pu, pu] }];
    if (num(c.servers) > 0) sophosProducts.push({ name: R.platform.name + " (servers)", kind: "sophos", costs: [ps, ps, ps] });
    R.addons.forEach(function (ad) {
      if (!ad.on) return;
      var v = qty(ad.def.unit, c) * ad.price;
      sophosProducts.push({ name: ad.def.name, kind: "sophos", id: ad.def.id, costs: [v, v, v] });
    });
    if (num(s.onboarding) > 0) sophosProducts.push({ name: "Onboarding / migration (one-time)", kind: "sophos", costs: [num(s.onboarding), 0, 0] });
    sopLines = sophosProducts.concat(sopLines);
    var sum3 = function (rows) { var t = [0, 0, 0]; rows.forEach(function (r) { for (var i = 0; i < 3; i++) t[i] += r.costs[i]; }); return t; };
    var cur = sum3(curLines), sop = sum3(sopLines);
    var hard = cur.map(function (v, i) { return v - sop[i]; });
    var offload = R.platform.offload === "mdr" ? num(a.offloadMDR) : R.platform.offload === "xdr" ? num(a.offloadXDR) : 0;
    var analystVal = num(c.analysts) * num(c.analystCost) * num(a.triagePct) * offload * sf;
    var hours = num(c.analysts) * num(a.analystHours) * num(a.triagePct) * offload * sf;
    var dh = Math.max(0, (num(a.curMTTD) + num(a.curMTTR)) - (num(a.sMTTD) + num(a.sMTTR)));
    var incidentVal = num(a.incidents) * dh * num(a.incidentCostHr) * sf;
    var insVal = num(a.insPremium) * num(a.insReduction) * sf;
    var soft = analystVal + incidentVal + insVal;
    var total = hard.map(function (h) { return h + soft; });
    var cum = [], acc = 0; total.forEach(function (t) { acc += t; cum.push(acc); });
    var S = function (arr) { return arr.reduce(function (p, q) { return p + q; }, 0); };
    var cur3 = S(cur), sop3 = S(sop), tot3 = S(total);
    // Investment = Sophos-side cost excluding tools the customer keeps anyway (shown on both sides).
    var kept = sum3(sopLines.filter(function (l) { return l.kind === "kept"; }));
    var inv = sop.map(function (v, i) { return v - kept[i]; }), inv3 = S(inv);
    return {
      resolved: R, sf: sf, offload: offload, curLines: curLines, sopLines: sopLines, cur: cur, sop: sop, hard: hard,
      analystVal: analystVal, hours: hours, fte: num(a.analystHours) ? hours / num(a.analystHours) : 0,
      incidentVal: incidentVal, insVal: insVal, soft: soft, total: total, cum: cum,
      cur3: cur3, sop3: sop3, hard3: S(hard), soft3: soft * 3, tot3: tot3, avg: tot3 / 3,
      inv: inv, inv3: inv3, kept: kept,
      roi: inv3 ? tot3 / inv3 : 0, payback: (cur[0] - kept[0] + soft) > 0 ? inv[0] / ((cur[0] - kept[0] + soft) / 12) : 0,
      tcoRed: cur3 ? S(hard) / cur3 : 0,
      mttdImp: num(a.curMTTD) ? 1 - num(a.sMTTD) / num(a.curMTTD) : 0,
      mttrImp: num(a.curMTTR) ? 1 - num(a.sMTTR) / num(a.curMTTR) : 0,
      incHours: num(a.incidents) * dh, dh: dh
    };
  }

  function fmtMoney(x, sym) { return (x < 0 ? "-" : "") + sym + Math.round(Math.abs(x)).toLocaleString("en-GB"); }
  function pct(x) { return Math.round(x * 100) + "%"; }

  function talkingPoints(s, r, cat) {
    var sym = cat.currencies[s.customer.currency] || "£", M = function (x) { return fmtMoney(x, sym); };
    var vendors = [], vn = {};
    s.lines.forEach(function (l) { if (vendors.indexOf(l.vendor) < 0) vendors.push(l.vendor); });
    cat.competitors.forEach(function (c) { vn[c.id] = c.name; });
    var named = vendors.filter(function (v) { return v !== "other" && v !== "custom"; }).map(function (v) { return vn[v]; });
    var R = r.resolved, a = s.adv;
    var sophosNames = [R.platform.name].concat(R.addons.filter(function (x) { return x.on; }).map(function (x) { return x.def.name; }));
    var consumption = r.curLines.filter(function (l) { return l.grows; }).map(function (l) { return l.name; });
    var kept = r.curLines.filter(function (l) { return l.retire === "keep"; }).map(function (l) { return l.name; });
    var mdr = R.platform.offload === "mdr", ngsiem = R.addons.some(function (x) { return x.on && x.def.id === "ngsiem"; });
    var storage = R.addons.some(function (x) { return x.on && x.def.id === "storage1y"; });
    var P = { CFO: [], Procurement: [], CISO: [], "Risk & insurance": [] };
    if (r.hard3 > 0) P.CFO.push("3-year cost falls from " + M(r.cur3) + " to " + M(r.sop3) + " - " + pct(r.tcoRed) + " lower (" + M(r.hard3) + " hard saving).");
    else P.CFO.push("3-year Sophos cost is " + M(r.sop3) + " vs " + M(r.cur3) + " today; the value case rests on productivity and risk reduction (" + M(r.soft3) + " over 3 years).");
    P.CFO.push("Payback in about " + r.payback.toFixed(1) + " months; 3-year ROI of " + pct(r.roi) + " including productivity and risk value.");
    if (consumption.length) P.CFO.push(consumption.length + " current line(s) are consumption/ingest-billed (" + consumption.join("; ") + ") and are modelled growing " + pct(a.growth) + " a year. Sophos is priced per user/server and stays flat for the term.");
    if (r.analystVal > 0) P.CFO.push("Analyst capacity worth " + M(r.analystVal) + " a year is redeployed to higher-value work - not necessarily a headcount cut.");
    P.Procurement.push("Consolidates " + s.lines.length + " current product line(s)" + (named.length ? " from " + named.join(", ") : "") + " into one Sophos platform: " + sophosNames.join(", ") + ".");
    P.Procurement.push("Predictable per-user/server pricing for the term - no ingest true-ups or storage overages.");
    if (s.lines.some(function (l) { return l.cats.some(function (c) { return ENDPOINT_CATS.indexOf(c) >= 0; }); }))
      P.Procurement.push("Phased transition: existing endpoint/EDR retired from Year " + s.endpointPhaseYear + " so current contracts can run to term - no rip-and-replace.");
    if (kept.length) P.Procurement.push("Retained alongside Sophos (cost shown on both sides): " + kept.join("; ") + ".");
    P.CISO.push("Mean time to detect " + a.curMTTD + "h -> " + a.sMTTD + "h (" + pct(r.mttdImp) + " faster); respond " + a.curMTTR + "h -> " + a.sMTTR + "h (" + pct(r.mttrImp) + " faster).");
    if (mdr) P.CISO.push("Sophos MDR provides 24/7 triage and response, freeing ~" + Math.round(r.hours).toLocaleString("en-GB") + " analyst hours a year (" + r.fte.toFixed(1) + " FTE) for hunting, engineering and projects.");
    else if (r.hours > 0) P.CISO.push("Sophos XDR automation frees ~" + Math.round(r.hours).toLocaleString("en-GB") + " analyst hours a year; Sophos MDR would add 24/7 managed response.");
    if (ngsiem) P.CISO.push("13 months of searchable retention with Sophos Next-Gen SIEM by default, ingesting firewall and third-party logs without an ingest meter [S4][S5].");
    else if (storage) P.CISO.push("Data lake retention extended from 90 days to 1 year with the Data Storage 1-year pack [S6].");
    else P.CISO.push("Note: standard Sophos MDR/XDR data lake retention is 90 days [S2]; add Next-Gen SIEM (13 months) if longer retention is required [S4].");
    if (R.platform.rank >= 2) P.CISO.push("Response automation is built into the platform - no separate SOAR licence needed.");
    if (R.addons.some(function (x) { return x.on && x.def.id === "mobile"; })) P.CISO.push("New coverage: Sophos Mobile for " + s.customer.mobile + " phones/tablets.");
    if (num(a.insPremium) > 0) P["Risk & insurance"].push("Faster detection and response supports the cyber-insurance conversation; a potential " + pct(a.insReduction) + " premium reduction is modelled as " + M(r.insVal) + "/yr (potential - not guaranteed).");
    P["Risk & insurance"].push("Context: IBM Cost of a Data Breach 2025 (UK) - average breach £3.29m; organisations using security AI and automation extensively averaged £3.11m vs £3.78m without [S18].");
    var map = { cfo: "CFO", procurement: "Procurement", ciso: "CISO" };
    vendors.forEach(function (v) {
      var comp = null; cat.competitors.forEach(function (c) { if (c.id === v) comp = c; });
      if (!comp || !comp.points) return;
      Object.keys(map).forEach(function (k) { (comp.points[k] || []).forEach(function (t) { P[map[k]].push("vs " + comp.name + ": " + t); }); });
    });
    return P;
  }

  var api = { compute: compute, resolve: resolve, defaultState: defaultState, presetState: presetState, lineFromProduct: lineFromProduct,
              findProduct: findProduct, qty: qty, talkingPoints: talkingPoints, fmtMoney: fmtMoney, pct: pct, num: num };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ROIModel = api;
})(typeof window !== "undefined" ? window : this);
