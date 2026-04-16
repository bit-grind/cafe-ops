# Lightspeed Agent — Setup Guide

## What this does

Adds a `lightspeed` agent to your `home-network-mcp` server with 5 MCP tools:

| Tool | Tier | Description |
|------|------|-------------|
| `lightspeed_get_sync_status` | T1 (read) | Check when data was last synced to Supabase |
| `lightspeed_import_csv` | T2 (config) | Import a CSV/ZIP file from disk into Supabase |
| `lightspeed_import_csv_content` | T2 (config) | Import raw CSV text directly (no file needed) |
| `lightspeed_download_report` | T2 (config) | Browser automation to download from Lightspeed portal |
| `lightspeed_sync_daily` | T2 (config) | Full pipeline: download + import for a date |

## Installation on m75q

### 1. Copy files into your existing repo

```bash
# From your home-network-mcp repo on m75q:
cp lightspeed_agent.py   mcp-server/src/agents/
cp lightspeed_client.py  mcp-server/src/integrations/
```

### 2. Register the agent

Edit `mcp-server/src/agents/__init__.py` and add:

```python
from .lightspeed_agent import LightspeedAgent
```

Then in your agent registry (wherever agents are auto-discovered or registered),
add the Lightspeed agent:

```python
from ..integrations.lightspeed_client import LightspeedClient

lightspeed_client = LightspeedClient()
lightspeed_agent = LightspeedAgent(lightspeed_client)
```

### 3. Add Playwright to requirements

```bash
echo "playwright>=1.49.0" >> requirements.txt
```

### 4. Update Dockerfile

Add Playwright browser install after pip install:

```dockerfile
RUN playwright install chromium
```

And add the Playwright system dependencies (see the Dockerfile in this directory
for the full apt-get list).

### 5. Set environment variables

Add to your `.env` or `docker-compose.yml`:

```env
# Supabase (you likely already have these)
SUPABASE_URL=https://pzhqjdpbeyfndeckkhlu.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>

# Lightspeed portal (for browser automation)
LIGHTSPEED_URL=https://your-site.lightspeedhq.com
LIGHTSPEED_USER=your-email@example.com
LIGHTSPEED_PASS=your-password
```

### 6. Rebuild and deploy

```bash
docker compose build
docker compose up -d
```

## Usage

### Right now (without browser automation)

Even before configuring the Lightspeed portal selectors, you can use:

**Via Claude:** "Check my sales sync status"
  - Calls `lightspeed_get_sync_status` — tells you the latest date in Supabase

**Via Claude:** "Import this CSV into Supabase" (with a file path)
  - Calls `lightspeed_import_csv` — imports CSV/ZIP files

**Via Claude:** (paste CSV content) "Import this sales data for 2026-04-08"
  - Calls `lightspeed_import_csv_content` — imports raw CSV text directly

### After configuring browser automation

**Via Claude:** "Sync yesterday's sales from Lightspeed"
  - Calls `lightspeed_sync_daily` — logs into Lightspeed, downloads CSVs, imports to Supabase

## Configuring browser automation (the TODO)

The `lightspeed_client.py` file has `download_report()` with placeholder selectors
marked with `# TODO`. To fill these in:

1. Show Claude (or screenshot) the Lightspeed portal pages you navigate through
2. The CSS selectors for login fields, report navigation, date pickers, and export buttons
   need to match your specific Lightspeed version

This is the only part that requires manual configuration — everything else works out of the box.
