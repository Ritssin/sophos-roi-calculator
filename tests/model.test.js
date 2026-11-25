// Run: node tests/model.test.js  (no dependencies)
global.window = {};
require("../js/catalog.js");
const cat = window.ROI_CATALOG, M = require("../js/model.js");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

// 1. London preset reproduces the original worked example
let s = M.presetState(cat, "london"), r = M.compute(s, cat);
ok(JSON.stringify(r.cur.map(Math.round)) === "[220000,246000,277200]", "London current cost by year " + r.cur.map(Math.round));
ok(JSON.stringify(r.sop.map(Math.round)) === "[155500,95500,95500]", "London Sophos cost by year " + r.sop.map(Math.round));
ok(near(r.tot3, 855400), "London 3-yr value 855,400 (" + Math.round(r.tot3) + ")");
ok(near(r.roi, 2.4687, 0.001), "London ROI 247% (" + (r.roi * 100).toFixed(1) + "%)");
ok(near(r.payback, 5.0, 0.01), "London payback 5.0 months (" + r.payback.toFixed(2) + ")");
ok(near(r.hours, 2217.6, 0.1), "London analyst hours 2,218");
s.scenario = "Conservative"; r = M.compute(s, cat);
ok(near(r.tot3, 626050), "London conservative 3-yr 626,050 (" + Math.round(r.tot3) + ")");

// 2. Every preset computes finite numbers
cat.presets.forEach(p => { const x = M.compute(M.presetState(cat, p.id), cat);
  ok([x.tot3, x.roi, x.payback, x.hours].every(Number.isFinite), "preset " + p.id + ": 3yr " + Math.round(x.tot3) + ", ROI " + (x.roi * 100).toFixed(0) + "%, payback " + x.payback.toFixed(1) + "m, Sophos " + x.resolved.platform.name); });

// 3. Auto mapping
s = M.defaultState(cat); s.customer.analysts = 0;
s.lines = [M.lineFromProduct(cat, "s1_complete"), M.lineFromProduct(cat, "ms_sentinel")];
let R = M.resolve(s, cat);
ok(R.platform.id === "xdr", "SentinelOne EDR + no analysts suggests Sophos XDR (" + R.platform.id + ")");
ok(R.addons.find(a => a.def.id === "ngsiem").on, "Sentinel suggests NG SIEM");
ok(R.lines[0].retire === s.endpointPhaseYear && R.lines[1].retire === 1, "endpoint retires in phase year, SIEM in Year 1");
s.addons.ngsiem = false; R = M.resolve(s, cat);
ok(R.lines[1].retire === "keep", "disabling NG SIEM keeps Sentinel line");
s.platform = "endpoint"; s.addons.ngsiem = true; R = M.resolve(s, cat);
ok(!R.addons.find(a => a.def.id === "ngsiem").on, "NG SIEM unavailable on Endpoint-only tier");

// 4. Zero state is finite
s = M.defaultState(cat); Object.keys(s.customer).forEach(k => { if (typeof s.customer[k] === "number") s.customer[k] = 0; }); r = M.compute(s, cat);
ok([r.tot3, r.roi, r.payback].every(Number.isFinite), "all-zero inputs stay finite");

// 5. Talking points mention chosen competitors
const tp = M.talkingPoints(M.presetState(cat, "arcticwolf"), M.compute(M.presetState(cat, "arcticwolf"), cat), cat);
ok(tp.CFO.some(t => t.includes("Arctic Wolf")), "Arctic Wolf talking points included");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
