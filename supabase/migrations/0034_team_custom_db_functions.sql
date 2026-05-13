-- Сессия 45 этапа 2 (пункт 22): динамическое создание пользовательских таблиц.
--
-- Мастер «+ Создать базу» в UI вызывает функцию через rpc(). На вход — имя
-- таблицы (генерируется бэкендом, чтобы Влад не вводил SQL-имена) и массив
-- описаний колонок. PL/pgSQL аккуратно собирает CREATE TABLE.
--
-- SECURITY DEFINER — функция выполняется с правами владельца (postgres),
-- так что service-role клиент Supabase JS может её дёрнуть.

CREATE OR REPLACE FUNCTION public.create_custom_table(
  p_table_name TEXT,
  p_columns JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col JSONB;
  col_name TEXT;
  col_type TEXT;
  pg_type TEXT;
  sql_text TEXT;
BEGIN
  -- Защита от обрушения схемы случайными именами. table_name должен начинаться
  -- с team_custom_ (бэкенд так и формирует имена в createDatabase).
  IF p_table_name IS NULL OR p_table_name !~ '^team_custom_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Имя таблицы должно соответствовать шаблону team_custom_<slug> (только латиница, цифры, подчёркивания).';
  END IF;
  IF jsonb_typeof(p_columns) <> 'array' THEN
    RAISE EXCEPTION 'p_columns должен быть JSON-массивом объектов { name, type }.';
  END IF;

  sql_text := format(
    'CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
    p_table_name
  );

  FOR col IN SELECT * FROM jsonb_array_elements(p_columns)
  LOOP
    col_name := col->>'name';
    col_type := col->>'type';

    IF col_name IS NULL OR col_name = '' THEN
      RAISE EXCEPTION 'У одной из колонок не указано name.';
    END IF;
    -- name должен быть безопасным идентификатором: латиница/цифры/подчёркивания,
    -- не пустой, начинается с буквы. Иначе сломаем %I-цитирование при INSERT.
    IF col_name !~ '^[a-z][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'Имя колонки "%": допустимы только латиница в нижнем регистре, цифры и подчёркивания, начало — буква.', col_name;
    END IF;
    -- Запрещаем перетирать служебные колонки.
    IF col_name IN ('id', 'created_at') THEN
      RAISE EXCEPTION 'Имя колонки "%" зарезервировано.', col_name;
    END IF;

    pg_type := CASE col_type
      WHEN 'text'         THEN 'TEXT'
      WHEN 'long_text'    THEN 'TEXT'
      WHEN 'number'       THEN 'NUMERIC'
      WHEN 'url'          THEN 'TEXT'
      WHEN 'select'       THEN 'TEXT'
      WHEN 'multi_select' THEN 'TEXT[]'
      WHEN 'date'         THEN 'DATE'
      WHEN 'boolean'      THEN 'BOOLEAN DEFAULT FALSE'
      ELSE                     'TEXT'
    END;

    sql_text := sql_text || format(', %I %s', col_name, pg_type);
  END LOOP;

  sql_text := sql_text || ')';
  EXECUTE sql_text;
END;
$$;

COMMENT ON FUNCTION public.create_custom_table IS
  'Создаёт пользовательскую таблицу по JSON-схеме колонок. Вызывается из customDatabaseService.createDatabase через supabase.rpc(). Имя таблицы должно начинаться с team_custom_; имена колонок — только латиница и подчёркивания.';
