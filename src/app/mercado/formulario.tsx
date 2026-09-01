"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";

import { analisarPosicao, type EstadoAnalise } from "./acoes";

type Sugestao = { placeId: string; principal: string; secundario: string | null };

type Negocio = {
  placeId: string;
  nome: string;
  endereco: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  categoria: string | null;
  lat: number | null;
  lng: number | null;
  foto: string | null;
};

/**
 * Pausa entre a última tecla e a consulta.
 *
 * Cada consulta custa. 350ms é o intervalo em que uma pessoa digitando
 * normalmente ainda não parou de pensar no nome — abaixo disso, paga-se por
 * consultas que ninguém chegou a ler.
 */
const ESPERA_MS = 350;

export function FormularioMercado() {
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  const listaId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Token de sessão do autocomplete.
   *
   * O Google cobra as sugestões e o detalhamento como um evento só quando
   * compartilham este token. Ele é trocado a cada negócio escolhido, porque
   * uma sessão termina quando a escolha acontece.
   */
  const sessaoRef = useRef<string>(crypto.randomUUID());

  const [estado, acao, analisando] = useActionState<
    EstadoAnalise | null,
    FormData
  >(analisarPosicao, null);

  // Fecha a lista ao clicar fora — sem isso ela fica sobreposta ao resultado.
  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, []);

  useEffect(() => {
    const consulta = texto.trim();

    if (negocio || consulta.length < 3) {
      setSugestoes([]);
      return;
    }

    // `AbortController` porque a resposta de uma digitação anterior pode
    // chegar depois da atual e sobrescrever a lista com dado velho.
    const controle = new AbortController();
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      setErroBusca(null);
      try {
        const resposta = await fetch(
          `/api/places/sugestoes?q=${encodeURIComponent(consulta)}&sessao=${sessaoRef.current}`,
          { signal: controle.signal },
        );
        const dados = await resposta.json();

        if (!resposta.ok) {
          setErroBusca(dados.erro ?? "Não consegui buscar agora.");
          setSugestoes([]);
        } else {
          setSugestoes(dados.sugestoes ?? []);
          setAberto(true);
        }
      } catch (erro) {
        if ((erro as Error).name !== "AbortError") {
          setErroBusca("Não consegui buscar agora.");
        }
      } finally {
        setBuscando(false);
      }
    }, ESPERA_MS);

    return () => {
      controle.abort();
      clearTimeout(temporizador);
    };
  }, [texto, negocio]);

  async function selecionar(sugestao: Sugestao) {
    setAberto(false);
    setBuscando(true);
    setErroBusca(null);

    try {
      const resposta = await fetch(
        `/api/places/sugestoes?placeId=${encodeURIComponent(sugestao.placeId)}&sessao=${sessaoRef.current}`,
      );
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErroBusca(dados.erro ?? "Não consegui carregar esse negócio.");
        return;
      }

      setNegocio(dados.detalhes);
      setTexto(dados.detalhes.nome);
      // A sessão de autocomplete termina na escolha; a próxima busca começa
      // outra, e o Google cobra por sessão.
      sessaoRef.current = crypto.randomUUID();
    } finally {
      setBuscando(false);
    }
  }

  function trocarNegocio() {
    setNegocio(null);
    setTexto("");
    setSugestoes([]);
    setErroBusca(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={acao} className="flex flex-col gap-4">
        {/* Passo 1 — escolher o negócio */}
        {negocio ? (
          <CartaoDoNegocio negocio={negocio} aoTrocar={trocarNegocio} />
        ) : (
          <div ref={containerRef} className="relative flex flex-col gap-1">
            <label htmlFor={listaId} className="text-sm">
              Nome da empresa
            </label>
            <input
              id={listaId}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onFocus={() => sugestoes.length > 0 && setAberto(true)}
              autoComplete="off"
              placeholder="Comece a digitar o nome do negócio…"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />

            {buscando && (
              <span className="absolute right-3 top-9 text-xs text-neutral-400">
                buscando…
              </span>
            )}

            {aberto && sugestoes.length > 0 && (
              <ul className="absolute top-[4.5rem] z-10 flex w-full flex-col overflow-hidden rounded-md border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {sugestoes.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => selecionar(s)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <span className="text-sm font-medium">{s.principal}</span>
                      {s.secundario && (
                        <span className="text-xs text-neutral-500">
                          {s.secundario}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {texto.trim().length > 0 && texto.trim().length < 3 && (
              <span className="text-xs text-neutral-500">
                Digite ao menos 3 letras.
              </span>
            )}
          </div>
        )}

        {erroBusca && (
          <p role="alert" className="text-sm text-red-600">
            {erroBusca}
          </p>
        )}

        {/* Passo 2 — o serviço a verificar */}
        <label className="flex flex-col gap-1 text-sm">
          Serviço ou palavra-chave
          <input
            name="termo"
            required
            disabled={!negocio}
            placeholder="ex.: barbearia, corte masculino, clínica de estética"
            className="rounded-md border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-xs text-neutral-500">
            O termo que um cliente digitaria no Google para encontrar esse
            serviço.
          </span>
        </label>

        <input type="hidden" name="placeId" value={negocio?.placeId ?? ""} />
        <input type="hidden" name="nome" value={negocio?.nome ?? ""} />
        <input type="hidden" name="lat" value={negocio?.lat ?? ""} />
        <input type="hidden" name="lng" value={negocio?.lng ?? ""} />

        <button
          type="submit"
          disabled={analisando || !negocio}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {analisando ? "Consultando o Maps…" : "Ver posição"}
        </button>

        <p className="text-xs text-neutral-500">
          Cada verificação consome 1 busca da cota do SerpApi. A posição é
          medida a partir do endereço do próprio negócio.
        </p>
      </form>

      {estado?.tipo === "erro" && (
        <p role="alert" className="text-sm text-red-600">
          {estado.mensagem}
        </p>
      )}

      {estado?.tipo === "resultado" && <Resultado estado={estado} />}
    </div>
  );
}

function CartaoDoNegocio({
  negocio,
  aoTrocar,
}: {
  negocio: Negocio;
  aoTrocar: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-neutral-900 p-4 dark:border-neutral-100">
      {negocio.foto ? (
        /* A foto vem da Places API por uma rota nossa, que já faz cache. O
           otimizador do Next exigiria cadastrar um domínio remoto fixo, e
           aqui a origem varia por foto. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/places/foto?nome=${encodeURIComponent(negocio.foto)}`}
          alt={`Foto de ${negocio.nome}`}
          className="size-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">
          sem foto
        </div>
      )}

      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{negocio.nome}</span>
        {negocio.endereco && (
          <span className="text-xs text-neutral-500">{negocio.endereco}</span>
        )}
        <span className="text-xs text-neutral-500">
          {negocio.nota ? `${negocio.nota} ★` : "sem nota"}
          {negocio.totalAvaliacoes
            ? ` · ${negocio.totalAvaliacoes} avaliações`
            : ""}
          {negocio.categoria ? ` · ${negocio.categoria}` : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={aoTrocar}
        className="shrink-0 text-xs text-neutral-500 underline"
      >
        trocar
      </button>
    </div>
  );
}

function Resultado({
  estado,
}: {
  estado: Extract<EstadoAnalise, { tipo: "resultado" }>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          {estado.negocio} para &ldquo;{estado.termo}&rdquo;
        </p>
        <p className="text-3xl font-semibold tabular-nums">
          {estado.posicao ? `${estado.posicao}º lugar` : "fora do top 20"}
        </p>
        {!estado.posicao && (
          <p className="mt-1 text-xs text-neutral-500">
            O negócio não apareceu entre os resultados que o Google devolveu
            para esse termo, buscando do endereço dele.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Ranking na ordem real do Google</h3>
        <ol className="flex flex-col gap-1 text-sm">
          {estado.ranking.map((r) => {
            const ehOAlvo = r.placeId
              ? r.placeId === estado.placeId
              : r.titulo.toLowerCase() === estado.negocio.toLowerCase();

            return (
              <li
                key={`${r.posicao}-${r.titulo}`}
                className={`flex items-center justify-between gap-4 rounded-md border p-3 ${
                  ehOAlvo
                    ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-neutral-500 tabular-nums">
                    {r.posicao}
                  </span>
                  <span className="flex flex-col">
                    <span className={ehOAlvo ? "font-semibold" : "font-medium"}>
                      {r.titulo}
                    </span>
                    {r.endereco && (
                      <span className="text-xs text-neutral-500">
                        {r.endereco}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-neutral-500 tabular-nums">
                  {r.nota ? `${r.nota} ★` : "—"}{" "}
                  {r.totalAvaliacoes ? `(${r.totalAvaliacoes})` : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-neutral-500">
          A ordem é a que o Google devolveu, sem reordenação nossa. Não existe
          primeiro lugar absoluto no Maps: toda posição é relativa ao ponto de
          onde se busca — aqui, o endereço do negócio analisado.
        </p>
      </div>
    </section>
  );
}
