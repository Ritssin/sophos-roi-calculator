/*
 * Sophos ROI Calculator - CATALOG (edit me!)
 * ------------------------------------------------------------------
 * This file holds everything an SE may want to tune WITHOUT touching logic:
 *   - currencies, default assumptions
 *   - Sophos products (platform tiers + add-ons) with ILLUSTRATIVE prices
 *   - competitors and their product lines with ILLUSTRATIVE prices
 *   - talking points per competitor, example presets, public sources
 *
 * IMPORTANT: every price below is an ILLUSTRATIVE PLACEHOLDER (annual, per unit),
 * NOT a published vendor price. Replace with the customer's invoices and your Sophos quote.
 *
 * Units (how quantity is derived from Step 1 "Customer basics"):
 *   user        -> users
 *   device      -> endpoints + servers  (typical per-endpoint licensing)
 *   server      -> servers
 *   userserver  -> users + servers      (e.g. Sophos NG SIEM, licensed on users + servers)
 *   mobile      -> mobile devices
 *   flat        -> one annual amount (use for ingest/consumption-billed products)
 *
 * Categories (drive the Sophos mapping): endpoint, edr, search, soar, mdr, ir, siem, logstore,
 *   retention, identity, ndr, vuln, email, ztna, firewall, mobile, cloud
 */
