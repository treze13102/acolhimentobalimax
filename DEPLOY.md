# Implantação — Supabase + Vercel + GitHub

Ordem importa. Cada passo diz o que **você** faz e o que fica pronto depois.

---

## 1. Supabase

1. Crie o projeto em <https://supabase.com/dashboard> — **região São Paulo (sa-east-1)**.
2. Guarde a senha do banco no cofre de senhas.
3. Abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   e execute. Isso cria as tabelas, os índices e **fecha o RLS**.
4. Em **Project Settings › API**, copie:
   - `Project URL`
   - `anon public`
   - `service_role` — **segredo**: lê e escreve tudo, ignorando RLS.

### Autenticação (Authentication › Providers / URL Configuration)
- Deixe **apenas Email** habilitado. Desligue "Enable email signups"
  (*Authentication › Sign In / Providers › Email › Allow new users to sign up*):
  ninguém deve criar a própria conta — só o administrador cria acessos.
- **Site URL**: `https://canal.balimax.com.br`
- **Redirect URLs**: adicione `https://canal.balimax.com.br/painel/nova-senha.html`
  (e `http://localhost:3100/painel/nova-senha.html` para testar localmente).
- Em *Email Templates › Reset Password*, o link padrão já funciona.

---

## 2. Rodar local (antes de subir)

```bash
npm install
npm run chave          # gera a APP_KEY
```

Copie `.env.example` para `.env.local` e preencha as quatro variáveis.

```bash
npm run admin -- "Seu Nome" voce@balimax.com.br   # cria o 1º administrador
npm run dev                                        # http://localhost:3100
```

---

## 3. GitHub

```bash
git init
git add .
git commit -m "Canal de acolhimento: formulário público e painel de triagem"
git branch -M main
git remote add origin https://github.com/<usuario>/canal-acolhimento.git
git push -u origin main
```

O repositório é **público**. Confira antes do push:

```bash
git status --porcelain --ignored | grep -E "\.env"
```

Os `.env` precisam aparecer como **ignorados**. Se uma chave for para o histórico,
não basta apagar no commit seguinte — é preciso rotacionar a chave no Supabase e
gerar uma nova `APP_KEY`.

---

## 4. Vercel

1. <https://vercel.com/new> › importe o repositório.
2. Framework Preset: **Other**. Build Command: vazio. Output Directory: `public`.
3. **Environment Variables** — as mesmas quatro do `.env.local`, em
   Production, Preview e Development:

   | Variável | Origem |
   |---|---|
   | `SUPABASE_URL` | Supabase › Settings › API |
   | `SUPABASE_ANON_KEY` | idem |
   | `SUPABASE_SERVICE_ROLE_KEY` | idem — **segredo** |
   | `APP_KEY` | `npm run chave` — a **mesma** do `.env.local`, senão os relatos já gravados ficam ilegíveis |

4. Deploy.

### Domínio
Em *Settings › Domains*, adicione `canal.balimax.com.br`. A Vercel mostra o
registro DNS; crie no provedor do balimax.com.br:

```
CNAME   canal   cname.vercel-dns.com
```

Propaga em minutos e o certificado HTTPS sai sozinho. Depois, volte ao Supabase
e confirme que Site URL e Redirect URLs apontam para o domínio final.

---

## 5. Conferir depois de publicar

- [ ] `https://canal.balimax.com.br` abre o formulário
- [ ] Enviar um teste devolve protocolo; consultar o protocolo mostra o status
- [ ] Marcar um motivo crítico faz aparecer CVV 188 / SAMU 192 na hora
- [ ] `/painel/` pede login; senha errada não diz se o e-mail existe
- [ ] Primeiro acesso exige troca de senha
- [ ] "Esqueci minha senha" chega por e-mail e a redefinição funciona
- [ ] Um usuário de acolhimento **não** vê a aba Auditoria
- [ ] No Supabase › Table Editor, a coluna `relato` mostra só base64
- [ ] Apagar o registro de teste (Table Editor) antes de divulgar o canal

---

## Operação

**Backup.** O Supabase faz backup diário automático. O arquivo continua cifrado:
guarde a `APP_KEY` **fora** do Supabase e fora do GitHub — sem ela o backup é inútil,
com ela junto o backup é o vazamento inteiro.

**Novos acessos.** Painel › Equipe › Adicionar. A senha provisória aparece uma vez;
entregue pessoalmente. A pessoa é obrigada a trocá-la no primeiro acesso.

**Saída de alguém.** Painel › Equipe › Desativar. Corta o acesso na hora — o
servidor confere o perfil a cada requisição e encerra as sessões abertas.

**Limites do plano gratuito.** Vercel Hobby é para uso não comercial; para uso
corporativo, o plano Pro é o correto. O Supabase Free pausa projetos sem acesso
por 7 dias — para um canal que pode ficar semanas sem uso, o plano pago evita
que ele esteja fora do ar justamente quando alguém precisar.

---

## O que mudou em relação à versão local

| Antes | Agora |
|---|---|
| SQLite em arquivo | Postgres no Supabase (São Paulo) |
| Login próprio (scrypt) | Supabase Auth — com "esqueci minha senha" por e-mail |
| Sessão em cookie + token anti-CSRF | JWT em cabeçalho `Authorization` (sem cookie, sem CSRF) |
| Limite de envios em memória | Contador no banco (`consumir_limite`) — obrigatório sem servidor fixo |
| `npm start` no servidor da Balimax | Funções da Vercel, região `gru1` |
| Zero dependências | Uma: `@supabase/supabase-js`, só no servidor |

**O que não mudou:** a criptografia dos relatos continua na aplicação, com a
`APP_KEY`. O Supabase armazena apenas base64 sem significado. Essa é a peça que
mantém o relato privado mesmo com o dado agora hospedado fora da Balimax.
