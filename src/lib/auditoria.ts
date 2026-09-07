/**
 * Auditoria do perfil: nota 0–100 e checklist acionável.
 *
 * Função pura de propósito — nenhuma chamada de banco ou de API. Isso a torna
 * testável isoladamente e permite recalcular a nota sobre dados históricos sem
 * refazer sync.
 *
 * ## O que a nota mede, e o que ela não mede
 *
 * Os pesos seguem os três fatores que o Google publica para busca local —
 * **relevância**, **distância** e **destaque** — e não uma lista de campos
 * preenchidos. Um perfil 100% preenchido pode ranquear mal, e a auditoria
 * precisa dizer isso em vez de dar nota cheia e calar.
 *
 * **Distância não entra na nota.** É o fator que mais pesa no Maps e o único
 * que o dono não controla: o endereço é o que é. Pontuar distância faria a
 * nota cair por algo que nenhuma ação corrige — e a nota existe para dizer o
 * que fazer. Ela aparece como contexto no diagnóstico, nunca como pontos.
 *
 * Por isso a auditoria separa duas coisas que a versão anterior misturava:
 *
 * - **Preenchimento** — campo vazio ou cheio. Necessário, não suficiente.
 * - **Competitividade** — se o que está preenchido resiste à comparação com
 *   quem já está à frente. É onde a primeira posição se decide.
 *
 * Um campo pode estar preenchido e ainda assim perder pontos: descrição sem o
 * termo que o cliente digita, uma categoria só enquanto o concorrente usa
 * nove, 12 avaliações contra 300 do vizinho.
 *
 * ## Sinais ausentes são declarados, não silenciados
 *
 * Critério cujo dado o sync ainda não traz entra como `indisponivel` e **sai
 * do denominador** — não vira zero. Zerar o que não foi medido produz a
 * mistura mais cara que uma auditoria pode fazer: a mesma nota baixa para
 * quem tem o problema e para quem só não teve o dado coletado. A nota diz
 * então sobre o que ela foi calculada, e a tela mostra o que ficou de fora.
 */

export type EntradaAuditoria = {
  primaryCategory: string | null;
  additionalCategories: string[];
  description: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  /** `null` = o sync ainda não traz o dado; entra como indisponível. */
  temHorarios: boolean | null;
  temServicos: boolean | null;
  totalAvaliacoes: number;
  notaMedia: number | null;
  avaliacoesRespondidas: number;
  postagensUltimos30Dias: number;

  // ── Sinais de competitividade (todos opcionais) ───────────────────────────

  /** Termos que o negócio quer ranquear, para casar com a descrição. */
  termosAlvo?: string[];
  /** Fotos no perfil. `null` = não coletado. */
  totalFotos?: number | null;
  /** Dias desde a foto mais recente. `null` = sem foto ou não coletado. */
  diasDesdeUltimaFoto?: number | null;
  /** Avaliações recebidas nos últimos 90 dias — mede fluxo, não acervo. */
  avaliacoesUltimos90Dias?: number | null;
  /** Retrato dos concorrentes que hoje ocupam as primeiras posições. */
  concorrentes?: {
    totalAvaliacoes: number;
    notaMedia: number | null;
    categorias?: number;
  }[];
};

export type StatusItem = "ok" | "atencao" | "pendente" | "indisponivel";

/** Os três fatores que o Google publica para ranqueamento local. */
export type Fator = "relevancia" | "destaque" | "distancia";

export type ItemChecklist = {
  area: string;
  label: string;
  status: StatusItem;
  peso: number;
  /** Fração do peso conquistada, de 0 a 1. */
  pontuacao: number;
  prioridade: "alta" | "media" | "baixa";
  dica: string;
  fator: Fator;
  /** Preenchido só quando há concorrente para comparar. */
  referencia?: string;
};

