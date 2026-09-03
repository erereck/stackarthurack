# Stack Arthur Attack

Um clone web/mobile inspirado em **Stack Attack 2 Pro** (Mobile Scope / Siemens), feito para o Arthur jogar direto no navegador.

## Controles

- **◀ / ▶**: andar e empurrar caixas lateralmente
- **▲**: pular
- No teclado: `A/D` ou setas; `W`, `↑` ou `Espaço` para pular

## Estado atual da recriação

- Tabuleiro ajustado para **11 colunas**, seguindo a composição visível da versão colorida
- O guindaste agora **se move pelo trilho**, carregando a caixa até uma coluna antes de soltá-la
- O jogo começa com **1 guindaste**; novas limpezas ativam o 2º e o 3º, seguindo a descrição/gameplay da versão colorida
- Os guindastes trabalham de forma independente quando há mais de um ativo
- Caixas só podem ser **empurradas**, não carregadas
- **3+ caixas iguais na horizontal OU vertical** desaparecem
- Uma linha horizontal completamente preenchida também desaparece
- Pilhas caem/compactam depois de uma limpeza ou de um empurrão que deixa uma caixa sem apoio
- Caixa caindo na cabeça mata
- É possível saltar contra uma caixa em queda e quebrá-la com a cabeça
- Bônus de pontos, capacete e três super-pulos
- 6 perfis de personagem
- Recorde em `localStorage`
- Vibração em celulares compatíveis
- Controles grandes, multitouch e layout adaptado para celular/paisagem

## Referência usada

A calibração desta versão está sendo feita principalmente contra a gameplay **“Stack Attack 2 Pro (Colored) Siemens Mobile Game”** e capturas da versão colorida. Fontes antigas também descrevem explicitamente a limpeza de três caixas iguais tanto na vertical quanto na horizontal e a progressão de múltiplos guindastes.

Ainda é um protótipo de fidelidade: timings, power-ups extras, personagens e detalhes obscuros do original serão ajustados conforme comparação direta com a gameplay e feedback de quem jogou o original.

O visual é propositalmente próprio/simplificado; o objetivo é reproduzir a jogabilidade, não copiar os assets da Siemens.
