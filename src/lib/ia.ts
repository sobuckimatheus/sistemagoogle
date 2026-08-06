import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env/server";

/**
 * Geração de texto com Claude.
 *
 * Quatro usos no produto: rascunho de resposta a avaliação, recomendação de
 * auditoria, sugestão de palavras-chave e texto de postagem.
 *
 * Todo texto gerado aqui é rascunho — nada é publicado sem o usuário revisar.
 * Resposta a avaliação vai para o perfil público do cliente, e errar o tom
 * custa mais caro do que o tempo de revisar.
 */

const MODELO = "claude-opus-5";

export class IaIndisponivelError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY não configurada.");
    this.name = "IaIndisponivelError";
  }
}

function cliente() {
  if (!serverEnv.ANTHROPIC_API_KEY) throw new IaIndisponivelError();
  return new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
}

function textoDa(resposta: Anthropic.Message): string {
  return resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export type ContextoAvaliacao = {
  nomeDoNegocio: string;
  categoria: string | null;
  autor: string | null;
  estrelas: number | null;
  comentario: string | null;
  tomDeVoz: string | null;
};

export async function rascunhoDeResposta(
  ctx: ContextoAvaliacao,
): Promise<string> {
  const resposta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 1000,
    system: [
      "Você escreve respostas a avaliações no Google Meu Negócio, em português do Brasil.",
      "",
      "Regras:",
      "- Escreva como o dono do negócio, na primeira pessoa do plural.",
      "- Entre 2 e 4 frases. Respostas longas passam a impressão de justificativa.",
      "- Cite algo específico do comentário do cliente; resposta genérica é pior que nenhuma.",
      "- Em avaliação negativa: reconheça o problema sem discutir os fatos em público,",
      "  e ofereça continuar a conversa por um canal privado.",
      "- Nunca prometa reembolso, desconto ou compensação — isso é decisão do negócio.",
      "- Não invente fatos sobre o atendimento que você não tem como saber.",
      "- Devolva apenas o texto da resposta, sem aspas nem comentários.",
      ctx.tomDeVoz ? `\nTom de voz do negócio: ${ctx.tomDeVoz}` : "",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Negócio: ${ctx.nomeDoNegocio}`,
          ctx.categoria ? `Categoria: ${ctx.categoria}` : "",
          `Nota: ${ctx.estrelas ?? "não informada"} de 5`,
          `Cliente: ${ctx.autor ?? "anônimo"}`,
          `Comentário: ${ctx.comentario ?? "(sem texto, apenas a nota)"}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return textoDa(resposta);
}

export async function sugerirPalavrasChave(
  categoria: string,
  cidade: string,
  quantidade = 8,
): Promise<string[]> {
  const resposta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 1000,
    system: [
      "Você sugere termos de busca que pessoas realmente digitam no Google Maps",
      "para encontrar um negócio local, em português do Brasil.",
      "",
      "- Termos curtos, do jeito que o cliente digita, não do jeito que o setor fala.",
      "- Misture termos com e sem a cidade.",
      "- Nada de marca própria do negócio: queremos busca por necessidade.",
      "- Devolva um termo por linha, sem numeração, sem explicação.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Categoria: ${categoria}\nCidade: ${cidade}\nQuantidade: ${quantidade}`,
      },
    ],
  });

  return textoDa(resposta)
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, quantidade);
}

export async function textoDePostagem(
  nomeDoNegocio: string,
  categoria: string | null,
  assunto: string,
  tomDeVoz: string | null,
): Promise<string> {
  const resposta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 1000,
    system: [
      "Você escreve postagens para o Perfil de Empresa no Google, em português do Brasil.",
      "",
      "- Entre 150 e 300 caracteres: o Google corta o restante na exibição.",
      "- Uma ideia por post, com chamada para ação clara no fim.",
      "- Sem hashtag: não funcionam no Google Posts.",
      "- Devolva apenas o texto do post.",
      tomDeVoz ? `\nTom de voz do negócio: ${tomDeVoz}` : "",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Negócio: ${nomeDoNegocio}`,
          categoria ? `Categoria: ${categoria}` : "",
          `Assunto: ${assunto}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return textoDa(resposta);
}
