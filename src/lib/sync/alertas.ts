import "server-only";

import { enviarEmail } from "@/lib/email";
import { clientEnv } from "@/lib/env/client";
import { prisma } from "@/lib/prisma";

/**
 * Geração de alertas a partir da comparação entre o estado atual e o
 * anterior.
 *
 * Roda depois do sync, quando o banco já tem os dados novos. A referência de
 * "anterior" é `lastSyncedAt` — o que estava lá antes desta execução.
 *
 * Todo alerta é idempotente: rodar o sync duas vezes no mesmo dia não gera
 * duplicata. Alerta repetido é ruído, e ruído faz o usuário parar de olhar.
 */

/** Queda de nota média a partir da qual vale avisar. */
const QUEDA_RELEVANTE = 0.2;
/** Dias sem post publicado para considerar o perfil parado. */
const DIAS_SEM_ATIVIDADE = 30;
/** Janela para não repetir o mesmo alerta de inatividade. */
const DIAS_ENTRE_AVISOS = 7;

export type AlertasGerados = {
  novas: number;
  negativas: number;
  quedaDeNota: boolean;
  inatividade: boolean;
};

/**
 * Alerta de sync que falhou.
 *
 * Separado de `gerarAlertas` porque a origem é outra: aqui não há comparação
 * de estado, há um job que não conseguiu rodar. Vale CRITICAL — enquanto o
 * sync não volta, todo número da tela envelhece em silêncio, e silêncio é
 * pior do que erro visível.
 *
 * Deduplicado por 24h: um job que falha em toda execução horária não pode
 * encher a central de alertas com a mesma linha.
 */
export async function alertaDeSyncFalho(
  businessId: string,
  motivo: string,
): Promise<boolean> {
  const jaAvisou = await prisma.alert.findFirst({
    where: {
      businessId,
      type: "SYNC_FAILED",
      createdAt: { gt: new Date(Date.now() - 86400000) },
    },
  });

  if (jaAvisou) return false;

  const alerta = await prisma.alert.create({
    data: {
      businessId,
      type: "SYNC_FAILED",
      severity: "CRITICAL",
      message: `A sincronização com o Google falhou: ${motivo}. Os dados da tela estão desatualizados até isso ser resolvido.`,
      metaJson: { motivo },
    },
  });

  await notificarAlertaCritico(alerta.id);

  return true;
}

/**
 * E-mail de alerta crítico (E8-08).
 *
 * Destinatários: os OWNER da conta dona do negócio, exceto quem desligou a
 * preferência. MEMBER não recebe por padrão — quem responde por sync quebrado
 * é quem administra a conta.
 *
 * Sai uma vez por alerta porque a chamada acontece no momento da criação, e a
 * criação já é deduplicada. Falha de envio não propaga: o alerta continua na
 * central, que é a fonte de verdade.
 */
export async function notificarAlertaCritico(alertId: string): Promise<number> {
  const alerta = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { business: { select: { id: true, title: true, accountId: true } } },
  });

  if (!alerta || alerta.severity !== "CRITICAL") return 0;

  const donos = await prisma.accountMember.findMany({
    where: { accountId: alerta.business.accountId, role: "OWNER" },
    include: {
      user: {
        select: { email: true, notificationPrefs: true },
      },
    },
  });

  const destinatarios = donos
    .filter((d) => d.user.notificationPrefs[0]?.emailOnCriticalAlert !== false)
    .map((d) => d.user.email);

  if (destinatarios.length === 0) return 0;

  const envio = await enviarEmail({
    para: destinatarios,
    assunto: `[Painel GBP] Alerta crítico em ${alerta.business.title}`,
    texto: [
      alerta.message,
      "",
      `Negócio: ${alerta.business.title}`,
      `Abra: ${clientEnv.NEXT_PUBLIC_APP_URL}/negocio/${alerta.business.id}/alertas`,
      "",
      "Para não receber mais estes e-mails, ajuste em Configurações da conta → Notificações.",
    ].join("\n"),
  });

  return envio.enviado ? destinatarios.length : 0;
}

