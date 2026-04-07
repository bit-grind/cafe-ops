"""
Import sales_by_product CSVs from a zip file into Supabase.
Usage: python3 import_sales_by_product.py <path-to-zip>
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

SUPABASE_URL = "https://pzhqjdpbeyfndeckkhlu.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6aHFqZHBiZXlmbmRlY2traGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDI4MTYsImV4cCI6MjA4NzkxODgxNn0.gTX7hLCN6nFRoehNLoPn1dMbPJK_Jjzch0miMneqcpU")

def parse_money(s):
    """'$4,561.90' -> 4561.90"""
    s = s.strip().replace("$", "").replace(",", "")
    return float(s) if s else None

def parse_pct(s):
    """'16%' -> 16.0"""
    s = s.strip().replace("%", "")
    return float(s) if s else None

def extract_date(filename):
    """'sales_by_product_2023-01-03.csv' -> '2023-01-03'"""
    m = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
    return m.group(1) if m else None

def upsert_batch(rows):
    # Deduplicate within the batch on (business_date, product)
    seen = {}
    for row in rows:
        key = (row["business_date"], row["product"])
        seen[key] = row
    rows = list(seen.values())

    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/sales_by_product?on_conflict=business_date,product",
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
        print("Usage: python3 import_sales_by_product.py <path-to-zip>")
        sys.exit(1)

    total_rows = 0
    files_processed = 0
    errors = []

    with zipfile.ZipFile(zip_path) as zf:
        csv_files = sorted(n for n in zf.namelist() if n.endswith(".csv"))
        print(f"Found {len(csv_files)} CSV files")

        batch = []
        BATCH_SIZE = 500

        for name in csv_files:
            date_str = extract_date(os.path.basename(name))
            if not date_str:
                print(f"  SKIP (no date): {name}")
                continue

            with zf.open(name) as raw:
                raw_bytes = raw.read()
            reader = None
            for enc in ("utf-8-sig", "latin-1", "cp1252"):
                try:
                    reader = csv.DictReader(io.StringIO(raw_bytes.decode(enc)))
                    _ = reader.fieldnames  # validate encoding
                    break
                except (UnicodeDecodeError, Exception):
                    reader = None
            if reader is None:
                print(f"  SKIP (bad encoding): {name}")
                continue
            for row in reader:
                    # Skip malformed rows (e.g. "No results found.")
                    if row.get("Product") is None:
                        continue
                    product = row.get("Product", "").strip()
                    position_raw = row.get("Position", "").strip()

                    # Skip the Total summary row
                    if not position_raw or product.lower() == "total":
                        continue

                    batch.append({
                        "business_date": date_str,
                        "position": int(position_raw),
                        "product": product,
                        "quantity": int(row.get("Quantity", "0") or 0),
                        "quantity_pct": parse_pct(row.get("% of Quantity", "")),
                        "sale_amount": parse_money(row.get("Sale Amount", "")),
                        "sale_pct": parse_pct(row.get("% of Sale", "")),
                        "cost": parse_money(row.get("Cost", "")),
                        "gross_profit_pct": parse_pct(row.get("Gross Profit (%)", "")),
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

        # Flush remaining
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
