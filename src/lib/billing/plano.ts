import type { SubscriptionStatus } from "@prisma/client";

/**
 * Regras de acesso por status da assinatura (E9-05).
 *
 * Puro de propósito — sem Prisma, sem Stripe — porque é a regra que decide o
 * que o cliente pagante consegue fazer, e ela precisa ser testável sem banco.
 *
 * Princípio: **inadimplência não apaga dado**. PAST_DUE e CANCELED continuam
 * com leitura completa do histórico; o que trava é o que gasta dinheiro novo
 * (conectar mais negócio, criar palavra-chave, disparar geração de IA) e o que
 * escreve no perfil público do cliente. Apagar ou esconder histórico de quem
 * atrasou um boleto transforma um problema de cobrança em perda de confiança.
 */

export type Recursos = {
  /** Ler dashboards, histórico, relatórios. */
  leitura: boolean;
  /** Conectar negócio, criar palavra-chave, gerar texto por IA, publicar. */
  escrita: boolean;
  /** Sincronização automática continua rodando para a conta. */
  sync: boolean;
};

export function recursosDoStatus(status: SubscriptionStatus): Recursos {
  switch (status) {
    case "ACTIVE":
    case "TRIALING":
      return { leitura: true, escrita: true, sync: true };

    // Cobrança falhou mas o Stripe ainda está tentando: o cliente segue
    // sincronizando, porque perder dias de série histórica por causa de um
    // cartão vencido é dano permanente — o Google não entrega retroativo além
    // da janela dele.
    case "PAST_DUE":
      return { leitura: true, escrita: false, sync: true };

    case "CANCELED":
      return { leitura: true, escrita: false, sync: false };
  }
}

/** Mensagem única para todo bloqueio de escrita, para não divergir por tela. */
export function motivoDoBloqueio(status: SubscriptionStatus): string | null {
  switch (status) {
    case "PAST_DUE":
      return (
        "O pagamento da assinatura falhou. Seus dados continuam aqui e o " +
        "acompanhamento segue rodando, mas criar e publicar fica bloqueado até " +
        "a cobrança ser regularizada."
      );
    case "CANCELED":
      return (
        "A assinatura está cancelada. O histórico continua acessível, mas " +
        "novas ações e a sincronização automática ficam suspensas até a " +
        "reativação."
      );
    default:
      return null;
  }
}

/**
 * Traduz o status do Stripe para o do nosso schema.
 *
 * O Stripe tem mais estados do que o produto precisa distinguir. `unpaid` e
 * `incomplete_expired` viram CANCELED porque, do ponto de vista do acesso, é o
 * que são: cobrança que não vai mais acontecer. `incomplete` é o checkout que
 * ainda não terminou — tratar como TRIALING evitaria bloquear alguém no meio
 * do pagamento.
 */
export function statusDoStripe(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
    case "incomplete":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "CANCELED";
    default:
      // Estado novo do Stripe: não presumir acesso. PAST_DUE mantém leitura e
      // sync, então erra para o lado que não destrói dado.
      return "PAST_DUE";
  }
}
