DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.column_default LIKE 'nextval%'
      AND c.data_type IN ('integer','bigint','smallint')
  LOOP
    EXECUTE format('SELECT max(%I)::bigint FROM %I', r.column_name, r.table_name) INTO n;
    IF n IS NULL THEN
      PERFORM setval(pg_get_serial_sequence(r.table_name, r.column_name), 1, false);
      RAISE NOTICE '%.%  空表 -> 1', r.table_name, r.column_name;
    ELSE
      PERFORM setval(pg_get_serial_sequence(r.table_name, r.column_name), n);
      RAISE NOTICE '%.%  max=%  -> 下一个 %', r.table_name, r.column_name, n, n+1;
    END IF;
  END LOOP;
END $$;
