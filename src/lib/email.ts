import "server-only";

import { serverEnv } from "@/lib/env/server";
import { fetchComRetry } from "@/lib/http";

/**
 * Envio de e-mail transacional (Resend).
 *
 * Dois usos: convite de membro e alerta crítico. Nenhum dos dois pode
 * derrubar a operação que os originou — convite gravado no banco vale mesmo
 * sem o e-mail sair (o link pode ser copiado da tela), e alerta existe na
 * central independentemente da notificação. Por isso o retorno é um resultado,
 * não uma exceção.
 *
 * Sem `RESEND_API_KEY` o envio é ignorado com aviso no log. É deliberado: o
 * app roda em desenvolvimento sem provedor de e-mail configurado.
 */

const ENDPOINT = "https://api.resend.com/emails";

// O `||` cobre o build com SKIP_ENV_VALIDATION=1, onde o default do Zod não
// chega a ser aplicado porque o schema não roda.
const REMETENTE = serverEnv.EMAIL_FROM || "Painel GBP <onboarding@resend.dev>";

export type ResultadoEnvio =
  | { enviado: true }
  | { enviado: false; motivo: string };

export async function enviarEmail(params: {
  para: string | string[];
  assunto: string;
  texto: string;
}): Promise<ResultadoEnvio> {
  if (!serverEnv.RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY não configurada; e-mail "${params.assunto}" não foi enviado.`,
    );
    return { enviado: false, motivo: "provedor de e-mail não configurado" };
  }

  try {
    const resposta = await fetchComRetry(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: REMETENTE,
          to: Array.isArray(params.para) ? params.para : [params.para],
          subject: params.assunto,
          text: params.texto,
        }),
      },
      { api: "Resend" },
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      console.error(`[email] Resend ${resposta.status}: ${detalhe.slice(0, 300)}`);
      return { enviado: false, motivo: `Resend respondeu ${resposta.status}` };
    }

    return { enviado: true };
  } catch (erro) {
    console.error(`[email] falha ao enviar: ${(erro as Error).message}`);
    return { enviado: false, motivo: (erro as Error).message };
  }
}
