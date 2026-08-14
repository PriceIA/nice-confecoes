import type { Config } from 'tailwindcss'

const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

/** { red: { 50: 'var(--red-50)', ... } } — os valores vivem em globals.css. */
function escalaPorVariavel(nome: string) {
  return {
    [nome]: Object.fromEntries(TONS.map(t => [t, `var(--${nome}-${t})`])),
  }
}

const config: Config = {
  // Tema por CLASSE, não por prefers-color-scheme: a escolha explícita do
  // usuário precisa poder vencer a preferência do sistema. Quem liga e desliga
  // a classe `dark` no <html> é src/components/TemaProvider.tsx.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // src/lib estava DE FORA desde o primeiro commit, e o Tailwind só gera a
    // classe que ele enxerga no código. Como STATUS_CONFIG e
    // COMPLEXIDADE_CONFIG (helpers.ts) e badgePrazo/CORES_LISTA (kanban-ui.ts)
    // montam classes por string, tudo que existia SÓ neles nunca virou CSS:
    // as tarjas "Aprovado" (bg-blue-100) e "Entregue" (bg-green-100) saíam sem
    // fundo nenhum, e a cor âmbar de lista do Kanban não aparecia.
    './src/lib/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca. Valores fixos: verde Nice é verde Nice nos dois temas.
        nice: {
          50:  '#f0f9ee',
          100: '#d9f0d4',
          200: '#b4e0ab',
          300: '#82c977',
          400: '#5ab84a',
          500: '#3a8c2f',
          600: '#2d6e24',
          700: '#235720',
          800: '#1e2d1b',
          900: '#162014',
        },

        // ------------------------------------------------------------------
        // Cores SEMÂNTICAS. Cada uma aponta para uma variável CSS definida em
        // globals.css, então trocar o tema é trocar as variáveis num lugar só.
        //
        // Use SEMPRE estas nas telas, no lugar de bg-white / text-gray-500 /
        // border-gray-100 — cor literal não reage ao tema.
        //
        // Não aceitam modificador de opacidade (bg-superficie/50 não funciona,
        // porque o valor é um var() opaco). Se precisar de transparência, use
        // uma cor literal como bg-black/40.
        // ------------------------------------------------------------------
        fundo: 'var(--fundo)',
        superficie: {
          DEFAULT: 'var(--superficie)',   // cartões, campos, menus
          2: 'var(--superficie-2)',       // faixas e blocos levemente destacados
          3: 'var(--superficie-3)',       // chips, barras de progresso
        },
        borda: {
          DEFAULT: 'var(--borda)',
          forte: 'var(--borda-forte)',
        },
        conteudo: 'var(--texto)',         // texto principal
        suave: 'var(--texto-suave)',      // texto secundário
        fraco: 'var(--texto-fraco)',      // rótulos, placeholders, ícones inertes
        titulo: 'var(--titulo)',          // títulos de tela e de card
        marca: {
          DEFAULT: 'var(--marca)',        // fundo de ação (com texto branco)
          hover: 'var(--marca-hover)',
          texto: 'var(--marca-texto)',    // verde COMO TEXTO — clareia no escuro
          suave: 'var(--marca-suave)',    // fundo verde tênue
          borda: 'var(--marca-borda)',
        },

        // ------------------------------------------------------------------
        // Paleta de STATUS (atraso, urgência, sucesso...) também por variável.
        //
        // São ~150 usos espalhados pelas telas. Em vez de pendurar um `dark:`
        // em cada um, a própria escala vira variável: no claro ela tem os
        // valores padrão do Tailwind, no escuro globals.css redefine.
        //
        // A escala INVERTE de papel no tema escuro, e isso é intencional:
        //   50–300  continuam sendo fundo/borda, mas em tom escuro
        //   400–900 continuam sendo texto, mas em tom CLARO
        // Ou seja, `bg-red-100 text-red-700` segue significando "tarja
        // vermelha com texto vermelho legível" nos dois temas, sem edição.
        //
        // Consequência: `bg-red-600` NÃO serve mais de fundo sólido para texto
        // branco no escuro. Botão destrutivo usa a classe .btn-perigo.
        // ------------------------------------------------------------------
        ...escalaPorVariavel('red'),
        ...escalaPorVariavel('orange'),
        ...escalaPorVariavel('yellow'),
        ...escalaPorVariavel('green'),
        ...escalaPorVariavel('blue'),
        ...escalaPorVariavel('purple'),
        ...escalaPorVariavel('amber'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
