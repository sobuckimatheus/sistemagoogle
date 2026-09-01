/**
 * Ícones em SVG inline.
 *
 * Sem biblioteca: são dezoito traçados, e qualquer pacote de ícones custaria
 * mais que isso em bundle para entregar os mesmos dezoito. Todos no mesmo
 * grid de 24, mesma espessura, `currentColor` — a cor vem do contexto.
 */

export type NomeDeIcone = keyof typeof TRACOS;

const TRACOS = {
  painel: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  visao: "M3 20h18M6.5 20v-6M11 20V8m4.5 12v-9M20 20V5",
  auditoria: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4.5 4.5M8.5 11h5",
  receita:
    "M12 3v18M15.5 7.5c0-1.4-1.6-2.5-3.5-2.5S8.5 6.1 8.5 7.5 10 10 12 10.5s3.5 1.1 3.5 2.6-1.6 2.6-3.5 2.6-3.5-1.2-3.5-2.6",
  estrela:
    "m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9L12 3.8Z",
  postagem: "M4 7.5h9m-9 4.5h9m-9 4.5h6M17 4.5l3 3-6.5 6.5-3.5.9.9-3.5L17 4.5Z",
  concorrentes:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5.2 6-5.2s6 2.2 6 5.2M16 5.2a3.5 3.5 0 0 1 0 6.6m1.6 3.4c2 .8 3.4 2.5 3.4 4.6",
  checklist:
    "M4 6.5 5.8 8.3 9 5m-5 8 1.8 1.8L9 11.5M4 19.5l1.8 1.8L9 18m3.5-11.5H20M12.5 13H20m-7.5 6.5H20",
  alerta:
    "M12 3.5a5.5 5.5 0 0 0-5.5 5.5c0 5-2 6.5-2 6.5h15s-2-1.5-2-6.5A5.5 5.5 0 0 0 12 3.5Zm-1.7 15a2 2 0 0 0 3.4 0",
  relatorio:
    "M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Zm0 0V9H19M9 13h6m-6 3.5h4",
  config:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.8L14.2 2H9.8l-.3 2.5a8 8 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5a8.3 8.3 0 0 0 0 3.6l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.8l.3 2.5h4.4l.3-2.5a8 8 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z",
  ajuda:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.2-11.3a2.3 2.3 0 1 1 3 2.2c-.5.2-.8.7-.8 1.2v.7m0 3h0",

  olho: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  telefone:
    "M8.5 3.5H5A1.5 1.5 0 0 0 3.5 5c0 8.6 6.9 15.5 15.5 15.5A1.5 1.5 0 0 0 20.5 19v-3.5l-4.3-1.4-2 2.4a13.4 13.4 0 0 1-5.7-5.7l2.4-2L8.5 3.5Z",
  rota: "M21 3 3 10.6l7.5 3 3 7.4L21 3Z",
  globo:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8.7-6h17.4M3.3 9h17.4M12 3c4 4.6 4 13.4 0 18-4-4.6-4-13.4 0-18Z",

  calendario:
    "M4.5 8.5h15M7 4.5v3m10-3v3M6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5H6A1.5 1.5 0 0 0 4.5 7v12A1.5 1.5 0 0 0 6 20.5Z",
  baixar: "M12 3.5v11m0 0 4-4m-4 4-4-4M4 17v2.5h16V17",
  seta: "M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5",
  alvo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9.5V16m0-7.5h0",
  escudo:
    "M12 3 5 5.5V11c0 4.4 3 8.4 7 9.5 4-1.1 7-5.1 7-9.5V5.5L12 3Zm-3 8.8 2.2 2.2L15 10",
  faisca:
    "M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.6 10.4 12 5 10.6 10.4 9 12 3.5ZM19 16l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7L19 16Z",
} as const;

export function Icone({
  nome,
  className = "size-[18px]",
}: {
  nome: NomeDeIcone;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={TRACOS[nome]} />
    </svg>
  );
}
