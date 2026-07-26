/**
 * Browser retrieval stage for collect-cars-com-boot-dims.py.
 *
 * Cars.com rejects direct command-line HTTP clients. Import this module in a
 * Codex browser session and pass the selected Browser binding to collectBatch.
 * It uses ordinary browser navigation, does not alter the user agent, and
 * records only trim links and labeled measurements from the rendered page.
 */

import { readFile, writeFile } from "node:fs/promises";

export function extractCarsComPage() {
  const measurementNodes = Array.from(
    document.querySelectorAll(".data-heading"),
  ).filter((node) =>
    /^(Cargo |Interior cargo |Passenger Capacity$|Third (?:Head|Leg|Shoulder|Hip) Room$)/i.test(
      (node.textContent || "").trim(),
    ),
  );

  const measurements = {};
  for (const node of measurementNodes) {
    const label = (node.textContent || "").trim();
    const container = node.parentElement;
    if (!container) continue;
    const valueNode = container.querySelector(".data-value");
    if (valueNode) {
      measurements[label] = (valueNode.textContent || "").trim();
      continue;
    }
    const text = (container.textContent || "").replace(/\s+/g, " ").trim();
    measurements[label] = text.replace(label, "").trim();
  }

  const styleLinks = Array.from(
    document.querySelectorAll('a[href*="/specs/"]'),
  )
    .map((anchor) => ({
      url: anchor.href,
      style_name: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
    }))
    .filter(
      (item, index, values) =>
        item.style_name &&
        values.findIndex((candidate) => candidate.url === item.url) === index,
    );

  const selectedLink =
    styleLinks.find((item) => item.url === window.location.href) || null;
  const heading = (
    document.querySelector("h1")?.textContent || ""
  ).replace(/\s+/g, " ").trim();
  const bodyType =
    Array.from(document.querySelectorAll("h2"))
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .find((text) =>
        /^(?:Sedan|Coupe|Convertible|Hatchback|Wagon|Sport Utility|Minivan|Passenger Van)$/i.test(
          text,
        ),
      ) || null;

  return {
    title: document.title,
    url: window.location.href,
    style_name: selectedLink?.style_name || heading || null,
    body_type: bodyType,
    style_links: styleLinks,
    measurements: measurements,
  };
}

async function loadPayload(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function collectBatch(
  browser,
  manifestPath,
  observationsPath,
  options = {},
) {
  const start = Number(options.start || 0);
  const limit = Number(options.limit || 8);
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 1)));
  const manifest = await loadPayload(manifestPath, { families: [] });
  const observations = await loadPayload(observationsPath, {
    schema_version: 1,
    source: "cars.com",
    pages: [],
  });
  const existing = new Set(
    observations.pages.map((page) => `${page.family_key}|${page.target_url}`),
  );
  const targets = manifest.families
    .flatMap((item) =>
      item.targets.map((target) => ({
        family_key: item.family_key,
        family: item.family,
        ...target,
      })),
    )
    .slice(start, start + limit);

  const batch = [];
  let nextTarget = 0;
  async function worker() {
    const tab = await browser.tabs.new();
    try {
      while (nextTarget < targets.length) {
        const target = targets[nextTarget++];
        const key = `${target.family_key}|${target.url}`;
        if (existing.has(key)) continue;
        let page;
        try {
          await tab.goto(target.url);
          await tab.playwright.waitForLoadState({
            state: "domcontentloaded",
            timeoutMs: 30000,
          });
          page = await tab.playwright.evaluate(extractCarsComPage);
          page.status = Object.keys(page.measurements).length
            ? "ok"
            : "no_measurements";
        } catch (error) {
          page = {
            status: "navigation_error",
            error: `${error?.name || "Error"}: ${error?.message || error}`,
            url: target.url,
            title: null,
            style_name: null,
            style_links: [],
            measurements: {},
          };
        }
        page.family_key = target.family_key;
        page.target_year = target.year;
        page.target_url = target.url;
        observations.pages.push(page);
        batch.push(page);
        existing.add(key);
      }
    } finally {
      await tab.close();
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, targets.length)) },
      () => worker(),
    ),
  );
  await writeFile(
    observationsPath,
    `${JSON.stringify(observations, null, 2)}\n`,
  );
  return {
    start,
    requested: targets.length,
    collected: batch.length,
    concurrency,
    total_observations: observations.pages.length,
    statuses: batch.reduce((counts, page) => {
      counts[page.status] = (counts[page.status] || 0) + 1;
      return counts;
    }, {}),
  };
}

export async function collectStylePages(
  browser,
  observationsPath,
  options = {},
) {
  const limit = Number(options.limit || 40);
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 1)));
  const observations = await loadPayload(observationsPath, {
    schema_version: 1,
    source: "cars.com",
    pages: [],
  });
  const familyKeys = new Set(options.familyKeys || []);
  const existing = new Set(
    observations.pages.map((page) => `${page.family_key}|${page.target_url}`),
  );
  const targets = [];
  for (const page of observations.pages) {
    if (
      page.status !== "ok" ||
      (familyKeys.size && !familyKeys.has(page.family_key))
    ) {
      continue;
    }
    for (const style of page.style_links || []) {
      const key = `${page.family_key}|${style.url}`;
      if (existing.has(key)) continue;
      targets.push({
        family_key: page.family_key,
        year: page.target_year,
        url: style.url,
        style_name: style.style_name,
      });
      existing.add(key);
      if (targets.length >= limit) break;
    }
    if (targets.length >= limit) break;
  }

  const batch = [];
  let nextTarget = 0;
  async function worker() {
    const tab = await browser.tabs.new();
    try {
      while (nextTarget < targets.length) {
        const target = targets[nextTarget++];
        let page;
        try {
          await tab.goto(target.url);
          await tab.playwright.waitForLoadState({
            state: "domcontentloaded",
            timeoutMs: 30000,
          });
          page = await tab.playwright.evaluate(extractCarsComPage);
          page.status = Object.keys(page.measurements).length
            ? "ok"
            : "no_measurements";
        } catch (error) {
          page = {
            status: "navigation_error",
            error: `${error?.name || "Error"}: ${error?.message || error}`,
            url: target.url,
            title: null,
            style_name: target.style_name,
            style_links: [],
            measurements: {},
          };
        }
        page.family_key = target.family_key;
        page.target_year = target.year;
        page.target_url = target.url;
        observations.pages.push(page);
        batch.push(page);
      }
    } finally {
      await tab.close();
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, targets.length)) },
      () => worker(),
    ),
  );
  await writeFile(
    observationsPath,
    `${JSON.stringify(observations, null, 2)}\n`,
  );
  return {
    requested: targets.length,
    collected: batch.length,
    concurrency,
    total_observations: observations.pages.length,
    statuses: batch.reduce((counts, page) => {
      counts[page.status] = (counts[page.status] || 0) + 1;
      return counts;
    }, {}),
  };
}
