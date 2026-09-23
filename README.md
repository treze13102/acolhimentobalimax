# Canal de Acolhimento, Saúde Mental e Riscos Psicossociais

Sistema interno da Balimax Engenharia: formulário público (com anonimato real) + painel
restrito para a equipe de acolhimento, com banco de dados, login e trilha de auditoria.

---

## Como rodar

```bash
npm install
npm run chave                                      # gera a APP_KEY
# copie .env.example para .env.local e preencha
npm run admin -- "Seu Nome" voce@balimax.com.br    # 1º administrador
npm run dev                                        # http://localhost:3100
```

Para publicar (Supabase + Vercel + GitHub), siga o **[DEPLOY.md](DEPLOY.md)**.

---

## Por que este stack

| Decisão | Motivo |
|---|---|
| **Supabase** (Postgres, São Paulo) | Banco gerenciado, backup automático e Auth pronto. Região `sa-east-1` mantém o dado em território nacional, o que simplifica a conversa com o jurídico. |
| **Vercel** (região `gru1`) | Publicação a partir do GitHub, HTTPS e domínio próprio sem servidor para administrar. |
| **Criptografia por campo na aplicação** (AES-256-GCM) | A peça central. O relato é cifrado **antes** de sair daqui: o Supabase guarda base64 sem significado. Vazamento do banco, backup perdido ou acesso de suporte não expõem nada — a `APP_KEY` só existe nas variáveis de ambiente da Vercel. |
| **Supabase Auth** para a equipe | Traz "esqueci minha senha" por e-mail e MFA sem construirmos envio de e-mail. |
| **RLS fechado + service_role só no servidor** | Nenhum cliente fala com o banco. A chave pública (`anon`), mesmo vazada, não lê um único relato. |
| **Uma única dependência** (`@supabase/supabase-js`, só no servidor) | O navegador continua sem biblioteca de terceiros — o painel fala com o Supabase Auth por `fetch`, o que mantém a CSP fechada em `script-src 'self'`. |

**Ressalva honesta:** com Supabase e Vercel, o relato passa a ser processado por
duas empresas estrangeiras (operadoras, na LGPD) — exige contrato e aviso aos
colaboradores. A criptografia na aplicação neutraliza o risco de conteúdo, mas a
Vercel registra o IP de quem acessa nos logs de borda, fora do nosso controle:
nosso banco guarda só hash, porém a promessa de anonimato passa a depender também
da política de logs deles.

---

## Identidade visual

Paleta extraída de <http://balimax.com.br/>:

| Cor | Onde está no site | Uso aqui |
|---|---|---|
| `#064DA2` | barra superior, links | cor primária: botões, abas, destaques |
| `#08438A` | blocos de conteúdo | botão pressionado, hover |
| `#052330` | rodapé | base do tema escuro |
| `#00AFEF` | acento | cor primária **no tema escuro** (clareada para `#33B0F0`) |
| `#FB6106` | botões do site | **somente** prioridade "alta" no painel |

Duas decisões de contraste, ambas intencionais:

- **O laranja não é a cor de ação.** Ele fica perto demais do vermelho de emergência; se
  fosse o botão de enviar, disputaria atenção com o bloco CVV/SAMU, que precisa ser o
  elemento mais chamativo da tela. O azul institucional assume esse papel e o laranja
  passa a significar "prioridade alta" na fila do painel.
- **No tema escuro o azul `#064DA2` some** sobre o fundo petróleo. O acento passa a ser o
  ciano da marca, clareado até alcançar contraste legível.

Todos os pares de cor usados em texto passam no **WCAG AA** (mínimo 4.5:1; os valores
medidos vão de 5.2:1 a 16.4:1). Para alterar a paleta, mexa apenas nos tokens no topo de
`public/css/base.css` — nenhuma cor está escrita direto nos componentes.

O coração amarelo (💛) foi mantido de propósito: é o símbolo do Setembro Amarelo, campanha
de prevenção ao suicídio. Não é escolha estética e não deve ser trocado pela cor da marca.

---

## O que o sistema faz

### Para o colaborador
- Formulário com **anonimato real**: escolhendo anônimo, nome e setor sequer são enviados.
- Ao marcar pensamentos de autolesão ou suicídio, os telefones do **CVV (188)** e do
  **SAMU (192)** aparecem na hora, antes de terminar o preenchimento.
- Recebe um **protocolo** (`BLX-XXXX-XXXX`) e acompanha o andamento em `/protocolo.html`,
  inclusive lendo respostas da equipe — **sem precisar se identificar**.
- Nada do que é digitado fica salvo no navegador (importante em computador compartilhado).

### Para a equipe de acolhimento
- Login pelo Supabase Auth, com "esqueci minha senha" por e-mail e troca obrigatória da senha provisória no primeiro acesso.
- **Prioridade calculada pelo servidor**, não pelo formulário:
  - `crítica` — pensamentos de autolesão/suicídio, ou pedido de acolhimento imediato;
  - `alta` — assédio, violência, discriminação, ou "não tenho certeza";
  - `normal` — demais casos.
