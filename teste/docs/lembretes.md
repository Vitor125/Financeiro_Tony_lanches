# Lembretes de lançamentos

Aba **Lembretes**: janela de ontem até sete dias anteriores inclusive, e dias da
semana com lançamento. Hoje nunca é considerado pendente. Fechamento com valores
zero é válido; registro parcial continua pendente. Preferências são da conta
Firebase autenticada, compartilhadas entre os aparelhos dessa conta.

## Consumo e funcionamento

- O GET diário envia `?lembretes=1` e retorna configurações e no máximo sete datas
  na mesma consulta e conexão ao Neon. Clientes antigos continuam compatíveis.
- Trocar filtros ou abrir a aba Lembretes não envia requisições. Salvar preferências
  usa um PUT explícito, sem escrever se os valores forem iguais.
- Salvar, editar, mover e excluir atualiza a lista local a partir da resposta já
  recebida. Falha invalida o snapshot para não inventar ausência de pendências.
- Não há polling, timers de consulta, cache de dados financeiros no service worker
  nem instância mínima para aquecer o app. Outra sessão aparece na próxima leitura.
- `lembretes.py` só importa a biblioteca de envio quando o agendador executa; não
  acrescenta esse carregamento às consultas/login.
- Uma tarefa Cloud Scheduler às 9h America/Sao_Paulo verifica apenas contas
  autorizadas que possuem aparelhos inscritos e lembretes ativos. Até cinco
  aparelhos por conta; no máximo uma repetição após falha, com intervalo de 5 min.
- A entrega é registrada por dia/aparelho, com tag diária também no navegador.
  Como em outros envios HTTP, falha ambígua de rede pode impedir confirmação da
  entrega; não se promete exatamente uma notificação em toda condição de falha.
- Chaves e metadados de inscrições são necessários para entregar push. Notificação
  tem apenas texto genérico, sem valores, datas ou e-mail do financeiro.
- Provedores que retornam 404/410 têm inscrições removidas. Ao sair pelo botão,
  tenta-se remover a inscrição do servidor e do navegador. No encerramento por
  token inválido, remove-se localmente; a próxima entrega limpa inscrições expiradas.

Custo nominal do Scheduler: três jobs gratuitos por conta de faturamento, depois
US$ 0,10 por job/31 dias, conforme https://cloud.google.com/scheduler/pricing.
A franquia é da conta inteira; não foi presumida disponibilidade nem custo zero.
Em operação normal, a tarefa acrescenta uma chamada ao Cloud Run por dia, além
das ações explícitas de configuração/ativação. Outros custos (egresso, build,
Secret Manager e banco) seguem suas próprias regras. Não é garantia de ficar
abaixo da franquia global: isso depende do tráfego e demais serviços da conta.

## Segurança

GET/config/dispositivo exigem Firebase válido, revogação e allowlist existentes.
A conta vem de `g.authenticated_email`, nunca de um e-mail enviado pelo cliente.
`/internal/lembretes/enviar` aceita somente ID token Google válido com audiência
configurada, emissor aceito pelo verificador OAuth2 e e-mail verificado da conta
`tony-lanches-reminders@financeiro-tony-lanches-510422.iam.gserviceaccount.com`.
Essa exceção não se aplica a nenhuma rota financeira.

A chave privada VAPID é o segredo `tony-reminders-vapid`, versão 1, acessível à
conta de execução do backend; não está no código/imagem/Hosting. A chave pública
pode ser publicada. Endpoints de push aceitam somente HTTPS/443 e hosts exatos
Google FCM, Mozilla e Apple. Redirecionamentos não são seguidos. Corpo, chaves,
janela de dias e dias da semana são validados. Inscrições têm proprietário e limite.

## Ativação e limites

Atualizar a interface PWA quando oferecido, abrir **Lembretes**, escolher janela e
dias, salvar e clicar **Ativar neste aparelho**. A permissão só é pedida no clique.
Cada aparelho precisa autorizar. iPhone/iPad precisa de Web Push compatível no app
adicionado à Tela de Início. Navegador, sistema, rede, permissão e TTL influenciam
a entrega; não se promete entrega exatamente às 9h ou em dispositivo offline.

A verificação real do Scheduler com OIDC e banco passou sem inscritos. Criptografia
Web Push exercitada com chaves temporárias e transporte simulado. Não foi efetuada
uma entrega ponta a ponta em aparelho real, pois depende de inscrição/permissão
pelo usuário. Nenhum dado financeiro foi alterado nem houve envio para pessoas
sem opt-in nos testes.

## Manutenção e implantação

`migrations/20261014_lembretes.sql` cria somente duas tabelas novas e um índice.
Aplicada antes da revisão nova; não recria nem migra `faturamento`.
Backend: revisão `financeiro-tony-lanches-00010-foc`, 100% após teste sem tráfego.
Recursos preservados: mínimo 0, máximo serviço 2 (revisão 3), 1 vCPU, 512 MiB,
concorrência 8 e cobrança por requisição. Nenhum aumento de recursos.
Job: `tony-lanches-lembretes-diarios`, southamerica-east1, `0 9 * * *`.
O heartbeat de monitoramento do Codex anteriormente desativado continua pausado.

Rollback: pausar esse job antes de voltar para revisão anterior 00008-gon e
restaurar o frontend do backup `backups/lembretes-20261014/Frontend/`. As tabelas
novas podem permanecer; nenhuma coluna financeira depende delas. A chave VAPID
não deve ser regenerada em atualizações comuns, pois invalidaria inscrições.

Evidências: `verificacao-lembretes-20261014.json`, testes e auditoria de dependências
na mesma pasta. Fonte do frontend em `Frontend/`, cópias sincronizadas em
`static/tony-lanches/` e `integracao/frontend-flask/`.
