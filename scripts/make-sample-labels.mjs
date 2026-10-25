// Renders the synthetic sample label images in fixtures/labels/.
// Every label is fictional: invented pharmacy, prescriber, patient and product.
// Run with: node scripts/make-sample-labels.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "fixtures/labels";
mkdirSync(out, { recursive: true });

const shell = (inner) => `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background:#d8d4cc; font-family:"Arial", sans-serif; }
  .label { width:620px; margin:18px; background:#fffef8; border:1px solid #bbb;
           padding:14px 18px; box-shadow:0 1px 3px #0003; }
  .pharm { font-size:12px; font-weight:bold; letter-spacing:.3px; }
  .addr { font-size:10px; color:#333; margin-bottom:8px; }
  hr { border:0; border-top:1px solid #999; margin:6px 0; }
  .rx { font-size:10px; color:#222; display:flex; justify-content:space-between; }
  .pt { font-size:13px; font-weight:bold; margin:6px 0 2px; }
  .sig { font-size:17px; font-weight:bold; line-height:1.25; margin:8px 0;
         font-family:"Arial Black", Arial, sans-serif; }
  .drug { font-size:15px; font-weight:bold; margin-top:6px; }
  .meta { font-size:11px; margin-top:4px; }
  .foot { font-size:9px; color:#444; margin-top:8px; border-top:1px solid #ccc;
          padding-top:4px; }
  .demo { font-size:8px; color:#777; }
  /* Obscures printed text the way a damaged or smudged label would. */
  .smudge { position:relative; display:inline-block; }
  .smudge::after { content:""; position:absolute; inset:-3px -6px;
      background:radial-gradient(ellipse at center,#6b6257f2 35%,#6b625700 72%);
      filter:blur(2.2px); }
</style>
<div class="label">${inner}</div>`;

const header = `
  <div class="pharm">NORTHGATE COMMUNITY PHARMACY (FICTIONAL)</div>
  <div class="addr">1200 Example Pkwy, Springfield, ZZ 00000 &nbsp;·&nbsp; Tel (000) 555-0100</div>
  <hr>
  <div class="rx"><span>Rx# 7741920</span><span>Date Filled: 10/18/2026</span></div>`;

const footer = (refills) => `
  <div class="foot">Refills: ${refills} &nbsp;|&nbsp; Prescriber: A. Example, MD
   &nbsp;|&nbsp; Discard after 10/18/2027
   <div class="demo">Demo: fictional medication data — not a real prescription</div></div>`;

const labels = {
  // Every critical field legible and unambiguous.
  clear: shell(`${header}
    <div class="pt">DOE, JAMIE Q.</div>
    <div class="sig">TAKE ONE TABLET BY MOUTH TWICE DAILY WITH FOOD</div>
    <div class="drug">LEVOTHIX 0.5 mg tablet</div>
    <div class="meta">Qty: 60 &nbsp;&nbsp; Generic for: Fictional Demo Tablet</div>
    ${footer(2)}`),

  // Strength deliberately obscured: it must stay unresolved, never guessed.
  unreadable: shell(`${header}
    <div class="pt">DOE, JAMIE Q.</div>
    <div class="sig">TAKE ONE TABLET BY MOUTH EVERY MORNING</div>
    <div class="drug">LEVOTHIX <span class="smudge">0.5 mg</span> tablet</div>
    <div class="meta">Qty: 30</div>
    ${footer(1)}`),

  // Two strengths and an unclear quantity: must produce questions.
  ambiguous: shell(`${header}
    <div class="pt">DOE, JAMIE Q.</div>
    <div class="sig">TAKE ONE TABLET BY MOUTH DAILY AS DIRECTED</div>
    <div class="drug">LEVOTHIX 25 mcg tablet</div>
    <div class="meta">Previously dispensed: LEVOTHIX 50 mcg tablet &nbsp;&nbsp; Qty: 90</div>
    ${footer(0)}`),
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 660, height: 420 } });
for (const [name, html] of Object.entries(labels)) {
  await page.setContent(html);
  const box = await page.locator(".label").boundingBox();
  await page.screenshot({
    path: `${out}/${name}.png`,
    clip: {
      x: box.x - 10,
      y: box.y - 10,
      width: box.width + 20,
      height: box.height + 20,
    },
  });
  console.log(`wrote ${out}/${name}.png`);
}
await browser.close();
