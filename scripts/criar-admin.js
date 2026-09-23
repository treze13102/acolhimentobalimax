/**
 * Cria o primeiro administrador no Supabase Auth e o perfil correspondente.
 * Rode uma única vez, depois de aplicar o supabase/schema.sql.
 *
 *   npm run admin -- "Seu Nome" voce@balimax.com.br
 *
 * A senha é gerada aqui e mostrada uma única vez. Troque-a no primeiro acesso.
 */
import { bd } from '../api/_lib/dados.js';
import { senhaProvisoria } from '../api/_lib/cripto.js';

const [nome, email] = process.argv.slice(2);

if (!nome || !email) {
  console.error('\nUso: npm run admin -- "Seu Nome" voce@balimax.com.br\n');
  process.exit(1);
}

const senha = senhaProvisoria();

const { data, error } = await bd.auth.admin.createUser({
  email: email.toLowerCase(),
  password: senha,
  email_confirm: true,
});

if (error) {
  console.error('\n[ERRO] ' + error.message + '\n');
  process.exit(1);
}

const { error: erroPerfil } = await bd.from('perfis').insert({
  id: data.user.id,
  nome,
  email: email.toLowerCase(),
  papel: 'admin',
});

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
  `\n  E-mail: ${email.toLowerCase()}\n  Senha:  ${senha}\n` +
  '='.repeat(60) + '\n'
);
