import Link from "next/link";

import { Icone } from "@/components/lumora/icones";
import { Cartao, Rotulo } from "@/components/lumora/primitivos";

/**
 * Orientação para quem ainda não tem dados.
 *
 * Ocupa o lugar dos cartões do dashboard em vez de mostrá-los zerados. Um
 * painel cheio de "R$ 0" e "0,0%" não é honesto nem útil: parece desempenho
 * ruim onde na verdade não há medição, e esconde a única coisa que a pessoa
 * precisa fazer agora.
 *
 * Os passos são numerados porque são mesmo uma sequência — cada um só fica
 * possível depois do anterior.
 */
export function PrimeirosPassos({
  etapa,
  linkDosLocais,
}: {
  /** 1 = falta autorizar o Google. 2 = autorizado, falta escolher locais. */
  etapa: 1 | 2;
  linkDosLocais: string | null;
}) {
  const passos = [
    {
      titulo: "Autorize sua conta Google",
      texto:
        "Use a conta que administra o Perfil de Empresa. Se você é agência, o caminho com menos atrito é o cliente adicionar seu e-mail como gerente no perfil dele.",
      acao: { rotulo: "Conectar com o Google", href: "/conectar" },
    },
    {
      titulo: "Escolha os locais para acompanhar",
      texto:
        "Uma conta Google pode administrar vários perfis. Marque quais entram no painel — cada local vira um dashboard próprio.",
      acao: linkDosLocais
        ? { rotulo: "Escolher locais", href: linkDosLocais }
        : { rotulo: "Escolher locais", href: "/conectar" },
    },
    {
      titulo: "Aguarde a primeira sincronização",
      texto:
        "O Google entrega o histórico de desempenho depois da autorização. Os números aparecem aqui assim que o primeiro sync terminar — você não precisa fazer nada nesta etapa.",
      acao: null,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">
          Dashboard
        </h1>
        <p className="text-sm text-texto-suave">
          Faltam alguns minutos para seus números aparecerem aqui
        </p>
      </header>

      <Cartao className="flex flex-col gap-5 p-6 lg:p-8">
        <Rotulo>Primeiros passos</Rotulo>
        <p className="max-w-[22ch] font-serif text-[34px] leading-[1.15] text-texto">
          Conecte o Google para{" "}
          <span className="whitespace-nowrap text-ouro">ver seus números</span>.
        </p>
        <p className="max-w-[62ch] text-sm leading-relaxed text-texto-suave">
          O painel lê visualizações, ligações, rotas, avaliações e posição no
          mapa direto do seu Perfil de Empresa. Enquanto essa ligação não
          existe, não há o que medir — e mostrar cartões zerados seria inventar
          um diagnóstico.
        </p>
      </Cartao>

      <ol className="grid gap-4 lg:grid-cols-3">
        {passos.map((passo, i) => {
          const numero = i + 1;
          const concluido = numero < etapa;
          const atual = numero === etapa;

          return (
            <li key={passo.titulo}>
              <Cartao
                className={`flex h-full flex-col gap-3 p-5 ${
                  atual ? "border-ouro/40 bg-ouro-fundo/25" : ""
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`numero flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      concluido
                        ? "bg-alta/15 text-alta"
                        : atual
                          ? "bg-ouro text-fundo"
                          : "bg-superficie-alta text-texto-fraco"
                    }`}
                  >
                    {concluido ? "✓" : numero}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      atual ? "text-texto" : "text-texto-suave"
                    }`}
                  >
                    {passo.titulo}
                  </span>
                </span>

                <p className="text-sm leading-relaxed text-texto-suave">
                  {passo.texto}
                </p>

                {passo.acao && atual && (
                  <Link
                    href={passo.acao.href}
                    className="mt-auto flex w-fit items-center gap-2 rounded-lg bg-ouro px-4 py-2.5 text-sm font-medium text-fundo transition-colors hover:bg-ouro-claro"
                  >
                    {passo.acao.rotulo}
                    <Icone nome="seta" className="size-4" />
                  </Link>
                )}

                {concluido && (
                  <p className="mt-auto text-xs font-medium text-alta">
                    Concluído
                  </p>
                )}
              </Cartao>
            </li>
          );
        })}
      </ol>

      <p className="text-xs leading-relaxed text-texto-fraco">
        A leitura de desempenho depende da aprovação das Business Profile APIs
        pelo Google para esta aplicação. Avaliações, auditoria do perfil e
        posição no mapa funcionam antes disso.
      </p>
    </main>
  );
}
