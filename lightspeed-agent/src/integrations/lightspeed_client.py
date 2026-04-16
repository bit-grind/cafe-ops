"""
Lightspeed Client - Browser automation for Lightspeed POS report exports
+ Supabase import for sales data.

Uses Playwright for headless browser automation.
Supabase import uses direct REST API (no SDK dependency).
"""

import csv
import io
import json
import logging
import os
import re
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase config (env vars set in Docker / docker-compose)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ---------------------------------------------------------------------------
# Lightspeed portal config
# ---------------------------------------------------------------------------
LIGHTSPEED_URL = os.environ.get("LIGHTSPEED_URL", "")  # e.g. https://your-site.lightspeedhq.com
LIGHTSPEED_USER = os.environ.get("LIGHTSPEED_USER", "")
LIGHTSPEED_PASS = os.environ.get("LIGHTSPEED_PASS", "")

# Persistent download directory inside the container
DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", "/data/downloads"))


class LightspeedClient:
    """Handles Lightspeed browser automation and Supabase data import."""

    def __init__(self):
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------------
    # Supabase helpers
    # -----------------------------------------------------------------------
    @staticmethod
    def _supabase_upsert(table: str, rows: list, conflict: str) -> int:
        """Upsert rows to Supabase REST API. Returns HTTP status."""
        data = json.dumps(rows).encode("utf-8")
        req = Request(
            f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={conflict}",
            data=data,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )
        with urlopen(req) as resp:
            return resp.status

    @staticmethod
    def _parse_money(s: str) -> float:
        return float(s.strip().replace("$", "").replace(",", "") or 0)

    @staticmethod
    def _parse_pct(s: str) -> Optional[float]:
        s = s.strip().replace("%", "")
        return float(s) if s else None

    @staticmethod
    def _parse_date(s: str) -> Optional[str]:
        """'03 Jan 2023' → '2023-01-03'"""
        try:
            return datetime.strptime(s.strip(), "%d %b %Y").strftime("%Y-%m-%d")
        except ValueError:
            return None

    # -----------------------------------------------------------------------
    # CSV import: sales summary → sales_business_day
    # -----------------------------------------------------------------------
    def import_sales_summary_csv(self, csv_content: str, fallback_date: Optional[str] = None) -> dict:
        """Import a sales summary CSV string into Supabase. Returns stats."""
        reader = csv.DictReader(io.StringIO(csv_content))
        batch = []

        for row in reader:
            date_val = row.get("Date", "").strip()
            if not date_val or date_val.upper() == "TOTAL":
                continue

            business_date = self._parse_date(date_val) or fallback_date
            if not business_date:
                continue

            batch.append({
                "business_date": business_date,
                "gross_sales": self._parse_money(row.get("Total (inc. tax)", "0")),
                "net_sales": self._parse_money(row.get("Net Amount", "0")),
                "tax": self._parse_money(row.get("Tax Amount", "0")),
                "discounts": 0,
                "refunds": 0,
                "order_count": int(float(row.get("Number of Sales", "0") or 0)),
                "aov": self._parse_money(row.get("Sale Average", "0")),
            })

        if not batch:
            return {"status": "no_data", "rows": 0}

        self._supabase_upsert("sales_business_day", batch, "business_date")
        return {"status": "ok", "rows": len(batch)}

    # -----------------------------------------------------------------------
    # CSV import: product sales → sales_by_product
    # -----------------------------------------------------------------------
    def import_product_sales_csv(self, csv_content: str, business_date: str) -> dict:
        """Import a product-level CSV string into Supabase. Returns stats."""
        reader = csv.DictReader(io.StringIO(csv_content))
        batch = []
        seen = {}

        for row in reader:
            product = (row.get("Product") or "").strip()
            position_raw = (row.get("Position") or "").strip()
            if not position_raw or product.lower() == "total":
                continue

            entry = {
                "business_date": business_date,
                "position": int(position_raw),
                "product": product,
                "quantity": int(row.get("Quantity", "0") or 0),
                "quantity_pct": self._parse_pct(row.get("% of Quantity", "")),
                "sale_amount": self._parse_money(row.get("Sale Amount", "")),
                "sale_pct": self._parse_pct(row.get("% of Sale", "")),
                "cost": self._parse_money(row.get("Cost", "")),
                "gross_profit_pct": self._parse_pct(row.get("Gross Profit (%)", "")),
            }
            seen[(business_date, product)] = entry

        batch = list(seen.values())
        if not batch:
            return {"status": "no_data", "rows": 0}

        self._supabase_upsert("sales_by_product", batch, "business_date,product")
        return {"status": "ok", "rows": len(batch)}

    # -----------------------------------------------------------------------
    # Import from file on disk (CSV or ZIP)
    # -----------------------------------------------------------------------
    def import_file(self, file_path: str, report_type: str = "summary") -> dict:
        """Import a CSV or ZIP file from disk.

        report_type: 'summary' or 'product'
        """
        import zipfile

        path = Path(file_path)
        if not path.exists():
            return {"status": "error", "message": f"File not found: {file_path}"}

        results = []

        if path.suffix == ".zip":
            with zipfile.ZipFile(path) as zf:
                for name in sorted(zf.namelist()):
                    if not name.endswith(".csv"):
                        continue
                    raw = zf.read(name)
                    content = None
                    for enc in ("utf-8-sig", "latin-1", "cp1252"):
                        try:
                            content = raw.decode(enc)
                            break
                        except UnicodeDecodeError:
                            continue
                    if content is None:
                        results.append({"file": name, "status": "bad_encoding"})
                        continue

                    if report_type == "product":
                        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", name)
                        if not date_match:
                            results.append({"file": name, "status": "no_date_in_filename"})
                            continue
                        r = self.import_product_sales_csv(content, date_match.group(1))
                    else:
                        r = self.import_sales_summary_csv(content)
                    results.append({"file": name, **r})
        else:
            content = path.read_text(encoding="utf-8-sig")
            if report_type == "product":
                date_match = re.search(r"(\d{4}-\d{2}-\d{2})", path.name)
                date_str = date_match.group(1) if date_match else None
                if not date_str:
                    return {"status": "error", "message": "No date in filename for product CSV"}
                r = self.import_product_sales_csv(content, date_str)
            else:
                r = self.import_sales_summary_csv(content)
            results.append({"file": path.name, **r})

        total_rows = sum(r.get("rows", 0) for r in results)
        return {"status": "ok", "files_processed": len(results), "total_rows": total_rows, "details": results}

    # -----------------------------------------------------------------------
    # Sync status: check latest data in Supabase
    # -----------------------------------------------------------------------
    def get_sync_status(self) -> dict:
        """Check when sales data was last synced by querying Supabase."""
        req = Request(
            f"{SUPABASE_URL}/rest/v1/sales_business_day?select=business_date&order=business_date.desc&limit=1",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        with urlopen(req) as resp:
            data = json.loads(resp.read())

        latest_summary = data[0]["business_date"] if data else None

        req2 = Request(
            f"{SUPABASE_URL}/rest/v1/sales_by_product?select=business_date&order=business_date.desc&limit=1",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        with urlopen(req2) as resp2:
            data2 = json.loads(resp2.read())

        latest_product = data2[0]["business_date"] if data2 else None

        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        return {
            "latest_summary_date": latest_summary,
            "latest_product_date": latest_product,
            "today": today,
            "yesterday": yesterday,
            "summary_up_to_date": latest_summary == yesterday or latest_summary == today,
            "product_up_to_date": latest_product == yesterday or latest_product == today,
        }

    # -----------------------------------------------------------------------
    # Browser automation: Lightspeed portal
    # -----------------------------------------------------------------------
    async def download_report(self, report_type: str, date_from: str, date_to: str) -> dict:
        """
        Use Playwright to log into Lightspeed and download a report CSV.

        report_type: 'summary' or 'product'
        date_from / date_to: 'YYYY-MM-DD'

        Returns: { status, file_path, message }

        ── IMPORTANT ──────────────────────────────────────────────
        This method contains PLACEHOLDER selectors. You must update
        the CSS selectors and navigation steps to match your actual
        Lightspeed portal. See the TODO markers below.
        ──────────────────────────────────────────────────────────
        """
        if not all([LIGHTSPEED_URL, LIGHTSPEED_USER, LIGHTSPEED_PASS]):
            return {"status": "error", "message": "LIGHTSPEED_URL, LIGHTSPEED_USER, LIGHTSPEED_PASS env vars required"}

        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return {"status": "error", "message": "playwright not installed — run: pip install playwright && playwright install chromium"}

        download_path = DOWNLOAD_DIR / f"{report_type}_{date_from}_to_{date_to}"
        download_path.mkdir(parents=True, exist_ok=True)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(accept_downloads=True)
            page = await context.new_page()

            try:
                # ── Step 1: Login ─────────────────────────────────
                await page.goto(LIGHTSPEED_URL)
                await page.wait_for_load_state("networkidle")

                # TODO: Update these selectors to match Lightspeed login page
                await page.fill('input[name="username"], input[type="email"], #username', LIGHTSPEED_USER)
                await page.fill('input[name="password"], input[type="password"], #password', LIGHTSPEED_PASS)
                await page.click('button[type="submit"], input[type="submit"], .login-button')
                await page.wait_for_load_state("networkidle")

                logger.info("Logged into Lightspeed")

                # ── Step 2: Navigate to reports ───────────────────
                # TODO: Update navigation to match your Lightspeed portal
                # These are common patterns — adjust for your version
                if report_type == "summary":
                    # TODO: Navigate to Sales Summary report
                    # await page.click('a[href*="reports"]')
                    # await page.click('text=Sales Summary')
                    pass
                else:
                    # TODO: Navigate to Sales by Product report
                    # await page.click('a[href*="reports"]')
                    # await page.click('text=Sales by Product')
                    pass

                # ── Step 3: Set date range ────────────────────────
                # TODO: Update date picker selectors
                # await page.fill('#date-from', date_from)
                # await page.fill('#date-to', date_to)
                # await page.click('button:has-text("Apply")')
                # await page.wait_for_load_state("networkidle")

                # ── Step 4: Download CSV ──────────────────────────
                # TODO: Update export button selector
                # async with page.expect_download() as download_info:
                #     await page.click('button:has-text("Export"), a:has-text("CSV")')
                # download = await download_info.value
                # saved_path = str(download_path / download.suggested_filename)
                # await download.save_as(saved_path)

                # For now, return a placeholder indicating selectors need updating
                return {
                    "status": "needs_setup",
                    "message": (
                        "Browser automation scaffold is ready but Lightspeed portal "
                        "selectors need to be configured. Show me the Lightspeed portal "
                        "pages and I'll fill in the exact CSS selectors."
                    ),
                }

            except Exception as e:
                # Save a screenshot for debugging
                debug_path = str(download_path / "error_screenshot.png")
                await page.screenshot(path=debug_path)
                logger.error(f"Browser automation failed: {e}")
                return {"status": "error", "message": str(e), "screenshot": debug_path}

            finally:
                await browser.close()

    async def sync_daily(self, date: Optional[str] = None) -> dict:
        """
        Full pipeline: download reports from Lightspeed and import to Supabase.
        Defaults to yesterday if no date provided.
        """
        if date is None:
            date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        results = {}

        # Download and import sales summary
        summary_result = await self.download_report("summary", date, date)
        results["summary_download"] = summary_result

        if summary_result.get("status") == "ok" and summary_result.get("file_path"):
            import_result = self.import_file(summary_result["file_path"], "summary")
            results["summary_import"] = import_result

        # Download and import product sales
        product_result = await self.download_report("product", date, date)
        results["product_download"] = product_result

        if product_result.get("status") == "ok" and product_result.get("file_path"):
            import_result = self.import_file(product_result["file_path"], "product")
            results["product_import"] = import_result

        return results
