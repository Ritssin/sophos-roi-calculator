# Sophos ROI Calculator

A guided, zero-build ROI and 3-year TCO calculator for **Sophos Sales and SE teams**. It compares a customer's current security stack with a Sophos proposal and produces numbers and talking points for **CFO, Procurement and CISO** conversations.

- **Generic and multi-vendor.** Supports CrowdStrike, Palo Alto Networks, Microsoft (Defender / Sentinel), Arctic Wolf, Rapid7, SentinelOne and Other/custom. You can mix vendors in one stack.
- **Guided in 4 steps:** 1) Customer basics, 2) Current stack, 3) Sophos proposal (mapped from the stack automatically), 4) Results.
- **Results:** 3-year value, ROI, payback, 3-year TCO, analyst hours freed, MTTD/MTTR, a chart, a 3-year table, and persona talking points tailored to the chosen competitors.
- **Expected / Conservative** toggle. Advanced assumptions are collapsed by default.
- **Load example** presets, **Reset**, **Save/Load** (in the browser), **Export/Import JSON**, a **shareable link** (all inputs are stored in the URL), and a one-page **customer summary** for print or PDF.
- **Offline.** No CDNs, no build step and no server. Double-click `index.html`, or host it on GitHub Pages.

> **Important:** every price in this tool is an **illustrative placeholder, not vendor pricing**. Replace the placeholders with the customer's invoices and your Sophos quote. Competitive statements are taken from public vendor pages and Sophos compare pages, and are cited in the app under *Method & sources*.

## Quick start

1. Open `index.html` in Chrome, Edge, Firefox or Safari.
2. Either pick **Load example** (for instance *CrowdStrike + Palo Alto Cortex logs → Sophos MDR + NG SIEM*) or start at step 1.
3. Step 2: select the vendors the customer uses, tick their products and overwrite the annual costs.
4. Step 3: review the suggested Sophos platform and add-ons, adjust prices from your quote, and set when the existing endpoint is retired.
5. Step 4: present the results. Use **Customer summary (PDF)** for a leave-behind and **Share link** to send the exact scenario to a colleague.

## Project structure

```
index.html          App shell (no inline scripts)
css/styles.css      Styles, responsive layout and print layout
js/catalog.js       <- EDIT ME: currencies, default assumptions, Sophos products, competitors, presets, sources
js/model.js         Pure calculation logic (also runs in Node for tests)
js/app.js           UI: steps, events, persistence, share link, print summary
tests/model.test.js Node test for the model (no dependencies)
```

## Editing prices, products and presets (no coding needed)

Everything an SE is likely to change is in **`js/catalog.js`**. It is a plain JavaScript object, so edit the values and refresh the browser.

| What | Where in `catalog.js` |
|---|---|
| Default assumptions (growth %, analyst hours, triage %, MDR offload %, MTTD/MTTR, insurance) | `defaults.adv` |
| Default customer size, currency and analyst cost | `defaults.customer` |
| Sophos platform tiers (Endpoint / XDR / MDR / MDR Plus) and their per-user and per-server prices | `sophos.platforms` |
| Sophos add-ons (NG SIEM, ITDR, NDR, Email, Workspace Protection, Firewall, Cloud, Mobile, ...) | `sophos.addons` |
| Competitors and their product lines (name, categories, unit, price, billing) | `competitors[].products` |
| Competitor talking points by persona (use `[S#]` to cite a source) | `competitors[].points` |
| "Load example" presets | `presets` |
| Public sources shown under *Method & sources* | `sources` |

**Units** set how quantity is calculated from step 1: `user`, `device` (endpoints + servers), `server`, `userserver` (users + servers), `mobile`, or `flat` (one annual amount; use it for ingest- or consumption-billed products).

**Categories** drive the automatic Sophos mapping: `endpoint, edr, search, soar, mdr, ir, siem, logstore, retention, identity, ndr, vuln, email, ztna, firewall, mobile, cloud`.
For example, a competitor line tagged `siem` makes the tool suggest **Sophos Next-Gen SIEM**, and `mdr` raises the suggested platform to **Sophos MDR**. A line is retired automatically only when the selected Sophos products cover all of its categories. Otherwise it is kept, and its cost appears on both sides.

`billing: "consumption"` marks a line as ingest- or storage-billed. These lines grow each year by the growth assumption, and users can switch this off per line.

### Add a preset

```js
{ id: "my-preset", name: "SentinelOne + Splunk -> Sophos MDR + NG SIEM",
  customer: { name: "Example", users: 800, endpoints: 800, servers: 40, mobile: 0, currency: "GBP", analysts: 2, analystCost: 60000 },
  lines: [["s1_complete", {}], ["o_siem", { name: "Splunk (ingest)", price: 80000 }]],
  platform: "mdr", addons: { ngsiem: true }, endpointPhaseYear: 2, onboarding: 10000,
  adv: { insPremium: 50000 } }
```

`lines` lists `[productId, overrides]`. Overrides can set `name`, `price`, `grows` and `retire` (`"auto"`, `1`, `2`, `3` or `"keep"`).

## How the numbers are calculated

- **Current cost per year** = each ticked line × quantity × annual unit cost. Consumption lines grow by the growth % each year.
- **Sophos cost per year** = platform (users + servers) + enabled add-ons + one-time onboarding (Year 1) + current lines that are still running. These are either in overlap until their retire year, or retained and shown on both sides.
- **Hard saving** = current cost − Sophos cost.
- **Soft value** = analyst capacity freed (analysts × loaded cost × % triage × % offloaded, where MDR and XDR have different offload rates) + incident cost avoided (incidents × hours saved × cost per hour) + potential insurance reduction. The **Conservative** scenario counts only the chosen share of soft value.
- **ROI** = 3-year total value ÷ 3-year Sophos investment (Sophos-side cost excluding retained tools).
- **Payback** = Year-1 investment ÷ monthly (Year-1 current cost avoided + soft value).

Honesty notes built into the tool:
- The standard Sophos MDR/XDR data lake keeps **90 days**. Retention of 12 months or more comes from **Sophos Next-Gen SIEM** (13 months by default, no ingest charges) or the Data Storage 1-year pack.
- Analyst value is capacity that gets redeployed, not necessarily a headcount reduction. The insurance reduction is potential only.

## Test

```bash
node tests/model.test.js
```

The London preset reproduces the original worked example: 3-year value £855,400, ROI 247%, payback 5.0 months and 2,218 analyst hours freed.

## Host on GitHub Pages

1. Push this repo to GitHub, for example `github.com/Ritssin/sophos-roi-calculator`:
   ```bash
   git remote add origin https://github.com/Ritssin/sophos-roi-calculator.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages → Build and deployment**. Set **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, then click **Save**.
3. After about a minute the app is live at `https://ritssin.github.io/sophos-roi-calculator/`. Share links work there too, because the state is in the URL `#hash`.

> Consider making the repository **private** (GitHub Pages on private repos needs a paid plan), or keep internal-only talking points out of the public catalog.

## Privacy

Nothing leaves the browser. Saved scenarios use `localStorage`, and share links carry the inputs in the URL fragment, which browsers do not send to servers. Avoid putting sensitive customer data in links you share publicly.

## Disclaimer

This is an internal sales-enablement estimate tool, not an official Sophos price list or quote. Third-party product names and trademarks belong to their owners. No Sophos logos are included.
