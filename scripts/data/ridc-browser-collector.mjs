import { readFile, writeFile } from "node:fs/promises";


async function loadPayload(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}


function extractCatalogPage() {
  const entries = [...document.querySelectorAll("a.factsheet")]
    .map((factsheet) => {
      const row = factsheet.closest("tr");
      const titleLink = row?.querySelector(".views-field-title a");
      const logo = row?.querySelector(".views-field-field-image img");
      const nodeMatch = factsheet.getAttribute("href")?.match(/\/node\/(\d+)/);
      if (!row || !titleLink || !nodeMatch) return null;
      return {
        node_id: nodeMatch[1],
        title: (titleLink.textContent || "").trim(),
        detail_url: new URL(titleLink.getAttribute("href"), location.origin).href,
        node_url: new URL(factsheet.getAttribute("href"), location.origin).href,
        make_image_alt: (logo?.getAttribute("alt") || "").trim(),
        make_image_title: (logo?.getAttribute("title") || "").trim(),
        make_image_src: logo?.getAttribute("src") || null,
      };
    })
    .filter(Boolean);
  const lastPage = [...document.querySelectorAll("a")]
    .map((anchor) => anchor.getAttribute("href") || "")
    .map((href) => href.match(/[?&]page=(\d+)/)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((maximum, page) => Math.max(maximum, page), 0);
  return {
    title: document.title,
    url: location.href,
    entries,
    last_page_index: lastPage,
  };
}


function extractFactsheet() {
  const container = document.querySelector("main") || document.body;
  const lines = (container?.innerText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueAfter = (label) => {
    const index = lines.findIndex(
      (line) => line.toLowerCase() === label.toLowerCase(),
    );
    return index >= 0 ? lines[index + 1] || null : null;
  };
  const widthLabel = "Width of boot floor at narrowest point";
  const depthLabel = "Length of boot floor - back row of seats upright";
  return {
    status: lines.includes("BOOT") ? "ok" : "no_measurements",
    source_url: location.href,
    title:
      (document.querySelector("h1")?.textContent || document.title || "").trim(),
    make: valueAfter("Make"),
    body_type: valueAfter("Type"),
    test_year: valueAfter("Test Year"),
    doors: valueAfter("Doors"),
    seven_seats: valueAfter("Seven seats"),
    width_mm: valueAfter(widthLabel),
    depth_mm: valueAfter(depthLabel),
    width_quote: `${widthLabel}: ${valueAfter(widthLabel) || "N/A"}`,
    depth_quote: `${depthLabel}: ${valueAfter(depthLabel) || "N/A"}`,
  };
}


export async function collectCatalog(
  browser,
  outputPath,
  options = {},
) {
  const start = Number(options.start || 0);
  const limit = Number(options.limit || 48);
  const lastPageIndex = Number(options.lastPageIndex ?? 191);
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 1)));
  const output = await loadPayload(outputPath, {
    schema_version: 1,
    source: "ridc.org.uk",
    pages: [],
    entries: [],
  });
  const existingPages = new Set(
    output.pages.filter((page) => page.status === "ok").map((page) => page.page),
  );
  const targets = Array.from(
    {
      length: Math.max(
        0,
        Math.min(limit, lastPageIndex + 1 - start),
      ),
    },
    (_, index) => start + index,
  ).filter((page) => !existingPages.has(page));
  const batchPages = [];
  const batchEntries = [];
  let nextTarget = 0;

  async function worker() {
    const tab = await browser.tabs.new();
    try {
      while (nextTarget < targets.length) {
        const page = targets[nextTarget++];
        const targetUrl =
          "https://ridc.org.uk/features-reviews/out-and-about/" +
          `choosing-car/car?page=${page}`;
        let result;
        try {
          await tab.goto(targetUrl);
          await tab.playwright.waitForLoadState({
            state: "domcontentloaded",
            timeoutMs: 30000,
          });
          const extracted = await tab.playwright.evaluate(extractCatalogPage);
          result = {
            page,
            status: extracted.entries.length ? "ok" : "no_entries",
            url: extracted.url,
            title: extracted.title,
            entries: extracted.entries.length,
            last_page_index: extracted.last_page_index,
          };
          batchEntries.push(
            ...extracted.entries.map((entry) => ({
              ...entry,
              catalog_page: page,
            })),
          );
        } catch (error) {
          result = {
            page,
            status: "navigation_error",
            url: targetUrl,
            error: `${error?.name || "Error"}: ${error?.message || error}`,
          };
        }
        batchPages.push(result);
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
  const pagesByIndex = new Map(
    [...output.pages, ...batchPages].map((page) => [page.page, page]),
  );
  const entriesByNode = new Map(
    [...output.entries, ...batchEntries].map((entry) => [entry.node_id, entry]),
  );
  output.pages = [...pagesByIndex.values()].sort((a, b) => a.page - b.page);
  output.entries = [...entriesByNode.values()].sort(
    (a, b) => Number(a.node_id) - Number(b.node_id),
  );
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return {
    pages_requested: targets.length,
    pages_collected: batchPages.filter((page) => page.status === "ok").length,
    page_statuses: batchPages.reduce((counts, page) => {
      counts[page.status] = (counts[page.status] || 0) + 1;
      return counts;
    }, {}),
    total_pages: output.pages.filter((page) => page.status === "ok").length,
    total_entries: output.entries.length,
  };
}


export async function collectFactsheets(
  browser,
  catalogPath,
  observationsPath,
  options = {},
) {
  const start = Number(options.start || 0);
  const limit = Number(options.limit || 160);
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 1)));
  const catalog = await loadPayload(catalogPath, { entries: [] });
  const output = await loadPayload(observationsPath, {
    schema_version: 1,
    source: "ridc.org.uk",
    observations: [],
  });
  const existing = new Set(
    output.observations
      .filter((observation) => observation.status !== "navigation_error")
      .map((observation) => String(observation.node_id)),
  );
  const targets = catalog.entries
    .slice(start, start + limit)
    .filter((entry) => !existing.has(String(entry.node_id)));
  const batch = [];
  let nextTarget = 0;

  async function worker() {
    const tab = await browser.tabs.new();
    try {
      while (nextTarget < targets.length) {
        const target = targets[nextTarget++];
        let observation;
        try {
          await tab.goto(target.node_url);
          await tab.playwright.waitForLoadState({
            state: "domcontentloaded",
            timeoutMs: 30000,
          });
          observation = await tab.playwright.evaluate(extractFactsheet);
        } catch (error) {
          observation = {
            status: "navigation_error",
            source_url: target.node_url,
            error: `${error?.name || "Error"}: ${error?.message || error}`,
          };
        }
        batch.push({
          ...observation,
          node_id: target.node_id,
          catalog_title: target.title,
          catalog_page: target.catalog_page,
        });
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
  const observationsByNode = new Map(
    [...output.observations, ...batch].map((observation) => [
      String(observation.node_id),
      observation,
    ]),
  );
  output.observations = [...observationsByNode.values()].sort(
    (a, b) => Number(a.node_id) - Number(b.node_id),
  );
  await writeFile(observationsPath, `${JSON.stringify(output, null, 2)}\n`);
  return {
    start,
    requested: targets.length,
    collected: batch.length,
    statuses: batch.reduce((counts, observation) => {
      counts[observation.status] = (counts[observation.status] || 0) + 1;
      return counts;
    }, {}),
    total_observations: output.observations.length,
  };
}
