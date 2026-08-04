-- ─────────────────────────────────────────────────────────────────────────────
-- 999 — Verificacao do estado do banco
--
-- Cole no SQL Editor do Supabase e rode. Retorna um checklist com o que era
-- esperado e o que existe de fato.
--
-- Se der erro 'relation "plans" does not exist', o 001_init.sql nao foi
-- aplicado (ou foi aplicado em outro schema que nao o public).
-- ─────────────────────────────────────────────────────────────────────────────

WITH c AS (
  SELECT
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations')                               AS tabelas,
    (SELECT count(*) FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e')                          AS enums,
    (SELECT count(*) FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY')       AS fks,
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public')              AS indices,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'id'
        AND column_default LIKE '%gen_random_uuid%')                           AS id_defaults,
    (SELECT count(*) FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND trigger_name LIKE '%set_updated_at') AS triggers_updated,
    (SELECT count(*) FROM public.plans)                                        AS planos,
    (SELECT count(*) FROM public.segment_benchmarks)                           AS benchmarks,
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations')     AS historico_prisma
)
SELECT item, esperado, encontrado,
       CASE WHEN encontrado = esperado THEN 'OK' ELSE 'DIVERGENTE' END AS status,
       origem
FROM (
  SELECT 1 AS ord, 'Tabelas'                    AS item, 21 AS esperado, tabelas          AS encontrado, '001_init.sql'     AS origem FROM c
  UNION ALL SELECT 2, 'Enums',                        11, enums,            '001_init.sql'     FROM c
  UNION ALL SELECT 3, 'Foreign keys',                 21, fks,              '001_init.sql'     FROM c
  UNION ALL SELECT 4, 'Indices (25 + 21 PK)',         46, indices,          '001_init.sql'     FROM c
  UNION ALL SELECT 5, 'Defaults de id (uuid)',        20, id_defaults,      '002_defaults.sql' FROM c
  UNION ALL SELECT 6, 'Triggers de updatedAt',         6, triggers_updated, '002_defaults.sql' FROM c
  UNION ALL SELECT 7, 'Planos',                        3, planos,           '003_seed.sql'     FROM c
  UNION ALL SELECT 8, 'Benchmarks de segmento',       12, benchmarks,       '003_seed.sql'     FROM c
  UNION ALL SELECT 9, 'Historico de migrations',       1, historico_prisma, 'prisma baseline'  FROM c
) x
ORDER BY ord;