/**
 * Pesos por fator. Somam 100 quando todo sinal está disponível.
 *
 * Relevância 46, destaque 54 — destaque pesa mais porque é onde a primeira
 * posição se decide entre perfis que já estão completos. Preencher campo tira
 * o perfil do fim da lista; avaliação e atividade é o que passa na frente de
 * quem também preencheu.
 */
const PESOS = {
  // Relevância — o quanto o perfil casa com o que foi buscado.
  categoriaPrincipal: 12,
  categoriasSecundarias: 8,
  descricaoTermos: 10,
  servicos: 8,
  horarios: 8,
  // Destaque — o quanto o Google considera o negócio conhecido e ativo.
  volumeAvaliacoes: 14,
  notaMedia: 12,
  respostas: 10,
  fluxoAvaliacoes: 8,
  postagens: 6,
  fotos: 4,
  // Base — sem isso o perfil nem entra na disputa.
  endereco: 5,
  telefone: 3,
  site: 2,
} as const;

/** Referências absolutas, usadas quando não há concorrente para comparar. */
const AVALIACOES_MINIMO = 10;
const AVALIACOES_BOM = 50;
/** Uma foto por mês é o mínimo para o perfil não parecer abandonado. */
const FOTOS_BOM = 20;
const DIAS_FOTO_RECENTE = 30;
/** Postar semanalmente: o card de novidade expira em 7 dias. */
const POSTAGENS_MES_BOM = 4;
/** Fluxo saudável — uma avaliação nova por mês, no mínimo. */
const AVALIACOES_90D_BOM = 6;

