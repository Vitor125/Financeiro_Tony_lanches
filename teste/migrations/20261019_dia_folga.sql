CREATE TABLE IF NOT EXISTS configuracao_dia_folga (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dia_folga DATE
);

INSERT INTO configuracao_dia_folga (id, dia_folga)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;
