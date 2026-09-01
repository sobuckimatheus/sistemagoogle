"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Sugestao = {
  placeId: string;
  principal: string;
  secundario: string | null;
};

export type NegocioSelecionado = {
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
 * Cada consulta custa. 350ms é o intervalo em que quem digita normalmente
 * ainda não terminou de pensar no nome — abaixo disso, paga-se por consultas
 * que ninguém chegou a ler.
 */
const ESPERA_MS = 350;

/**
 * Busca de negócio no Google com autocomplete.
 *
 * Compartilhado entre a tela interna e a página pública: as duas fazem
 * exatamente o mesmo trabalho de escolher um negócio, e o que muda é só o
 * limite de uso aplicado no servidor.
 */
export function SeletorDeNegocio({
  negocio,
  aoSelecionar,
  aoLimpar,
  rotulo = "Nome da empresa",
  placeholder = "Comece a digitar o nome do negócio…",
  autoFocus = false,
}: {
  negocio: NegocioSelecionado | null;
  aoSelecionar: (negocio: NegocioSelecionado) => void;
  aoLimpar: () => void;
  rotulo?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campoId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Token de sessão do autocomplete.
   *
   * O Google cobra sugestões e detalhamento como um evento só quando
   * compartilham este token. Sem ele, cada tecla digitada vira uma cobrança
   * separada.
   */
  const sessaoRef = useRef<string>("");
  if (!sessaoRef.current && typeof crypto !== "undefined") {
    sessaoRef.current = crypto.randomUUID();
  }

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  useEffect(() => {
    const consulta = texto.trim();
    if (negocio || consulta.length < 3) {
      setSugestoes([]);
      return;
    }

    // A resposta de uma digitação anterior pode chegar depois da atual e
    // sobrescrever a lista com dado velho.
    const controle = new AbortController();
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      setErro(null);
      try {
        const resposta = await fetch(
          `/api/places/sugestoes?q=${encodeURIComponent(consulta)}&sessao=${sessaoRef.current}`,
          { signal: controle.signal },
        );
        const dados = await resposta.json();

        if (!resposta.ok) {
          setErro(dados.erro ?? "Não consegui buscar agora.");
          setSugestoes([]);
        } else {
          setSugestoes(dados.sugestoes ?? []);
          setAberto(true);
        }
      } catch (falha) {
        if ((falha as Error).name !== "AbortError") {
          setErro("Não consegui buscar agora.");
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
    setErro(null);

    try {
      const resposta = await fetch(
        `/api/places/sugestoes?placeId=${encodeURIComponent(sugestao.placeId)}&sessao=${sessaoRef.current}`,
      );
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro ?? "Não consegui carregar esse negócio.");
        return;
      }

      aoSelecionar(dados.detalhes);
      setTexto(dados.detalhes.nome);
      // A sessão termina na escolha; a próxima busca começa outra.
      sessaoRef.current = crypto.randomUUID();
    } finally {
      setBuscando(false);
    }
  }

  function limpar() {
    aoLimpar();
    setTexto("");
    setSugestoes([]);
    setErro(null);
  }

  if (negocio) {
    return <CartaoDoNegocio negocio={negocio} aoTrocar={limpar} />;
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label htmlFor={campoId} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={campoId}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="rounded-lg border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />

      {buscando && (
        <span className="absolute right-4 top-11 text-xs text-neutral-400">
          buscando…
        </span>
      )}

      {aberto && sugestoes.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 flex w-full flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          {sugestoes.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => selecionar(s)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
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

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

function CartaoDoNegocio({
  negocio,
  aoTrocar,
}: {
  negocio: NegocioSelecionado;
  aoTrocar: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border-2 border-neutral-900 p-4 dark:border-neutral-100">
      {negocio.foto ? (
        /* A foto vem da Places API por uma rota nossa, que já faz cache. O
           otimizador do Next exigiria um domínio remoto fixo, e aqui a
           origem varia por foto. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/places/foto?nome=${encodeURIComponent(negocio.foto)}`}
          alt={`Foto de ${negocio.nome}`}
          className="size-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-center text-[10px] leading-tight text-neutral-400 dark:bg-neutral-800">
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
