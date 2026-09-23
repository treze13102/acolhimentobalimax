import { randomBytes } from 'node:crypto';

console.log(
  '\nCopie a linha abaixo para o seu arquivo .env:\n\n' +
    `APP_KEY=${randomBytes(32).toString('base64')}\n\n` +
    'Guarde uma cópia em local seguro (cofre de senhas).\n' +
    'Sem esta chave os relatos ja gravados nao podem ser lidos — nem por voce.\n'
);
