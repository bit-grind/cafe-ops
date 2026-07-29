-- sales_by_hour: store NULL, not 0, for metrics Kounta cannot give us per hour.
--
-- Kounta's `salesummarybyhour` export carries exactly ONE measure and it is
-- hard-wired to Sale Amount. Probed against the live report 2026-07-29: no
-- sibling by-hour report slug exists, the export ignores the measure as a query
-- param under every plausible spelling, POSTing the form fields returns 400,
-- and the page's own measure selector only re-renders a client-side chart (it
-- fires no server request, and exporting straight after still yields Sale
-- Amount). Full detail in kounta-sync/hourMapping.mjs.
--
-- So order_count, aov, tax and net_sales were being written as 0 on every row —
-- indistinguishable from a real zero, and an invitation to plot or divide by a
-- fabricated figure. They become nullable and are backfilled to NULL.
--
-- Safe to backfill unconditionally: every row ever written came from the pivot
-- branch, so none of these four columns has ever held a real value. Verified
-- before writing this migration — 0 non-zero order_count, 0 non-zero aov, 0
-- non-zero tax and 0 rows where net_sales <> gross_sales, across all 1320 rows
-- spanning 2026-06-05..2026-07-29.
--
-- gross_sales stays NOT NULL: it is real, and it still sums to the day's gross.

alter table public.sales_by_hour
  alter column net_sales   drop not null,
  alter column net_sales   drop default,
  alter column tax         drop not null,
  alter column tax         drop default,
  alter column order_count drop not null,
  alter column order_count drop default,
  alter column aov         drop not null,
  alter column aov         drop default;

update public.sales_by_hour
   set net_sales   = null,
       tax         = null,
       order_count = null,
       aov         = null;

comment on column public.sales_by_hour.gross_sales is
  'Real. Kounta salesummarybyhour "Sale Amount" (inc tax); sums to the day gross.';
comment on column public.sales_by_hour.net_sales is
  'Always NULL — not available per hour from Kounta. Day-level net lives in sales_business_day.';
comment on column public.sales_by_hour.tax is
  'Always NULL — not available per hour from Kounta. Day-level tax lives in sales_business_day.';
comment on column public.sales_by_hour.order_count is
  'Always NULL — not available per hour from Kounta. Day-level count lives in sales_business_day.order_count.';
comment on column public.sales_by_hour.aov is
  'Always NULL — needs a per-hour order count, which Kounta does not expose.';
