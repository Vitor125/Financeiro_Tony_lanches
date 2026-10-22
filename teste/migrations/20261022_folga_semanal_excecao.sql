-- Mantém a configuração singleton anterior e converte a antiga data isolada
-- em uma exceção adicional antes de ativar a folga semanal fixa.
ALTER TABLE configuracao_dia_folga
    ADD COLUMN IF NOT EXISTS dia_semana SMALLINT,
    ADD COLUMN IF NOT EXISTS dia_excecao DATE,
    ADD COLUMN IF NOT EXISTS tipo_excecao TEXT;

UPDATE configuracao_dia_folga
SET dia_excecao = dia_folga,
    tipo_excecao = 'adicional'
WHERE dia_folga IS NOT NULL AND dia_excecao IS NULL;

-- Mantém a coluna antiga até a nova revisão receber tráfego; ela será limpa
-- depois da confirmação de backend e Hosting, para preservar a versão ativa.

-- A segunda-feira foi escolhida como configuração semanal inicial.
UPDATE configuracao_dia_folga
SET dia_semana = 1
WHERE id = 1 AND dia_semana IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'configuracao_dia_folga'::regclass
          AND conname = 'configuracao_dia_folga_dia_semana_check'
    ) THEN
        ALTER TABLE configuracao_dia_folga
            ADD CONSTRAINT configuracao_dia_folga_dia_semana_check
            CHECK (dia_semana IS NULL OR dia_semana BETWEEN 1 AND 7);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'configuracao_dia_folga'::regclass
          AND conname = 'configuracao_dia_folga_excecao_check'
    ) THEN
        ALTER TABLE configuracao_dia_folga
            ADD CONSTRAINT configuracao_dia_folga_excecao_check
            CHECK (
                (dia_excecao IS NULL AND tipo_excecao IS NULL)
                OR (
                    dia_excecao IS NOT NULL
                    AND tipo_excecao IS NOT NULL
                    AND tipo_excecao IN ('adicional', 'substituir')
                )
            );
    END IF;
END $$;
