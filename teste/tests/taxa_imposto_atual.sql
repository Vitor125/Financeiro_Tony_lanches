-- Uma taxa atual para todo o sistema. Nenhum valor inicial é gravado.
CREATE TABLE IF NOT EXISTS configuracao_imposto (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    taxa_imposto_atual NUMERIC NOT NULL CHECK (
        taxa_imposto_atual >= 0
        AND taxa_imposto_atual NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC)
    )
);
