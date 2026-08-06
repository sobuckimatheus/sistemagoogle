import { NextResponse, type NextRequest } from "next/server";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { criptografar } from "@/lib/crypto";
import { trocarCodePorTokens, validarState } from "@/lib/google/oauth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Retorno do consent screen do Google.
 *
 * Grava a GoogleConnection com os tokens criptografados e manda o usuário
 * escolher quais locais rastrear.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const { user, conta } = await exigirContaAtiva();

  const erroGoogle = searchParams.get("error");
  if (erroGoogle) {
    // access_denied = usuário clicou em cancelar no consent screen.
    const mensagem =
      erroGoogle === "access_denied"
        ? "Sem a autorização não é possível ler métricas nem responder avaliações."
        : `O Google recusou a autorização: ${erroGoogle}`;
    return NextResponse.redirect(
      `${origin}/conectar?erro=${encodeURIComponent(mensagem)}`,
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/conectar?erro=${encodeURIComponent("Retorno inválido do Google.")}`,
    );
  }

  const stateValido = validarState(state);
  if (!stateValido || stateValido.accountId !== conta.id) {
    return NextResponse.redirect(
      `${origin}/conectar?erro=${encodeURIComponent(
        "Verificação de segurança falhou. Tente conectar novamente.",
      )}`,
    );
  }

  try {
    const tokens = await trocarCodePorTokens(code);

    // Sem refresh token o acesso morre em uma hora e o sync diário nunca
    // funciona. Melhor recusar agora do que descobrir depois.
    if (!tokens.refreshToken) {
      return NextResponse.redirect(
        `${origin}/conectar?erro=${encodeURIComponent(
          "O Google não devolveu credencial de longa duração. " +
            "Remova o acesso do app na sua Conta Google e conecte de novo.",
        )}`,
      );
    }

    const conexao = await prisma.googleConnection.create({
      data: {
        accountId: conta.id,
        connectedByUserId: user.id,
        accessToken: criptografar(tokens.accessToken),
        refreshToken: criptografar(tokens.refreshToken),
        tokenExpiry: tokens.expiraEm,
        scopes: tokens.escopos,
        status: "ACTIVE",
      },
    });

    return NextResponse.redirect(`${origin}/conectar/locais?conexao=${conexao.id}`);
  } catch (erro) {
    const mensagem =
      erro instanceof Error ? erro.message : "Falha ao concluir a conexão.";
    return NextResponse.redirect(
      `${origin}/conectar?erro=${encodeURIComponent(mensagem)}`,
    );
  }
}
