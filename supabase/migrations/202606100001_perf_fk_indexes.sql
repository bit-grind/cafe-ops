-- Covering indexes for foreign keys flagged by the Supabase performance
-- advisor. recipe_ingredients.recipe_id is filtered on every recipe load
-- and save; extracted_line_items.run_id is filtered on every extraction
-- retry/cleanup.

create index if not exists recipe_ingredients_recipe_id_idx
  on public.recipe_ingredients (recipe_id);

create index if not exists extracted_line_items_run_id_idx
  on public.extracted_line_items (run_id);
