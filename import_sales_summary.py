"""
Import daily sales summary CSVs from a zip into Supabase (sales_business_day).
Usage: python3 import_sales_summary.py <path-to-zip>

CSV columns: Date, Number of Sales, Net Amount, Tax Amount, Total (inc. tax), Sale Average
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from datetime import datetime

SUPABASE_URL = "https://pzhqjdpbeyfndeckkhlu.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

def parse_money(s):
    return float(s.strip().replace("$", "").replace(",", "") or 0)

def parse_date(s):
    """'03 Jan 2023' → '2023-01-03'"""
    try:
        return datetime.strptime(s.strip(), "%d %b %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None

def extract_date_from_filename(name):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(name))
    return m.group(1) if m else None

def upsert_batch(rows):
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/sales_business_day?on_conflict=business_date",
        data=data,
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status

def main():
    zip_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not zip_path:
        print("Usage: python3 import_sales_summary.py <path-to-zip>")
        sys.exit(1)

    total_rows = 0
    files_processed = 0
    errors = []
    batch = []
    BATCH_SIZE = 500

    with zipfile.ZipFile(zip_path) as zf:
        csv_files = sorted(n for n in zf.namelist() if n.endswith(".csv"))
        print(f"Found {len(csv_files)} CSV files")

        for name in csv_files:
            filename_date = extract_date_from_filename(name)

            with zf.open(name) as raw:
                raw_bytes = raw.read()

            reader = None
            for enc in ("utf-8-sig", "latin-1", "cp1252"):
                try:
                    reader = csv.DictReader(io.StringIO(raw_bytes.decode(enc)))
                    _ = reader.fieldnames
                    break
                except (UnicodeDecodeError, Exception):
                    reader = None

            if reader is None:
                print(f"  SKIP (bad encoding): {name}")
                continue

            for row in reader:
                date_val = row.get("Date", "").strip()
                # Skip TOTAL rows
                if not date_val or date_val.upper() == "TOTAL":
                    continue

                business_date = parse_date(date_val) or filename_date
                if not business_date:
                    continue

                batch.append({
                    "business_date": business_date,
                    "gross_sales":  parse_money(row.get("Total (inc. tax)", "0")),
                    "net_sales":    parse_money(row.get("Net Amount", "0")),
                    "tax":          parse_money(row.get("Tax Amount", "0")),
                    "discounts":    0,
                    "refunds":      0,
                    "order_count":  int(float(row.get("Number of Sales", "0") or 0)),
                    "aov":          parse_money(row.get("Sale Average", "0")),
                })
                total_rows += 1

                if len(batch) >= BATCH_SIZE:
                    try:
                        upsert_batch(batch)
                        print(f"  Upserted {len(batch)} rows (total: {total_rows})")
                    except Exception as e:
                        errors.append(str(e))
                        print(f"  ERROR: {e}")
                    batch = []

            files_processed += 1

        if batch:
            try:
                upsert_batch(batch)
                print(f"  Upserted {len(batch)} rows (total: {total_rows})")
            except Exception as e:
                errors.append(str(e))
                print(f"  ERROR: {e}")

    print(f"\nDone. {files_processed} files, {total_rows} rows imported, {len(errors)} errors.")
    if errors:
        for e in errors:
            print(f"  {e}")

if __name__ == "__main__":
    main()
