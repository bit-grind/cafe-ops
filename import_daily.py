import csv
import json
import os
import sys
import urllib.request

ENDPOINT = "https://cafe-ops.vercel.app/api/import-daily"
IMPORT_SECRET = os.environ["IMPORT_SECRET"]

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_daily.py <csv_file>")
        sys.exit(1)

    csv_path = sys.argv[1]
    rows = []

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            # CSV columns:
            # saledate, salecount, saleamount, saleexamount, saletaxamount, averageamount
            rows.append({
                "business_date": r["saledate"],
                "gross_sales": float(r["saleamount"] or 0),
                "net_sales": float(r["saleexamount"] or 0),
                "tax": float(r["saletaxamount"] or 0),
                "discounts": 0,
                "refunds": 0,
                "order_count": int(float(r["salecount"] or 0)),
                "aov": float(r["averageamount"] or 0),
            })

    data = json.dumps(rows).encode("utf-8")

    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-import-secret": IMPORT_SECRET,
        },
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        print(body)

if __name__ == "__main__":
    main()
