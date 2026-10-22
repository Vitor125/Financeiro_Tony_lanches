# Estrutura do projeto

Este documento explica a organização do repositório sem alterar os caminhos usados pela aplicação, pelos workflows do GitHub Actions ou pelos scripts de publicação.

## Repositório publicado no GitHub

```text
Financeiro_Tony_lanches/
├── .github/workflows/            # Preview e publicação manual do Firebase Hosting
├── Frontend/                     # Versão anterior mantida no histórico
├── teste/                        # Aplicação ativa e diretório de execução existente
├── .gitignore                    # Segredos locais e arquivos gerados
└── README.md                     # Entrada do repositório
```

O workspace local `ideia/` contém um checkout Git independente em `Financeiro_Tony_lanches/`, ao lado dos arquivos de trabalho. Essa pasta não deve ser copiada como repositório aninhado para o GitHub; o destino publicado é o próprio conteúdo do checkout.

## Aplicação em `teste/`

```text
teste/
├── autenticacao.py, database_config.py, calculo.py, faturamento.py, lembretes.py
├── Frontend/                     # Fonte publicada pelo Firebase Hosting
├── static/tony-lanches/          # Cópia servida pelo Flask em /static/tony-lanches/
├── integracao/frontend-flask/    # Pacote fonte do instalador do frontend
├── tests/                        # Testes Python e JavaScript
├── migrations/                   # Migrações SQL versionadas e aditivas
├── docs/                         # Arquitetura, operação, evidências e histórico
├── backups/                      # Cópias de segurança locais, ignoradas pelo Git
├── publicar-atualizacao.ps1      # Valida e publica Cloud Run e Hosting
├── deploy-cloud-run.ps1          # Fluxo operacional de deploy do Cloud Run
├── Dockerfile                    # Imagem da API para Cloud Run
├── requirements.txt              # Dependências Python
└── contexto_ideia.md             # Histórico e estado do produto
```

### Frontend e sincronização

- Edite `Frontend/` para a versão destinada ao Hosting. O workflow de Hosting aponta diretamente para essa pasta.
- `static/tony-lanches/` é a cópia que o Flask entrega localmente. Ela não é atualizada automaticamente ao editar `Frontend/`.
- `integracao/frontend-flask/` contém a origem do instalador `aplicar-front.ps1`. Executá-lo substitui `Frontend/` e `static/tony-lanches/` pelo conteúdo desse pacote e cria backup dos arquivos substituídos.
- Ao alterar a interface, confira as três cópias. Antes de executar o instalador, confira se o pacote contém a versão que deseja aplicar.

As pastas repetidas são cópias operacionais, não módulos independentes. Não renomeie nem mova sem atualizar e validar os caminhos em `publicar-atualizacao.ps1`, nos workflows, nos testes e na documentação.

### Configuração e arquivos locais

- `.env` contém a conexão local e nunca deve ser versionado; `.env.example` é o modelo sem credenciais.
- `.venv/`, `__pycache__/`, `.ruff_cache/`, `.firebase/` e `Frontend-backups/` são locais/gerados e ficam fora do controle de versão.
- `docs/` conserva evidências datadas junto da documentação que lhes dá contexto. Os caminhos são citados pelo histórico, portanto devem permanecer estáveis.
- `tests/` mantém ao lado dos testes os fixtures SQL referenciados por caminho relativo.

## Estado de publicação documentado

O contexto registra publicação de backend e Hosting em 22/10/2026, depois de aplicar a migration da folga semanal. Esse registro é histórico do projeto; não equivale a uma nova verificação de produção nesta organização.