/** Mediana. Resiste ao concorrente gigante que distorceria uma média. */
function mediana(valores: number[]): number | null {
  const ordenados = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (ordenados.length === 0) return null;
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/** Normaliza para comparar termo com descrição: sem acento, sem caixa. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function auditar(entrada: EntradaAuditoria): {
  score: number;
  itens: ItemChecklist[];
  /** Soma dos pesos efetivamente avaliados — o denominador da nota. */
  pesoAvaliado: number;
  /** Critérios que ficaram de fora por falta de dado. */
  naoAvaliados: string[];
} {
  const itens: ItemChecklist[] = [];

  const add = (
    area: string,
    label: string,
    peso: number,
    pontuacao: number,
    prioridade: ItemChecklist["prioridade"],
    dica: string,
    fator: Fator,
    referencia?: string,
  ) => {
    const status: StatusItem =
      pontuacao >= 1 ? "ok" : pontuacao > 0 ? "atencao" : "pendente";
    itens.push({
      area,
      label,
      status,
      peso,
      pontuacao,
      prioridade,
      dica,
      fator,
      referencia,
    });
  };

  /** Critério sem dado: peso zero, fora do denominador, visível na tela. */
  const indisponivel = (
    area: string,
    label: string,
    dica: string,
    fator: Fator,
  ) => {
    itens.push({
      area,
      label,
      status: "indisponivel",
      peso: 0,
      pontuacao: 0,
      prioridade: "baixa",
      dica,
      fator,
    });
  };

  // ── Referências dos concorrentes ──────────────────────────────────────────
  // A régua da primeira posição é quem já está nela, não um número redondo.
  const rivais = entrada.concorrentes ?? [];
  const refAvaliacoes = mediana(rivais.map((c) => c.totalAvaliacoes));
  const refNota = mediana(
    rivais.map((c) => c.notaMedia).filter((n): n is number => n !== null),
  );
  const refCategorias = mediana(
    rivais.map((c) => c.categorias).filter((n): n is number => n !== undefined),
  );

  // ── Relevância ────────────────────────────────────────────────────────────

  add(
    "Categorias",
    "Categoria principal definida",
    PESOS.categoriaPrincipal,
    entrada.primaryCategory ? 1 : 0,
    "alta",
    "A categoria principal é o filtro que decide em quais buscas você sequer entra na lista. Errada, nenhum outro acerto compensa.",
    "relevancia",
  );

  // Categoria secundária é o item mais subestimado do perfil: cada uma abre
  // uma busca nova. Comparar com o concorrente evita o "tenho uma, está ok".
  const secundarias = entrada.additionalCategories.length;
  const metaSecundarias = Math.max(3, Math.ceil(refCategorias ?? 0));
  add(
    "Categorias",
    `Categorias secundárias (${secundarias})`,
    PESOS.categoriasSecundarias,
    Math.min(1, secundarias / metaSecundarias),
    secundarias === 0 ? "alta" : "media",
    `Cada categoria secundária te coloca em uma busca que hoje você não disputa. O Google permite até 9 — use todas que descrevam o que você realmente faz.`,
    "relevancia",
    refCategorias !== null
      ? `quem está à frente usa ${refCategorias.toFixed(0)}`
      : undefined,
  );

  // Descrição: o que importa é conter o termo buscado, não o comprimento.
  const descricao = entrada.description?.trim() ?? "";
  const termos = entrada.termosAlvo ?? [];
  const descricaoNorm = normalizar(descricao);
  const termosPresentes = termos.filter((t) =>
    descricaoNorm.includes(normalizar(t.trim())),
  ).length;

  if (descricao.length === 0) {
    add(
      "Descrição",
      "Descrição preenchida",
      PESOS.descricaoTermos,
      0,
      "alta",
      "Sem descrição você perde 750 caracteres de contexto que o Google lê para decidir se você casa com a busca.",
      "relevancia",
    );
  } else if (termos.length > 0) {
    add(
      "Descrição",
      `Termos-alvo na descrição (${termosPresentes}/${termos.length})`,
      PESOS.descricaoTermos,
      termosPresentes / termos.length,
      termosPresentes === 0 ? "alta" : "media",
      `A descrição só ajuda no ranqueamento se contiver as palavras que o cliente digita. Faltam: ${termos
        .filter((t) => !descricaoNorm.includes(normalizar(t.trim())))
        .slice(0, 3)
        .join(", ")}.`,
      "relevancia",
    );
  } else {
    // Sem termos cadastrados, o comprimento é o único proxy honesto.
    add(
      "Descrição",
      "Descrição preenchida",
      PESOS.descricaoTermos,
      descricao.length >= 250 ? 0.7 : 0.4,
      "media",
      "Cadastre seus termos-alvo para que a auditoria verifique se a descrição contém as palavras que o cliente busca — é isso que conta, não o tamanho.",
      "relevancia",
    );
  }

  if (entrada.temServicos === null) {
    indisponivel(
      "Serviços",
      "Serviços cadastrados",
      "Ainda não sincronizamos os serviços do seu perfil, então este item não entra na nota.",
      "relevancia",
    );
  } else {
    add(
      "Serviços",
      "Serviços cadastrados",
      PESOS.servicos,
      entrada.temServicos ? 1 : 0,
      "alta",
      "Cada serviço listado é um termo a mais pelo qual o Google pode te encontrar, e aparece direto no seu card.",
      "relevancia",
    );
  }

  if (entrada.temHorarios === null) {
    indisponivel(
      "Horários",
      "Horário de funcionamento",
      "Ainda não sincronizamos os horários do seu perfil, então este item não entra na nota.",
      "relevancia",
    );
  } else {
    add(
      "Horários",
      "Horário de funcionamento",
      PESOS.horarios,
      entrada.temHorarios ? 1 : 0,
      "alta",
      "Sem horário você fica fora das buscas por 'aberto agora' — que é quando o cliente tem intenção de ir agora.",
      "relevancia",
    );
  }

  // ── Destaque ──────────────────────────────────────────────────────────────

  // Volume: a régua é o concorrente. 40 avaliações é muito num bairro e pouco
  // numa avenida — só a comparação local diz qual dos dois é o seu caso.
  const meta = refAvaliacoes !== null && refAvaliacoes > 0
    ? refAvaliacoes
    : AVALIACOES_BOM;
  const volume = Math.min(1, entrada.totalAvaliacoes / meta);
  add(
    "Avaliações",
    `Volume de avaliações (${entrada.totalAvaliacoes})`,
    PESOS.volumeAvaliacoes,
    volume,
    volume < 0.5 ? "alta" : "media",
    refAvaliacoes !== null
      ? `Para disputar a primeira posição você precisa de volume comparável ao de quem já está lá. Faltam cerca de ${Math.max(0, Math.ceil(meta - entrada.totalAvaliacoes))} avaliações.`
      : `Abaixo de ${AVALIACOES_MINIMO} avaliações o perfil transmite pouca confiança; a partir de ${AVALIACOES_BOM} o ganho fica marginal.`,
    "destaque",
    refAvaliacoes !== null
      ? `mediana dos concorrentes: ${refAvaliacoes.toFixed(0)}`
      : undefined,
  );

  const nota = entrada.notaMedia ?? 0;
  add(
    "Avaliações",
    `Nota média (${entrada.notaMedia?.toFixed(1) ?? "sem avaliações"})`,
    PESOS.notaMedia,
    nota >= 4.7 ? 1 : nota >= 4.5 ? 0.85 : nota >= 4 ? 0.6 : nota >= 3 ? 0.25 : 0,
    nota > 0 && nota < 4.3 ? "alta" : "media",
    refNota !== null && nota < refNota
      ? `Sua nota está abaixo da de quem ocupa as primeiras posições. Responder as críticas costuma render revisão da avaliação.`
      : "Abaixo de 4,0 a nota vira objeção de compra, e o cliente compara as estrelas antes de clicar.",
    "destaque",
    refNota !== null ? `mediana dos concorrentes: ${refNota.toFixed(1)}` : undefined,
  );

  const proporcaoRespostas =
    entrada.totalAvaliacoes > 0
      ? entrada.avaliacoesRespondidas / entrada.totalAvaliacoes
      : 1;
  add(
    "Avaliações",
    `Avaliações respondidas (${Math.round(proporcaoRespostas * 100)}%)`,
    PESOS.respostas,
    proporcaoRespostas >= 0.9 ? 1 : proporcaoRespostas,
    proporcaoRespostas < 0.5 ? "alta" : "media",
    "Responder é sinal de atividade para o Google e o Google recomenda explicitamente responder a todas. Também reduz o peso de uma crítica isolada.",
    "destaque",
  );

  // Fluxo: 300 avaliações paradas há dois anos valem menos que 30 chegando
  // toda semana. É recência, e o acervo não mostra.
  if (entrada.avaliacoesUltimos90Dias === null || entrada.avaliacoesUltimos90Dias === undefined) {
    indisponivel(
      "Avaliações",
      "Avaliações recentes (90 dias)",
      "Precisamos de mais histórico sincronizado para medir o fluxo de avaliações novas.",
      "destaque",
    );
  } else {
    const fluxo = Math.min(1, entrada.avaliacoesUltimos90Dias / AVALIACOES_90D_BOM);
    add(
      "Avaliações",
      `Avaliações recentes (${entrada.avaliacoesUltimos90Dias} em 90 dias)`,
      PESOS.fluxoAvaliacoes,
      fluxo,
      fluxo < 0.4 ? "alta" : "media",
      "O Google pondera avaliações recentes mais que antigas. Um acervo grande e parado perde para um fluxo constante.",
      "destaque",
    );
  }

  // Postagens: coletadas desde sempre e nunca pontuadas até aqui.
  const postagens = entrada.postagensUltimos30Dias;
  add(
    "Postagens",
    `Postagens em 30 dias (${postagens})`,
    PESOS.postagens,
    Math.min(1, postagens / POSTAGENS_MES_BOM),
    postagens === 0 ? "alta" : "baixa",
    "O card de novidade expira em 7 dias — postar semanalmente mantém o perfil sempre com conteúdo novo e sinaliza atividade.",
    "destaque",
  );

  if (entrada.totalFotos === null || entrada.totalFotos === undefined) {
    indisponivel(
      "Fotos",
      "Fotos do perfil",
      "Ainda não sincronizamos as fotos do seu perfil, então este item não entra na nota.",
      "destaque",
    );
  } else {
    const cobertura = Math.min(1, entrada.totalFotos / FOTOS_BOM);
    const recente =
      entrada.diasDesdeUltimaFoto !== null &&
      entrada.diasDesdeUltimaFoto !== undefined &&
      entrada.diasDesdeUltimaFoto <= DIAS_FOTO_RECENTE;
    add(
      "Fotos",
      `Fotos do perfil (${entrada.totalFotos})`,
      PESOS.fotos,
      cobertura * (recente ? 1 : 0.6),
      entrada.totalFotos === 0 ? "alta" : "baixa",
      "Perfis com fotos recebem mais pedidos de rota e cliques. Foto nova também conta como atividade.",
      "destaque",
    );
  }

  // ── Base ──────────────────────────────────────────────────────────────────

  add(
    "Endereço",
    "Endereço completo",
    PESOS.endereco,
    entrada.addressLine1 && entrada.city ? 1 : 0,
    "alta",
    "Endereço incompleto prejudica o ranqueamento local e quebra a rota no Maps.",
    "relevancia",
  );

  add(
    "Contato",
    "Telefone cadastrado",
    PESOS.telefone,
    entrada.phone ? 1 : 0,
    "media",
    "Sem telefone você perde a métrica de ligações — a ação mais valiosa do perfil.",
    "relevancia",
  );

  add(
    "Contato",
    "Site cadastrado",
    PESOS.site,
    entrada.website ? 1 : 0,
    "baixa",
    "O clique no site é uma das três ações que o Google mede.",
    "relevancia",
  );

  // Só o que foi efetivamente medido entra no denominador.
  const avaliados = itens.filter((i) => i.status !== "indisponivel");
  const pesoAvaliado = avaliados.reduce((s, i) => s + i.peso, 0);
  const conquistado = avaliados.reduce((s, i) => s + i.peso * i.pontuacao, 0);
  const score =
    pesoAvaliado > 0 ? Math.round((conquistado / pesoAvaliado) * 100) : 0;

  return {
    score,
    itens,
    pesoAvaliado,
    naoAvaliados: itens
      .filter((i) => i.status === "indisponivel")
      .map((i) => i.label),
  };
}

