#!/usr/bin/env python3
"""Collect one representative enclosure envelope per truck fitment category."""

import csv
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


SEED_URL = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=1144&ctrl=product"
    "&lang=en&name=black-8-dual-sealed-sub-box-fits-chevy-silverado-regular-cab"
    "-07-24&option=com_hikashop&task=show"
)
OUTPUT_PATH = Path("/private/tmp/ground-shaker-truck-enclosures.csv")
ALL_OUTPUT_PATH = Path("/private/tmp/ground-shaker-all-truck-enclosures.csv")
TRUCK_CATEGORY = re.compile(
    r"(F-?150|F-?250|F-?350|SILVERADO|SIERRA|COLORADO|CANYON|"
    r"\bRAM\b|TUNDRA|TACOMA|FRONTIER|TITAN|RIDGELINE|GLADIATOR|"
    r"MAVERICK|SANTA CRUZ)",
    re.IGNORECASE,
)


class ParsedPage(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links = []
        self.headings = []
        self.texts = []
        self._href = None
        self._anchor_text = []
        self._heading = None
        self._heading_text = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "a":
            self._href = attributes.get("href")
            self._anchor_text = []
        if tag in {"h1", "h2", "h3"}:
            self._heading = tag
            self._heading_text = []

    def handle_data(self, data):
        text = " ".join(data.split())
        if not text:
            return
        self.texts.append(text)
        if self._href is not None:
            self._anchor_text.append(text)
        if self._heading is not None:
            self._heading_text.append(text)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join(self._anchor_text).strip()))
            self._href = None
            self._anchor_text = []
        if tag == self._heading:
            self.headings.append(" ".join(self._heading_text).strip())
            self._heading = None
            self._heading_text = []


def fetch(url: str) -> ParsedPage:
    result = subprocess.run(
        ["curl", "-sS", "-L", "--max-time", "30", url],
        check=True,
        capture_output=True,
        text=True,
    )
    page = ParsedPage()
    page.feed(result.stdout)
    return page


def mixed_number(value: str):
    value = (
        value.replace("”", "")
        .replace('"', "")
        .replace("INCHES", "")
        .strip()
    )
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:(\d+)\s*/\s*(\d+))?", value)
    if not match:
        return None
    number = float(match.group(1))
    if match.group(2) and match.group(3):
        number += int(match.group(2)) / int(match.group(3))
    return number


def labeled_values(texts, label_pattern):
    values = []
    pattern = re.compile(
        rf"(?:^|[-\s]){label_pattern}\s*:\s*([^;]+)", re.IGNORECASE
    )
    for text in texts:
        match = pattern.search(text)
        if match:
            value = mixed_number(match.group(1))
            if value is not None:
                values.append(value)
    return values


def parse_product(category_name, category_url, product_url):
    page = fetch(product_url)
    title = next(
        (heading for heading in page.headings if "FITS" in heading.upper()),
        next((text for text in page.texts if "FITS" in text.upper()), ""),
    )
    dimension_start = next(
        (
            index
            for index, text in enumerate(page.texts)
            if text.upper().startswith("DIMENSIONS")
        ),
        0,
    )
    dimension_end = next(
        (
            index
            for index, text in enumerate(page.texts[dimension_start + 1 :], dimension_start + 1)
            if text.upper().startswith("CONSTRUCTION")
        ),
        len(page.texts),
    )
    dimension_texts = page.texts[dimension_start:dimension_end]
    heights = labeled_values(dimension_texts, r"(?:FRONT\s+|REAR\s+)?HEIG?HT")
    lengths = labeled_values(dimension_texts, r"LEN(?:GTH|GHT)")
    depths = labeled_values(dimension_texts, r"(?:(?:TOP|BOTTOM)\s+)?DEPTH")
    if not depths:
        depths = labeled_values(dimension_texts, r"WIDTH")
    full_text = " ".join(page.texts).upper()
    if "FITS UNDER" in full_text:
        placement = "under_seat"
    elif "FITS BEHIND" in full_text:
        placement = "behind_seat"
    else:
        placement = ""
    return {
        "category": category_name,
        "title": title,
        "width_in": max(lengths) if lengths else "",
        "depth_in": max(depths) if depths else "",
        "height_in": max(heights) if heights else "",
        "placement": placement,
        "source_url": product_url,
        "category_url": category_url,
    }


def product_links_for_category(item):
    category_name, category_url = item
    page = fetch(category_url)
    product_links = {}
    for href, text in page.links:
        if "ctrl=product" not in href or "task=show" not in href:
            continue
        absolute = urljoin(category_url, href.replace("&amp;", "&"))
        product_links[absolute] = max(
            text,
            product_links.get(absolute, ""),
            key=len,
        )
    return category_name, category_url, product_links


def representative_product(item):
    category_name, category_url, product_links = product_links_for_category(item)
    if not product_links:
        return None
    def product_score(item):
        _, title = item
        title = title.upper()
        return (
            40 * ("QUAD" in title)
            + 30 * ("TRIPLE" in title)
            + 20 * ("DUAL" in title)
            + 5 * ("PORTED" in title)
            + 3 * ('12"' in title)
            + 2 * ('10"' in title)
            + 1 * ('8"' in title)
        )
    product_url, _ = max(product_links.items(), key=product_score)
    return parse_product(
        category_name,
        category_url,
        product_url,
    )


def all_products(items):
    with ThreadPoolExecutor(max_workers=8) as executor:
        category_results = list(executor.map(product_links_for_category, items))
    product_jobs = []
    seen = set()
    for category_name, category_url, product_links in category_results:
        for product_url in product_links:
            if product_url in seen:
                continue
            seen.add(product_url)
            product_jobs.append((category_name, category_url, product_url))
    with ThreadPoolExecutor(max_workers=12) as executor:
        return list(executor.map(lambda job: parse_product(*job), product_jobs))


def main() -> None:
    seed = fetch(SEED_URL)
    categories = {}
    for href, text in seed.links:
        if (
            "ctrl=category" in href
            and "task=listing" in href
            and TRUCK_CATEGORY.search(text)
        ):
            categories[text] = urljoin(SEED_URL, href.replace("&amp;", "&"))

    collect_all = "--all" in sys.argv
    if collect_all:
        rows = all_products(categories.items())
        output_path = ALL_OUTPUT_PATH
    else:
        with ThreadPoolExecutor(max_workers=6) as executor:
            rows = list(executor.map(representative_product, categories.items()))
        output_path = OUTPUT_PATH
    rows = sorted((row for row in rows if row), key=lambda row: row["category"])

    fieldnames = [
        "category",
        "title",
        "width_in",
        "depth_in",
        "height_in",
        "placement",
        "source_url",
        "category_url",
    ]
    with output_path.open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Collected {len(rows)} truck fitment products to {output_path}")
    for row in rows:
        print(
            f"{row['category']} | {row['width_in']} x {row['depth_in']} x "
            f"{row['height_in']} | {row['placement']} | {row['title']}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
