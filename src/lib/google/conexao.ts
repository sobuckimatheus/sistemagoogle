import "server-only";

import { criptografar, descriptografar } from "@/lib/crypto";
import { renovarAccessToken } from "@/lib/google/oauth";
import { prisma } from "@/lib/prisma";

/** Renova com folga: token que expira em menos de 5 min é tratado como vencido. */
const FOLGA_MS = 5 * 60 * 1000;

export class ConexaoInvalidaError extends Error {
  constructor(
    message: string,
    readonly status: "EXPIRED" | "REVOKED",
  ) {
    super(message);
    this.name = "ConexaoInvalidaError";
  }
}

/**
 * Devolve um access token válido para a conexão, renovando se necessário.
 *
 * Toda chamada às APIs do Google deve passar por aqui em vez de ler
 * `accessToken` do banco direto — o token dura uma hora.
 */
export async function accessTokenValido(googleConnectionId: string) {
  const conexao = await prisma.googleConnection.findUnique({
    where: { id: googleConnectionId },
  });

  if (!conexao) {
    throw new Error(`Conexão ${googleConnectionId} não encontrada.`);
  }

  if (conexao.status !== "ACTIVE") {
    throw new ConexaoInvalidaError(
      "Conexão com o Google não está ativa.",
      conexao.status,
    );
  }

  const aindaVale =
    conexao.accessToken &&
    conexao.tokenExpiry &&
    conexao.tokenExpiry.getTime() - Date.now() > FOLGA_MS;

  if (aindaVale) {
    return descriptografar(conexao.accessToken!);
  }

  if (!conexao.refreshToken) {
    await marcarInvalida(conexao.id, "EXPIRED");
    throw new ConexaoInvalidaError(
      "Conexão sem refresh token — é preciso reconectar.",
      "EXPIRED",
    );
  }

  try {
    const novos = await renovarAccessToken(
      descriptografar(conexao.refreshToken),
    );

    await prisma.googleConnection.update({
      where: { id: conexao.id },
      data: {
        accessToken: criptografar(novos.accessToken),
        tokenExpiry: novos.expiraEm,
      },
    });

    return novos.accessToken;
  } catch (erro) {
    const revogado = (erro as { revogado?: boolean }).revogado === true;
    const status = revogado ? "REVOKED" : "EXPIRED";
    await marcarInvalida(conexao.id, status);
    throw new ConexaoInvalidaError(
      revogado
        ? "Acesso revogado no Google — é preciso reconectar."
        : "Não foi possível renovar o acesso ao Google.",
      status,
    );
  }
}

async function marcarInvalida(id: string, status: "EXPIRED" | "REVOKED") {
  await prisma.googleConnection.update({ where: { id }, data: { status } });

  // Alerta para a conta perceber que o sync parou, em vez de ver os números
  // congelarem em silêncio.
  const negocios = await prisma.business.findMany({
    where: { googleConnectionId: id },
    select: { id: true },
  });

  if (negocios.length > 0) {
    await prisma.alert.createMany({
      data: negocios.map((n) => ({
        businessId: n.id,
        type: "SYNC_FAILED" as const,
        severity: "CRITICAL" as const,
        message:
          status === "REVOKED"
            ? "Acesso ao Google revogado. Reconecte para retomar a sincronização."
            : "Conexão com o Google expirou. Reconecte para retomar a sincronização.",
      })),
    });
  }
}
