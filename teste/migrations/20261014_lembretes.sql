-- Tabelas novas; não altera nem preenche registros financeiros.
BEGIN;
CREATE TABLE IF NOT EXISTS lembretes_config (
    email TEXT PRIMARY KEY,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    dias SMALLINT NOT NULL DEFAULT 1 CHECK (dias BETWEEN 1 AND 7),
    semana SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::SMALLINT[],
    CHECK (cardinality(semana) BETWEEN 1 AND 7 AND semana <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[])
);
CREATE TABLE IF NOT EXISTS lembretes_dispositivos (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription JSONB NOT NULL,
    ultimo_envio DATE
);
CREATE INDEX IF NOT EXISTS lembretes_dispositivos_email_idx ON lembretes_dispositivos(email);
COMMIT;
