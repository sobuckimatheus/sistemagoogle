import { NextResponse } from "next/server";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { criarState, urlDeAutorizacao } from "@/lib/google/oauth";

export const runtime = "nodejs";

/** Inicia o OAuth: assina o state com a conta e manda para o consent screen. */
export async function GET() {
  const { conta } = await exigirContaAtiva();

  try {
    return NextResponse.redirect(urlDeAutorizacao(criarState(conta.id)));
  } catch (erro) {
    const mensagem =
      erro instanceof Error ? erro.message : "Erro ao iniciar a conexão.";
    return NextResponse.redirect(
      new URL(
        `/conectar?erro=${encodeURIComponent(mensagem)}`,
        process.env.NEXT_PUBLIC_APP_URL,
      ),
    );
  }
}
