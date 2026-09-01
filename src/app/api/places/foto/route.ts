import { NextResponse, type NextRequest } from "next/server";

import { fotoDoLugar } from "@/lib/google/places";

export const runtime = "nodejs";

/**
 * Repassa a foto do perfil vinda da Places API.
 *
 * Existe por dois motivos:
 *
 * 1. A chave da API não pode ir para o navegador — ela é cobrada por uso e
 *    ficaria visível no `src` da imagem.
 * 2. Cada requisição de foto é cobrada. O cache longo da resposta evita pagar
 *    de novo a cada render da mesma tela.
 */
const FORMATO_DO_NOME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(request: NextRequest) {
  const nome = request.nextUrl.searchParams.get("nome") ?? "";

  // Sem esta validação o parâmetro viraria um proxy para qualquer URL do
  // domínio do Google — o clássico SSRF por concatenação de caminho.
  if (!FORMATO_DO_NOME.test(nome)) {
    return NextResponse.json({ erro: "nome de foto inválido" }, { status: 400 });
  }

  const resposta = await fotoDoLugar(nome);

  if (!resposta.ok || !resposta.body) {
    return NextResponse.json({ erro: "foto indisponível" }, { status: 404 });
  }

  return new NextResponse(resposta.body, {
    headers: {
      "content-type": resposta.headers.get("content-type") ?? "image/jpeg",
      // A foto de um perfil praticamente não muda; pagar de novo por ela a
      // cada visita seria desperdício.
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
