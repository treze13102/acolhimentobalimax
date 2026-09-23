/** Fonte unica dos motivos: o formulario publico e o painel leem daqui. */
export const MOTIVOS = [
  'Preciso de apoio ou acolhimento',
  'Estresse relacionado ao trabalho',
  'Ansiedade ou preocupação excessiva',
  'Depressão ou sintomas relacionados à depressão',
  'Sofrimento emocional',
  'Dificuldade para lidar com situações do trabalho',
  'Sobrecarga ou excesso de pressão',
  'Conflito no ambiente de trabalho',
  'Assédio moral ou constrangimento',
  'Assédio sexual',
  'Discriminação ou tratamento inadequado',
  'Problemas com liderança ou equipe',
  'Falta de apoio ou comunicação',
  'Organização, ritmo ou jornada de trabalho',
  'Violência, ameaça ou intimidação',
  'Pensamentos de me machucar',
  'Pensamentos relacionados a tirar minha própria vida',
  'Estou preocupado(a) com a saúde emocional de um colega',
  'Outro',
];

/** Motivos que disparam prioridade critica e atendimento imediato. */
export const MOTIVOS_CRITICOS = new Set([
  'Pensamentos de me machucar',
  'Pensamentos relacionados a tirar minha própria vida',
]);

/** Motivos que exigem rito proprio de apuracao (assedio, violencia, discriminacao). */
export const MOTIVOS_GRAVES = new Set([
  'Assédio sexual',
  'Assédio moral ou constrangimento',
  'Violência, ameaça ou intimidação',
  'Discriminação ou tratamento inadequado',
]);

export const STATUS = ['novo', 'em_acolhimento', 'encaminhado', 'concluido'];
export const PRIORIDADES = ['critica', 'alta', 'normal'];

export const ROTULOS_STATUS = {
  novo: 'Novo',
  em_acolhimento: 'Em acolhimento',
  encaminhado: 'Encaminhado',
  concluido: 'Concluído',
};

/** A prioridade e calculada pelo servidor, nunca enviada pelo formulario. */
export function calcularPrioridade(motivos, imediato) {
  if (motivos.some((m) => MOTIVOS_CRITICOS.has(m))) return 'critica';
  if (imediato === 'Sim') return 'critica';
  if (motivos.some((m) => MOTIVOS_GRAVES.has(m))) return 'alta';
  if (imediato === 'Não tenho certeza') return 'alta';
  return 'normal';
}
