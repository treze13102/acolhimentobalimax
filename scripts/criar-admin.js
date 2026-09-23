/**
 * Cria (ou conserta) um administrador do painel.
 *
 *   npm run admin -- "Seu Nome" voce@balimax.com.br
 *
 * O acesso ao painel exige DUAS coisas:
 *   1. uma conta no Supabase Auth  — diz quem a pessoa é;
 *   2. uma linha em `perfis`       — diz se ela pode entrar e com qual papel.
 *
 * Criar o usuário direto no painel do Supabase faz só a primeira. Este script
 * detecta esse caso e cria apenas o perfil que falta, sem mexer na senha.
 */
import { bd } from '../api/_lib/dados.js';
import { senhaProvisoria } from '../api/_lib/cripto.js';

const [nome, emailBruto] = process.argv.slice(2);

if (!nome || !emailBruto) {
  console.error('\nUso: npm run admin -- "Seu Nome" voce@balimax.com.br\n');
  process.exit(1);
}

const email = emailBruto.toLowerCase().trim();

// A API de admin não busca por e-mail, então varremos as páginas.
async function contaPorEmail(alvo) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await bd.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(error.message);
    const achado = data.users.find((u) => (u.email || '').toLowerCase() === alvo);
    if (achado) return achado;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existente = await contaPorEmail(email);

if (existente) {
  const { data: perfil } = await bd
    .from('perfis')
    .select('id, papel, ativo')
    .eq('id', existente.id)
    .maybeSingle();

  if (perfil) {
    // Já tem tudo: só garante que está ativo e como administrador.
    const { error } = await bd
      .from('perfis')
      .update({ nome, papel: 'admin', ativo: true })
      .eq('id', existente.id);
    if (error) {
      console.error('\n[ERRO] ' + error.message + '\n');
      process.exit(1);
    }
    console.log(
      `\n${email} já tinha acesso. Promovido a administrador e reativado.` +
        '\nA senha não foi alterada.\n'
    );
  } else {
    const { error } = await bd
      .from('perfis')
      .insert({ id: existente.id, nome, email, papel: 'admin', trocar_senha: false });
    if (error) {
      console.error('\n[ERRO] ' + error.message);
      console.error('Verifique se o supabase/schema.sql ja foi aplicado.\n');
      process.exit(1);
    }
    console.log(
      '\n' + '='.repeat(64) +
      '\n A conta ja existia no Supabase Auth, mas sem perfil — por isso o\n' +
      ' painel recusava o acesso. O perfil de administrador foi criado.\n' +
      '='.repeat(64) +
      `\n  E-mail: ${email}` +
      '\n  Senha:  a mesma que voce ja definiu (nao foi alterada)\n' +
      '='.repeat(64) + '\n'
    );
  }
  process.exit(0);
}

// Conta nova: cria no Auth e o perfil junto.
const senha = senhaProvisoria();

const { data, error } = await bd.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
});

if (error) {
  console.error('\n[ERRO] ' + error.message + '\n');
  process.exit(1);
}

const { error: erroPerfil } = await bd
  .from('perfis')
  .insert({ id: data.user.id, nome, email, papel: 'admin' });

if (erroPerfil) {
  await bd.auth.admin.deleteUser(data.user.id);
  console.error('\n[ERRO] ' + erroPerfil.message);
  console.error('Verifique se o supabase/schema.sql ja foi aplicado.\n');
  process.exit(1);
}

console.log(
  '\n' + '='.repeat(60) +
  '\n Administrador criado. Anote — a senha nao sera exibida de novo.\n' +
  '='.repeat(60) +
  `\n  E-mail: ${email}\n  Senha:  ${senha}\n` +
  ' A troca sera exigida no primeiro acesso.\n' +
  '='.repeat(60) + '\n'
);