/**
 * Itens que ainda rendem pontos, do mais valioso para o menos.
 *
 * É o que alimenta o bloco "Principais motivos" e a "Maior oportunidade
 * agora" no dashboard: ordenar por peso perdido responde direto à pergunta
 * "o que fazer primeiro".
 *
 * Indisponíveis ficam de fora — não há ação do usuário que os resolva.
 */
export function oportunidades(itens: ItemChecklist[]): ItemChecklist[] {
  return itens
    .filter((i) => i.status !== "indisponivel" && i.pontuacao < 1)
    .sort((a, b) => b.peso * (1 - b.pontuacao) - a.peso * (1 - a.pontuacao));
}

/**
 * Nota por fator, para a tela mostrar onde o perfil perde.
 *
 * Duas notas 70 contam histórias diferentes: uma que perde tudo em relevância
 * precisa mexer no perfil; uma que perde em destaque precisa de avaliações e
 * atividade — meses de trabalho, não uma tarde.
 */
export function notaPorFator(
  itens: ItemChecklist[],
): { fator: Fator; score: number; peso: number }[] {
  const fatores: Fator[] = ["relevancia", "destaque"];
  return fatores.map((fator) => {
    const doFator = itens.filter(
      (i) => i.fator === fator && i.status !== "indisponivel",
    );
    const peso = doFator.reduce((s, i) => s + i.peso, 0);
    const conquistado = doFator.reduce((s, i) => s + i.peso * i.pontuacao, 0);
    return {
      fator,
      score: peso > 0 ? Math.round((conquistado / peso) * 100) : 0,
      peso,
    };
  });
}