window.ROI_CATALOG = {
  version: "2026.11",

  currencies: { GBP: "£", USD: "$", EUR: "€", AUD: "A$", CAD: "C$", INR: "₹" },

  // Default assumptions (Advanced section). Percentages are fractions (0.6 = 60%).
  defaults: {
    customer: { name: "", users: 1000, endpoints: 1000, servers: 50, mobile: 0, currency: "GBP", analysts: 2, analystCost: 65000 },
    endpointPhaseYear: 2,     // existing endpoint/EDR contracts retired from this year (licences run to term)
    onboarding: 15000,        // one-time Sophos onboarding / migration cost (Year 1)
    adv: {
      growth: 0.20,           // annual growth of consumption/ingest-billed lines (data volumes grow)
      analystHours: 1760,     // working hours per analyst per year
      triagePct: 0.60,        // % of analyst time on alert triage & response
      offloadMDR: 0.70,       // % of that work offloaded with Sophos MDR / MDR Plus (24/7 managed)
      offloadXDR: 0.20,       // % offloaded with self-managed Sophos XDR (automation, AI assist)
      consFactor: 0.50,       // Conservative scenario: share of soft benefits counted
      incidents: 6,           // incidents needing response per year
      incidentCostHr: 500,    // business cost per hour an incident is active
      curMTTD: 8, curMTTR: 16,// current mean time to detect / respond (hours)
      sMTTD: 0.5, sMTTR: 1.5, // with Sophos (hours) - conservative vs Sophos-published MDR averages
      insPremium: 0,          // annual cyber insurance premium
      insReduction: 0.05      // POTENTIAL premium reduction (not guaranteed)
    }
  },

  // ---------------- SOPHOS ----------------
  sophos: {
    // Platform tiers: pick ONE. rank: higher tiers cover everything lower tiers cover.
    platforms: [
      { id: "endpoint", rank: 1, name: "Sophos Endpoint", userPrice: 30, serverPrice: 60, offload: "none",
        covers: ["endpoint"], blurb: "Endpoint protection (formerly Intercept X): anti-ransomware, exploit prevention." },
      { id: "xdr", rank: 2, name: "Sophos XDR", userPrice: 45, serverPrice: 80, offload: "xdr",
        covers: ["endpoint", "edr", "search", "soar"], blurb: "Endpoint + EDR/XDR across endpoint, firewall, email, identity and third-party data; response automation." },
      { id: "mdr", rank: 3, name: "Sophos MDR", userPrice: 65, serverPrice: 110, offload: "mdr",
        covers: ["endpoint", "edr", "search", "soar", "mdr"], blurb: "24/7 managed detection & response. Includes Sophos Endpoint, XDR and 500+ third-party integrations." },
      { id: "mdrplus", rank: 4, name: "Sophos MDR Plus", userPrice: 85, serverPrice: 140, offload: "mdr",
        covers: ["endpoint", "edr", "search", "soar", "mdr", "ir"], blurb: "MDR plus critical incident management (full incident response) and breach protection warranty." }
    ],
    // Add-ons: toggle independently. unit as described above.
    addons: [
      { id: "ngsiem", name: "Sophos Next-Gen SIEM", unit: "userserver", price: 15, covers: ["siem", "logstore", "retention"],
        blurb: "Add-on to Sophos XDR/MDR. 13 months retention by default, priced per user/server - no ingest charges.", requires: 2 },
      { id: "storage1y", name: "Data Storage 1-year pack", unit: "userserver", price: 8, covers: [], suggestOff: true,
        blurb: "Alternative to NG SIEM: extends XDR/MDR data lake from 90 days to 1 year (Sophos telemetry + integrations).", requires: 2 },
      { id: "itdr", name: "Sophos ITDR", unit: "user", price: 8, covers: ["identity"], blurb: "Identity threat detection & response for Entra ID and Active Directory." },
      { id: "ndr", name: "Sophos NDR", unit: "userserver", price: 10, covers: ["ndr"], blurb: "Network detection & response for east-west traffic." },
      { id: "managedrisk", name: "Sophos Managed Risk", unit: "userserver", price: 6, covers: ["vuln"], blurb: "Managed vulnerability and attack-surface management." },
      { id: "email", name: "Sophos Email", unit: "user", price: 20, covers: ["email"], blurb: "AI-powered email and phishing protection." },
      { id: "workspace", name: "Sophos Workspace Protection", unit: "user", price: 25, covers: ["ztna"], blurb: "ZTNA, Protected Browser, DNS Protection and Email Monitoring System." },
      { id: "firewall", name: "Sophos Firewall subscriptions", unit: "flat", price: 20000, covers: ["firewall"], blurb: "Next-gen firewall protection subscriptions (enter total annual)." },
      { id: "cloud", name: "Sophos Cloud workload protection", unit: "server", price: 90, covers: ["cloud"], blurb: "XDR-based protection for Linux/Windows servers, Kubernetes and containers." },
      { id: "mobile", name: "Sophos Mobile", unit: "mobile", price: 15, covers: ["mobile"], newCapability: true, blurb: "UEM + mobile threat defence for iOS/Android phones and tablets." }
    ]
  },

  // ---------------- COMPETITORS ----------------
  // billing: "consumption" lines grow each year by adv.growth (ingest/storage-driven) unless unticked.
  competitors: [
    { id: "crowdstrike", name: "CrowdStrike", products: [
      { id: "cs_ep", name: "Falcon endpoint protection / EDR (Prevent, Insight)", cats: ["endpoint", "edr"], unit: "device", price: 45, billing: "per-unit" },
      { id: "cs_complete", name: "Falcon Complete (managed EDR / MDR)", cats: ["mdr"], unit: "device", price: 90, billing: "per-unit" },
      { id: "cs_itdr", name: "Falcon Identity Protection (ITDR)", cats: ["identity"], unit: "user", price: 20, billing: "per-unit" },
      { id: "cs_ngsiem", name: "Falcon Next-Gen SIEM (ingest + retention)", cats: ["siem", "logstore"], unit: "flat", price: 60000, billing: "consumption" },
      { id: "cs_retention", name: "Extended data retention (beyond default)", cats: ["retention"], unit: "flat", price: 30000, billing: "consumption" },
      { id: "cs_cloud", name: "Falcon Cloud Security (workloads)", cats: ["cloud"], unit: "server", price: 150, billing: "per-unit" }
    ], points: {
      cfo: ["CrowdStrike states Falcon Next-Gen SIEM licensing is based on data ingestion volume and length of retention - cost rises as log volumes grow [S7]. Sophos NG SIEM is priced per user/server with no ingest charges [S5]."],
      procurement: ["Sophos positions CrowdStrike as endpoint-centric: no native email protection, firewall or NDR [S12]. Sophos covers these on one platform - fewer suppliers and renewals."],
      ciso: ["Falcon Next-Gen SIEM default retention is 7 days, extendable with additional licensing [S7]; Sophos NG SIEM includes 13 months by default [S4].",
             "Sophos highlights 60+ exploit mitigations and CryptoGuard ransomware rollback on by default, versus narrower defaults it reports for CrowdStrike [S12]."]
    }},
    { id: "paloalto", name: "Palo Alto Networks", products: [
      { id: "pa_xdr", name: "Cortex XDR (per endpoint)", cats: ["endpoint", "edr"], unit: "device", price: 60, billing: "per-unit" },
      { id: "pa_xsiam", name: "Cortex XSIAM (SIEM / SOC platform)", cats: ["siem", "soar"], unit: "flat", price: 150000, billing: "consumption" },
      { id: "pa_xsoar", name: "Cortex XSOAR (SOAR)", cats: ["soar"], unit: "flat", price: 40000, billing: "per-unit" },
      { id: "pa_logs", name: "Cortex / Strata Logging Service (firewall log storage)", cats: ["logstore"], unit: "flat", price: 40000, billing: "consumption" },
      { id: "pa_retention", name: "Cortex XDR extra hot/cold retention add-on", cats: ["retention"], unit: "flat", price: 20000, billing: "consumption" },
      { id: "pa_ngfw", name: "NGFW security subscriptions", cats: ["firewall"], unit: "flat", price: 30000, billing: "per-unit" },
      { id: "pa_prisma", name: "Prisma Access (SASE / ZTNA)", cats: ["ztna"], unit: "user", price: 60, billing: "per-unit" }
    ], points: {
      cfo: ["Cortex XDR per-endpoint licences include 31 days of ingested-data retention; extra hot or cold retention is a paid add-on [S10]."],
      procurement: ["Cortex XDR, XSIAM, XSOAR and Strata Logging Service are separately licensed components; Sophos consolidates detection, response, automation and retention."],
      ciso: ["Longer searchable history on Sophos: 13 months with NG SIEM by default [S4] vs 31 days of ingested data on Cortex XDR per endpoint without add-ons [S10]."]
    }},
    { id: "microsoft", name: "Microsoft (Defender / Sentinel)", products: [
      { id: "ms_e5sec", name: "Microsoft 365 E5 Security / Defender Suite", cats: ["endpoint", "edr", "identity", "email"], unit: "user", price: 110, billing: "per-unit" },
      { id: "ms_mde", name: "Defender for Endpoint P2 (standalone)", cats: ["endpoint", "edr"], unit: "user", price: 50, billing: "per-unit" },
      { id: "ms_sentinel", name: "Microsoft Sentinel (per-GB ingestion)", cats: ["siem"], unit: "flat", price: 120000, billing: "consumption" },
      { id: "ms_sentinel_ret", name: "Sentinel / Log Analytics retention beyond 90 days", cats: ["retention"], unit: "flat", price: 20000, billing: "consumption" },
      { id: "ms_experts", name: "Defender Experts / Microsoft-stack MDR partner", cats: ["mdr"], unit: "user", price: 60, billing: "per-unit" },
      { id: "ms_dfs", name: "Defender for Servers / Cloud", cats: ["cloud"], unit: "server", price: 120, billing: "per-unit" }
    ], points: {
      cfo: ["Microsoft Sentinel's analytics tier is billed per GB ingested (pay-as-you-go or commitment tiers); 90 days retention is included and longer retention is charged per GB per month [S8]. Sophos NG SIEM: per user/server, 13 months included [S4][S5]."],
      procurement: ["Keep the Microsoft investment: Sophos MDR integrates Microsoft security tools at no additional cost [S3], so the customer can add 24/7 response without re-buying Microsoft licences."],
      ciso: ["Sophos reports that significant Microsoft protections (anti-exploit, ransomware) are not pre-tuned or enabled by default, and that Microsoft MDR is deepest on the Microsoft stack with more limited third-party response [S13]."]
    }},
    { id: "arcticwolf", name: "Arctic Wolf", products: [
      { id: "aw_mdr", name: "Arctic Wolf MDR (per user / server)", cats: ["mdr"], unit: "user", price: 180, billing: "per-unit" },
      { id: "aw_platform", name: "Aurora platform base fee", cats: ["mdr"], unit: "flat", price: 15000, billing: "per-unit" },
      { id: "aw_endpoint", name: "Aurora Endpoint Security (separate EPP)", cats: ["endpoint", "edr"], unit: "device", price: 40, billing: "per-unit" },
      { id: "aw_retention", name: "Log retention add-on (beyond 90 days)", cats: ["retention"], unit: "userserver", price: 15, billing: "per-unit" },
      { id: "aw_explorer", name: "Data Explorer (search telemetry) add-on", cats: ["search"], unit: "user", price: 25, billing: "per-unit" },
      { id: "aw_ir", name: "Incident Response retainer", cats: ["ir"], unit: "flat", price: 15000, billing: "per-unit" },
      { id: "aw_mr", name: "Managed Risk", cats: ["vuln"], unit: "user", price: 30, billing: "per-unit" }
    ], points: {
      cfo: ["Arctic Wolf MDR includes 90-day log retention unless longer retention is purchased [S9]. Per Sophos' comparison, full incident response needs a paid retainer and telemetry search (Data Explorer) is an add-on [S11]."],
      procurement: ["Per Sophos' comparison, the Arctic Wolf agent is not a full endpoint protection agent - Aurora Endpoint Security is sold separately; Sophos MDR includes Sophos Endpoint and XDR [S11]."],
      ciso: ["Sophos MDR takes direct response action (containment to remediation) and gives direct SOC analyst access; Sophos reports Arctic Wolf routes customers through its Concierge team [S11]."]
    }},
    { id: "rapid7", name: "Rapid7", products: [
      { id: "r7_mdr", name: "Managed Threat Complete (MDR)", cats: ["mdr", "siem", "soar", "retention"], unit: "device", price: 220, billing: "per-unit" },
      { id: "r7_siem", name: "InsightIDR / Incident Command (SIEM)", cats: ["siem"], unit: "device", price: 80, billing: "per-unit" },
      { id: "r7_av", name: "Endpoint protection / managed AV add-on", cats: ["endpoint"], unit: "device", price: 25, billing: "per-unit" },
      { id: "r7_vm", name: "InsightVM (vulnerability management)", cats: ["vuln"], unit: "device", price: 20, billing: "per-unit" },
      { id: "r7_soar", name: "InsightConnect (SOAR)", cats: ["soar"], unit: "flat", price: 25000, billing: "per-unit" },
      { id: "r7_ir", name: "Incident Response retainer", cats: ["ir"], unit: "flat", price: 20000, billing: "per-unit" }
    ], points: {
      cfo: ["Be fair: Rapid7 MDR is priced per asset with 13 months retention and unlimited ingestion [S14]. Win on what is included - Sophos MDR includes Sophos Endpoint, whereas Sophos reports Rapid7 charges extra for managed AV across MDR tiers [S15]."],
      procurement: ["Sophos reports Rapid7 does not provide native firewall, email security, secure access, wireless or switching [S15] - Sophos can consolidate more of the stack under one contract."],
      ciso: ["Per Sophos' comparison, Rapid7 XDR capabilities (EDR, NDR) are limited to its top tier, and ransomware prevention/DFIR are included only at the top MDR tier [S15]."]
    }},
    { id: "sentinelone", name: "SentinelOne", products: [
      { id: "s1_complete", name: "Singularity Complete / Commercial (EPP + EDR)", cats: ["endpoint", "edr"], unit: "device", price: 70, billing: "per-unit" },
      { id: "s1_mdr", name: "Vigilance / managed MDR service", cats: ["mdr"], unit: "device", price: 60, billing: "per-unit" },
      { id: "s1_identity", name: "Singularity Identity", cats: ["identity"], unit: "user", price: 15, billing: "per-unit" },
      { id: "s1_lake", name: "Singularity Data Lake / AI SIEM (ingest)", cats: ["siem", "logstore"], unit: "flat", price: 50000, billing: "consumption" },
      { id: "s1_retention", name: "Extended data retention", cats: ["retention"], unit: "flat", price: 15000, billing: "consumption" },
      { id: "s1_cloud", name: "Cloud workload security", cats: ["cloud"], unit: "server", price: 120, billing: "per-unit" }
    ], points: {
      cfo: ["SentinelOne's published packages include 14 days of data retention with Singularity Complete and 90 days with Singularity Commercial [S16]; Sophos NG SIEM includes 13 months [S4]."],
      procurement: ["One Sophos platform for endpoint, MDR, SIEM, identity, email and firewall reduces the number of vendors and renewals."],
      ciso: ["Sophos MDR supports SentinelOne environments [S3] - customers can move to Sophos MDR first and migrate endpoint at renewal."]
    }},
    { id: "other", name: "Other / custom", products: [
      { id: "o_epp", name: "Endpoint protection (other vendor)", cats: ["endpoint"], unit: "device", price: 30, billing: "per-unit" },
      { id: "o_edr", name: "EDR / XDR (other vendor)", cats: ["edr"], unit: "device", price: 50, billing: "per-unit" },
      { id: "o_mdr", name: "MDR / MSSP service", cats: ["mdr"], unit: "user", price: 120, billing: "per-unit" },
      { id: "o_siem", name: "SIEM (ingest-based, e.g. Splunk)", cats: ["siem"], unit: "flat", price: 60000, billing: "consumption" },
      { id: "o_logs", name: "Log storage / archive", cats: ["logstore", "retention"], unit: "flat", price: 20000, billing: "consumption" },
      { id: "o_soar", name: "Standalone SOAR (current or planned)", cats: ["soar"], unit: "flat", price: 25000, billing: "per-unit" },
      { id: "o_email", name: "Email security gateway", cats: ["email"], unit: "user", price: 20, billing: "per-unit" },
      { id: "o_fw", name: "Firewall subscriptions", cats: ["firewall"], unit: "flat", price: 20000, billing: "per-unit" },
      { id: "o_ztna", name: "VPN / ZTNA", cats: ["ztna"], unit: "user", price: 40, billing: "per-unit" },
      { id: "o_mdm", name: "Mobile device management / MTD", cats: ["mobile"], unit: "mobile", price: 30, billing: "per-unit" },
      { id: "o_vm", name: "Vulnerability management", cats: ["vuln"], unit: "device", price: 15, billing: "per-unit" },
      { id: "o_ir", name: "Incident response retainer", cats: ["ir"], unit: "flat", price: 15000, billing: "per-unit" }
    ], points: { cfo: [], procurement: [], ciso: [] } }
  ],

  // ---------------- PRESETS ("Load example") ----------------
  // lines: [productId, {overrides}] ; overrides may include price, grows, retire ("auto"|1|2|3|"keep")
  presets: [
    { id: "london", name: "CrowdStrike + Palo Alto Cortex logs -> Sophos MDR + NG SIEM (London example)",
      customer: { name: "London example customer", users: 1000, endpoints: 1000, servers: 0, mobile: 500, currency: "GBP", analysts: 3, analystCost: 65000 },
      lines: [["cs_ep", {}], ["cs_itdr", {}], ["cs_ngsiem", {}], ["cs_retention", {}], ["pa_logs", {}], ["o_soar", { name: "Standalone SOAR (needed for like-for-like automation)" }]],
      platform: "mdr", addons: { ngsiem: true, itdr: true, mobile: true },
      endpointPhaseYear: 2, onboarding: 15000, adv: { insPremium: 100000 },
      note: "Servers counted within endpoints. Reproduces the original worked example (3-yr value £855,400, ROI 247%)." },
    { id: "arcticwolf", name: "Arctic Wolf MDR replacement -> Sophos MDR Plus",
      customer: { name: "Arctic Wolf MDR customer", users: 750, endpoints: 700, servers: 60, mobile: 0, currency: "GBP", analysts: 1, analystCost: 60000 },
      lines: [["aw_mdr", {}], ["aw_platform", {}], ["aw_endpoint", {}], ["aw_retention", {}], ["aw_explorer", {}], ["aw_ir", {}]],
      platform: "mdrplus", addons: { ngsiem: true }, endpointPhaseYear: 1, onboarding: 10000,
      adv: { triagePct: 0.4, offloadMDR: 0.5, incidents: 4, insPremium: 60000 } },
    { id: "sentinel", name: "Microsoft E5 + Sentinel ingest -> keep Defender, add Sophos MDR + NG SIEM",
      customer: { name: "Microsoft E5 + Sentinel customer", users: 2000, endpoints: 2000, servers: 150, mobile: 0, currency: "GBP", analysts: 4, analystCost: 70000 },
      lines: [["ms_e5sec", { retire: "keep" }], ["ms_sentinel", {}], ["ms_sentinel_ret", {}], ["o_soar", {}]],
      platform: "mdr", addons: { ngsiem: true }, endpointPhaseYear: 1, onboarding: 20000,
      sophosPrices: { platform_mdr_user: 45, platform_mdr_server: 80 },
      adv: { growth: 0.25, incidents: 10, insPremium: 150000 },
      note: "Customer keeps Microsoft E5 (cost shown on both sides); Sophos MDR price reduced as the Defender agent is retained (illustrative)." }
  ],

  // ---------------- PUBLIC SOURCES (cited as [S#]) ----------------
  sources: [
    { id: "S1", text: "Sophos product portfolio (sophos.com llms.txt / products)", url: "https://www.sophos.com/llms.txt" },
    { id: "S2", text: "Sophos MDR and MDR Plus service tiers: 90 days standard data storage, 1-year extended storage add-on; third-party integrations included; NDR extra", url: "https://docs.sophos.com/central/Customer/help/en-us/ManageYourProducts/MDR/MDRServiceTiers/index.html" },
    { id: "S3", text: "Sophos MDR: vendor-agnostic, 500+ integrations included, supports Microsoft, CrowdStrike, SentinelOne environments; 1 min detect / 89 sec automated response claims", url: "https://www.sophos.com/en-us/services/managed-detection-and-response" },
    { id: "S4", text: "Sophos Next-Gen SIEM: add-on to XDR/MDR, 13 months retention by default, licensed to match XDR/MDR users and servers", url: "https://docs.sophos.com/fusion/Customer/help/en-us/ManageYourProducts/XDRSecOps/NGSIEM/index.html" },
    { id: "S5", text: "Sophos Next-Gen SIEM FAQ: priced on users and servers, no ingestion-based charges", url: "https://community.sophos.com/sophos-xdr/upgrade-center/f/faq/151037/introducing-sophos-next-gen-siem-new-optional-add-on" },
    { id: "S6", text: "Sophos XDR Data Lake limits: 90 days (XDR), extendable to 1 year with storage pack", url: "https://docs.sophos.com/central/customer/help/en-US/ManageYourProducts/ThreatAnalysisCenter/LiveDiscover/DataLakeStorageLimits/index.html" },
    { id: "S7", text: "CrowdStrike Falcon Next-Gen SIEM FAQ: licensing based on ingestion volume and retention; default retention 7 days, extendable to 36 months", url: "https://www.crowdstrike.com/en-us/blog/falcon-next-gen-siem-top-faqs/" },
    { id: "S8", text: "Microsoft Sentinel billing: analytics tier pay-as-you-go per GB or commitment tiers; 90 days retention included, beyond charged", url: "https://learn.microsoft.com/en-us/azure/sentinel/billing" },
    { id: "S9", text: "Arctic Wolf MDR Supplemental Product Terms: platform includes 90-day log retention unless another period is purchased", url: "https://arcticwolf.com/wp-content/uploads/2025/08/MDR_Supplemental-Product-Terms_2025.08-FINAL.pdf" },
    { id: "S10", text: "Palo Alto Cortex XDR data retention: 31 days ingested data per endpoint licence; hot/cold retention add-ons", url: "https://cortex-docs.paloaltonetworks.com/cortex-xdr-3.x/cortex-xdr-3.x-documentation/readme/understand-cortex-xdr-license-plans/data-retention-in-cortex-xdr" },
    { id: "S11", text: "Sophos vs Arctic Wolf comparison (Sophos)", url: "https://www.sophos.com/en-us/compare/sophos-vs-arcticwolf" },
    { id: "S12", text: "Sophos vs CrowdStrike comparison (Sophos)", url: "https://www.sophos.com/en-us/compare/sophos-vs-crowdstrike" },
    { id: "S13", text: "Sophos vs Microsoft comparison (Sophos)", url: "https://www.sophos.com/en-us/compare/sophos-vs-microsoft" },
    { id: "S14", text: "Rapid7 MDR pricing page: priced per endpoint/server/network, unlimited ingestion, 13 months retention", url: "https://www.rapid7.com/services/managed-detection-and-response-mdr/pricing/" },
    { id: "S15", text: "Sophos vs Rapid7 comparison (Sophos)", url: "https://www.sophos.com/en-us/compare/sophos-vs-rapid7" },
    { id: "S16", text: "SentinelOne platform packages: Complete includes 14 days retention, Commercial 90 days", url: "https://www.sentinelone.com/platform-packages/" },
    { id: "S17", text: "Palo Alto Strata Logging Service licence (new licence: 1-year retention default; legacy TB sizing)", url: "https://docs.paloaltonetworks.com/strata-logging-service/activation-and-onboarding/license-overview" },
    { id: "S18", text: "IBM Cost of a Data Breach 2025 (UK): average £3.29m; extensive AI/automation users £3.11m vs £3.78m", url: "https://uk.newsroom.ibm.com/2025-cost-of-data-breach-UK" },
    { id: "S19", text: "Sophos MDR published averages: 1 min detect, 25 min investigate, 12 min respond", url: "https://www.sophos.com/en-us/press/press-releases/2024/12/sophos-named-customers-choice-managed-detection-and-response-mdr" },
    { id: "S20", text: "Sophos vs the competition hub (all compare pages)", url: "https://www.sophos.com/en-us/compare/sophos-vs-competition" }
  ]
};