- Fila ordenada por prioridade, filtros por status e busca por protocolo.
- Triagem: status, responsável, anotações internas e **respostas visíveis ao autor**.
- Indicadores agregados por motivo — base para o inventário de riscos psicossociais
  (NR-01) e para o PGR, sem expor nenhum relato individual.

### Perfis
| | Acolhimento | Administrador |
|---|---|---|
| Ver e atender registros | sim | sim |
| Indicadores | sim | sim |
| Criar/desativar acessos | não | sim |
| Ver auditoria | não | sim |

---

## Proteções implementadas

- **Criptografia na aplicação** (AES-256-GCM) de relato, nome, setor, pessoa citada,
  telefone, e-mail e anotações. O Supabase recebe e guarda apenas base64. Testado: nenhum
  trecho legível aparece na tabela.
- **RLS ligado sem políticas** em todas as tabelas, mais `revoke` no schema `public`:
  as chaves `anon` e `authenticated` não leem nada. Todo acesso passa por `/api`
  com a `service_role`, que nunca vai ao navegador.
- **Sem CSRF por construção**: o token vai no cabeçalho `Authorization`, não em cookie,
  então outro site não consegue anexá-lo a uma requisição.
- **Desativação imediata**: o servidor confere o perfil a cada requisição e encerra as
  sessões abertas. Não se espera o token expirar.
- **Auditoria**: toda abertura de relato, mudança de status e login fica registrada com
  autor, data e impressão do IP. **O IP em claro nunca é gravado.**
- **A lista do painel não traz o relato** — ler o conteúdo exige abrir o registro, o que
  deixa rastro. Isso desestimula a leitura por curiosidade.
- **CSP** restritiva (`script-src 'self'`), sem script inline e sem biblioteca de
  terceiros no navegador; `X-Frame-Options: DENY`; `noindex` em todas as páginas.
- **Limite de requisições** contado no banco (envios 5/10 min, consultas 20/10 min);
  o Supabase Auth aplica o limite de tentativas de login.
- **Entrada recusada, não corrigida em silêncio**: corpo fora de UTF-8, motivo fora da
  lista ou resposta fora das opções devolvem erro. Perder um "Não tenho certeza" sem
  aviso seria pior do que recusar o envio.
- Corpo limitado a 256 KB; erros nunca devolvem stack trace ao navegador.

---

## Operação

```bash
npm run dev                                        # desenvolvimento local
npm run chave                                      # gera uma APP_KEY
npm run admin -- "Nome" email@balimax.com.br       # cria o 1º administrador
```

Depois do primeiro administrador, tudo é feito pelo painel: criar acesso, redefinir
senha, desativar quem sai.

**Backup.** Automático no Supabase. O conteúdo continua cifrado — guarde a `APP_KEY`
**fora** do Supabase e fora do GitHub. Sem ela o backup é inútil; com ela junto, o
backup é o vazamento inteiro.

**Publicar mudança.** `git push` na branch `main` — a Vercel publica sozinha. Alteração
no banco exige rodar o SQL no Supabase antes do push.

Detalhes de implantação e checklist pós-publicação: **[DEPLOY.md](DEPLOY.md)**.

---

## Estrutura

```
api/index.js           função única que atende todo o /api
api/_lib/config.js     variáveis de ambiente
api/_lib/dados.js      cliente Supabase (service_role), auditoria, limites
api/_lib/auth.js       validação do token e papéis
api/_lib/cripto.js     AES-256-GCM, protocolos, hash de IP
api/_lib/http.js       roteador, leitura de corpo, cabeçalhos de segurança
api/_lib/dominio.js    motivos e regra de prioridade (fonte única)
api/_lib/rotas.js      endpoints públicos e do painel
public/                formulário, consulta por protocolo
public/painel/         painel interno (auth.js fala com o Supabase Auth)
supabase/schema.sql    tabelas, índices, RLS — rodar uma vez
scripts/               gerar chave, criar 1º administrador
dev.js                 servidor local (mesma função da Vercel)
vercel.json            rotas, região gru1, cabeçalhos
```

---

## Pendências para RH e jurídico

Estes pontos são de decisão da empresa, não de código:

1. **Fluxo de apuração para denúncia anônima** que cita uma pessoa (assédio, discriminação).
   Um relato anônimo com nome de terceiro exige rito próprio para ser válido e justo —
   defina quem apura, como a pessoa citada é ouvida e o que é registrado.
2. **Quem entra na equipe de acolhimento.** Idealmente ninguém subordinado às lideranças
   que possam ser objeto de relato. Crie o menor número possível de acessos.
3. **Prazo de guarda dos registros.** A LGPD exige eliminar o dado quando a finalidade se
   encerra. Hoje o sistema não apaga nada automaticamente — defina o prazo e peça a rotina.
4. **Quem é avisado de um registro crítico, e em quanto tempo.** Hoje ele aparece no topo
   da fila e no log do servidor; não há notificação automática por e-mail ou WhatsApp.
   Se quiser, isso pode ser acrescentado.
5. **Informar os colaboradores** sobre o tratamento dos dados (LGPD, art. 9º) e registrar
   o canal na política de saúde e segurança.
