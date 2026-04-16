"""
Lightspeed Agent - Provides MCP tools for Lightspeed POS data sync
and sales data import into Supabase.
"""

import asyncio
import logging
from typing import List

from ..domain.models import ToolDefinition, ToolResult, ToolTier
from ..integrations.lightspeed_client import LightspeedClient

logger = logging.getLogger(__name__)


class LightspeedAgent:
    """Agent for Lightspeed POS data operations"""

    def __init__(self, client: LightspeedClient):
        self.client = client
        self.name = "lightspeed"

    def get_tool_definitions(self) -> List[ToolDefinition]:
        """Return all tool definitions for this agent"""
        return [
            # ── Read-Only Tools (Tier 1) ──────────────────────────
            ToolDefinition(
                name="lightspeed_get_sync_status",
                description=(
                    "Check when sales data was last synced to Supabase. "
                    "Shows the latest date for both daily summary and product-level data, "
                    "and whether the data is up to date."
                ),
                tier=ToolTier.READ_ONLY,
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            # ── Configuration Tools (Tier 2) ──────────────────────
            ToolDefinition(
                name="lightspeed_import_csv",
                description=(
                    "Import a sales CSV or ZIP file from disk into Supabase. "
                    "Supports both daily sales summary and product-level sales CSVs."
                ),
                tier=ToolTier.CONFIGURATION,
                input_schema={
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the CSV or ZIP file to import",
                        },
                        "report_type": {
                            "type": "string",
                            "description": "Type of report: 'summary' for daily totals, 'product' for product-level sales",
                            "enum": ["summary", "product"],
                            "default": "summary",
                        },
                    },
                    "required": ["file_path"],
                },
            ),
            ToolDefinition(
                name="lightspeed_import_csv_content",
                description=(
                    "Import raw CSV text content directly into Supabase (no file needed). "
                    "Useful when CSV data is available as a string."
                ),
                tier=ToolTier.CONFIGURATION,
                input_schema={
                    "type": "object",
                    "properties": {
                        "csv_content": {
                            "type": "string",
                            "description": "Raw CSV content as a string",
                        },
                        "report_type": {
                            "type": "string",
                            "description": "Type of report: 'summary' or 'product'",
                            "enum": ["summary", "product"],
                        },
                        "business_date": {
                            "type": "string",
                            "description": "Business date (YYYY-MM-DD). Required for product reports.",
                        },
                    },
                    "required": ["csv_content", "report_type"],
                },
            ),
            ToolDefinition(
                name="lightspeed_download_report",
                description=(
                    "Use browser automation to log into Lightspeed and download a report CSV. "
                    "Requires LIGHTSPEED_URL, LIGHTSPEED_USER, LIGHTSPEED_PASS env vars. "
                    "NOTE: Browser selectors must be configured for your Lightspeed portal."
                ),
                tier=ToolTier.CONFIGURATION,
                input_schema={
                    "type": "object",
                    "properties": {
                        "report_type": {
                            "type": "string",
                            "description": "Type of report to download",
                            "enum": ["summary", "product"],
                        },
                        "date_from": {
                            "type": "string",
                            "description": "Start date (YYYY-MM-DD)",
                        },
                        "date_to": {
                            "type": "string",
                            "description": "End date (YYYY-MM-DD)",
                        },
                    },
                    "required": ["report_type", "date_from", "date_to"],
                },
            ),
            ToolDefinition(
                name="lightspeed_sync_daily",
                description=(
                    "Full pipeline: download yesterday's (or a specific date's) reports "
                    "from Lightspeed and import them into Supabase. "
                    "Combines download + import in one step."
                ),
                tier=ToolTier.CONFIGURATION,
                input_schema={
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date to sync (YYYY-MM-DD). Defaults to yesterday.",
                        },
                    },
                    "required": [],
                },
            ),
        ]

    async def execute_tool(self, tool_name: str, arguments: dict) -> ToolResult:
        """Execute a tool by name with given arguments"""
        try:
            if tool_name == "lightspeed_get_sync_status":
                result = self.client.get_sync_status()
                return ToolResult(success=True, data=result)

            elif tool_name == "lightspeed_import_csv":
                result = self.client.import_file(
                    file_path=arguments["file_path"],
                    report_type=arguments.get("report_type", "summary"),
                )
                return ToolResult(success=result["status"] == "ok", data=result)

            elif tool_name == "lightspeed_import_csv_content":
                report_type = arguments["report_type"]
                csv_content = arguments["csv_content"]

                if report_type == "product":
                    business_date = arguments.get("business_date")
                    if not business_date:
                        return ToolResult(success=False, data={"error": "business_date required for product reports"})
                    result = self.client.import_product_sales_csv(csv_content, business_date)
                else:
                    result = self.client.import_sales_summary_csv(csv_content)

                return ToolResult(success=result["status"] == "ok", data=result)

            elif tool_name == "lightspeed_download_report":
                result = await self.client.download_report(
                    report_type=arguments["report_type"],
                    date_from=arguments["date_from"],
                    date_to=arguments["date_to"],
                )
                return ToolResult(success=result["status"] == "ok", data=result)

            elif tool_name == "lightspeed_sync_daily":
                result = await self.client.sync_daily(date=arguments.get("date"))
                return ToolResult(success=True, data=result)

            else:
                return ToolResult(success=False, data={"error": f"Unknown tool: {tool_name}"})

        except Exception as e:
            logger.exception(f"Error executing {tool_name}")
            return ToolResult(success=False, data={"error": str(e)})
