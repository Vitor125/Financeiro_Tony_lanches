# Tony Lanches

Dashboard financeiro para registrar o faturamento e as despesas diárias, acompanhar imposto e lucro e consultar períodos. A aplicação principal está em [`teste/`](./teste/); o nome da pasta foi mantido porque scripts, workflows e caminhos de desenvolvimento dependem dele.

## Começar

- Leia [`teste/README.md`](./teste/README.md) para execução local, testes e atualização.
- Consulte [`teste/contexto_ideia.md`](./teste/contexto_ideia.md) para decisões e histórico do projeto. A seção mais recente descreve o estado registrado em 22/10/2026.
- Veja [`teste/docs/estrutura-projeto.md`](./teste/docs/estrutura-projeto.md) para o mapa das pastas e a função de cada cópia do frontend.
- As instruções de Firebase Authentication, Neon, Secret Manager, Cloud Run e Hosting estão em [`teste/docs/deploy-cloud-run.md`](./teste/docs/deploy-cloud-run.md).

## Componentes

- API: Flask e PostgreSQL, em `teste/`.
- Interface de Hosting: `teste/Frontend/`.
- Cópia estática servida pelo Flask: `teste/static/tony-lanches/`.
- Pacote de integração do frontend: `teste/integracao/frontend-flask/`.
- Testes e migrações: `teste/tests/` e `teste/migrations/`.

O `Frontend/` na raiz do repositório GitHub é a versão antiga mantida no histórico; a aplicação ativa e seus workflows usam `teste/Frontend/`.

As cópias do frontend atendem a destinos diferentes e precisam permanecer sincronizadas conforme o procedimento documentado. Os READMEs e o contexto distinguem mudanças locais, validações e publicações.
