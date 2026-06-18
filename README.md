# Nice Confecções — Sistema de Gestão

Sistema de gestão de pedidos para confecção. Desenvolvido em Next.js 14 + Tailwind CSS.

## Stack

- **Next.js 14** (App Router)
- **Tailwind CSS**
- **localStorage** (dados locais, sem banco)
- **date-fns** (manipulação de datas)
- **lucide-react** (ícones)

## Módulos

- **Dashboard** — KPIs, alertas de pedidos urgentes, tabela de ativos
- **Pedidos** — listagem com filtros por status e busca
- **Novo Pedido** — formulário completo com cálculo automático de complexidade
- **Detalhe do Pedido** — progresso por setor, alteração de status
- **Produção** — kanban por pedido com progresso visual
- **Terceirizadas** — controle de envios, retornos e pagamentos
- **Relatórios** — KPIs mensais, distribuição por complexidade

## Como rodar localmente

```bash
npm install
npm run dev
```

Acesse: http://localhost:3000

## Deploy na Vercel

```bash
# 1. Criar repositório no GitHub e fazer push
git init
git add .
git commit -m "feat: nice confeccoes v1"
git remote add origin https://github.com/SEU_USUARIO/nice-confeccoes.git
git push -u origin main

# 2. Na Vercel
# - Import do repositório GitHub
# - Framework: Next.js (detectado automaticamente)
# - Deploy!
```

Sem variáveis de ambiente necessárias — tudo roda com localStorage.
