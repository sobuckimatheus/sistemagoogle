// Substitui o pacote `server-only` nos testes.
//
// O pacote real lança ao ser importado fora de um Server Component, o que é
// exatamente o comportamento desejado em produção — e inútil aqui, onde o
// alvo do teste é a lógica do módulo, não o ambiente de execução.
export {};