export async function gerarAlertas(
  businessId: string,
  referencia: Date | null,
): Promise<AlertasGerados> {
  const resultado: AlertasGerados = {
    novas: 0,
    negativas: 0,
    quedaDeNota: false,
    inatividade: false,
  };

  // Sem referência é o primeiro sync: tudo seria "novo" e o usuário receberia
  // uma avalanche de alertas sobre avaliações antigas.
  if (!referencia) return resultado;

  const novas = await prisma.review.findMany({
    where: {
      businessId,
      createTime: { gt: referencia },
    },
    select: { id: true, starRating: true, reviewerName: true },
  });

  for (const avaliacao of novas) {
    const negativa = avaliacao.starRating !== null && avaliacao.starRating <= 3;

    const jaExiste = await prisma.alert.findFirst({
      where: {
        businessId,
        type: negativa ? "LOW_RATING_REVIEW" : "NEW_REVIEW",
        metaJson: { equals: { reviewId: avaliacao.id } },
      },
    });
    if (jaExiste) continue;

    await prisma.alert.create({
      data: {
        businessId,
        type: negativa ? "LOW_RATING_REVIEW" : "NEW_REVIEW",
        severity: negativa ? "WARNING" : "INFO",
        message: negativa
          ? `Avaliação de ${avaliacao.starRating} estrela(s) de ${
              avaliacao.reviewerName ?? "cliente"
            }. Responder rápido reduz o peso dela.`
          : `Nova avaliação de ${avaliacao.reviewerName ?? "cliente"}${
              avaliacao.starRating ? ` (${avaliacao.starRating} estrelas)` : ""
            }.`,
        metaJson: { reviewId: avaliacao.id },
      },
    });

    if (negativa) resultado.negativas++;
    else resultado.novas++;
  }

  // ── Queda de nota média ───────────────────────────────────────────────────
  // Compara a média de hoje com a média que existiria sem as avaliações
  // chegadas depois da referência.
  const [agora, antes] = await Promise.all([
    prisma.review.aggregate({
      where: { businessId },
      _avg: { starRating: true },
      _count: true,
    }),
    prisma.review.aggregate({
      where: { businessId, createTime: { lte: referencia } },
      _avg: { starRating: true },
      _count: true,
    }),
  ]);

  if (
    agora._avg.starRating !== null &&
    antes._avg.starRating !== null &&
    antes._count > 0 &&
    antes._avg.starRating - agora._avg.starRating >= QUEDA_RELEVANTE
  ) {
    const jaAvisou = await prisma.alert.findFirst({
      where: {
        businessId,
        type: "RATING_DROP",
        createdAt: { gt: new Date(Date.now() - DIAS_ENTRE_AVISOS * 86400000) },
      },
    });

    if (!jaAvisou) {
      await prisma.alert.create({
        data: {
          businessId,
          type: "RATING_DROP",
          severity: "WARNING",
          message: `Nota média caiu de ${antes._avg.starRating.toFixed(
            1,
          )} para ${agora._avg.starRating.toFixed(1)}.`,
          metaJson: {
            de: antes._avg.starRating,
            para: agora._avg.starRating,
          },
        },
      });
      resultado.quedaDeNota = true;
    }
  }

  // ── Inatividade ───────────────────────────────────────────────────────────
  const limite = new Date(Date.now() - DIAS_SEM_ATIVIDADE * 86400000);

  const postsRecentes = await prisma.post.count({
    where: { businessId, state: "PUBLISHED", publishedAt: { gte: limite } },
  });

  if (postsRecentes === 0) {
    const jaAvisou = await prisma.alert.findFirst({
      where: {
        businessId,
        type: "NO_ACTIVITY",
        createdAt: { gt: new Date(Date.now() - DIAS_ENTRE_AVISOS * 86400000) },
      },
    });

    if (!jaAvisou) {
      await prisma.alert.create({
        data: {
          businessId,
          type: "NO_ACTIVITY",
          severity: "INFO",
          message: `Sem postagem publicada há mais de ${DIAS_SEM_ATIVIDADE} dias. Frequência de postagem conta para o ranqueamento.`,
        },
      });
      resultado.inatividade = true;
    }
  }

  return resultado;
}
