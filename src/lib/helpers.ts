import { Complexidade, Personalizacao } from '@/types'

export const CATALOGO = {
  Esportivo: ['Camiseta sublimada futebol', 'Short sublimado', 'Rashguard', 'Bermuda Jiu-jitsu/MMA', 'Bermuda Muay Thai'],
  Empresarial: ['Camiseta PV', 'Camiseta algodão', 'Polo PV', 'Polo algodão', 'Polo PQ', 'Camisa social slim', 'Moletom', 'Calça reta', 'Calça slim', 'Bermuda', 'Jaleco'],
  Escolar: ['Camiseta', 'Polo', 'Bermuda'],
  Acessórios: ['Ecobag', 'Sacolinha kimono', 'Avental', 'Roupa coroinha'],
}

export const PERSONALIZACOES: { value: Personalizacao; label: string }[] = [
  { value: 'bordado', label: 'Bordado' },
  { value: 'silk', label: 'Estamparia Silk' },
  { value: 'dtf', label: 'Prensa DTF' },
  { value: 'sublimacao', label: 'Sublimação' },
]

export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'UNICO', '01', '02', '04', '06', '08', '10', '12', '14', 'SOB_MEDIDA'] as const

export function calcularComplexidade(tipo: string, personalizacoes: Personalizacao[]): Complexidade {
  const qtdPerson = personalizacoes.length
  const tipoLower = tipo.toLowerCase()

  if (tipoLower.includes('social') || (tipoLower.includes('tectel') && qtdPerson >= 2) || (tipoLower.includes('sublima') && qtdPerson >= 2)) return 'P5'
  if (tipoLower.includes('mma') || tipoLower.includes('jiu') || tipoLower.includes('conjunto') || (tipoLower.includes('sublima') && qtdPerson >= 1)) return 'P4'
  if (tipoLower.includes('polo') || tipoLower.includes('jaleco') || tipoLower.includes('hashtag') || qtdPerson >= 2) return 'P3'
  if (tipoLower.includes('reforço') || qtdPerson === 1) return 'P2'
  return 'P1'
}

export const COMPLEXIDADE_CONFIG: Record<Complexidade, { label: string; color: string; bg: string }> = {
  P1: { label: 'P1 — Básica', color: 'text-gray-600', bg: 'bg-gray-100' },
  P2: { label: 'P2 — Simples', color: 'text-blue-600', bg: 'bg-blue-100' },
  P3: { label: 'P3 — Média', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  P4: { label: 'P4 — Complexa', color: 'text-orange-600', bg: 'bg-orange-100' },
  P5: { label: 'P5 — Premium', color: 'text-red-600', bg: 'bg-red-100' },
}

export const STATUS_CONFIG = {
  orcamento:            { label: 'Orçamento',           color: 'text-gray-600',    bg: 'bg-gray-100' },
  aprovado:             { label: 'Aprovado',            color: 'text-blue-600',    bg: 'bg-blue-100' },
  aguardando_pagamento: { label: 'Aguardando Pagamento', color: 'text-yellow-700',  bg: 'bg-yellow-100' },
  em_producao:          { label: 'Em Produção',         color: 'text-nice-600',    bg: 'bg-nice-100' },
  finalizado:           { label: 'Finalizado',          color: 'text-purple-600',  bg: 'bg-purple-100' },
  entregue:             { label: 'Entregue',            color: 'text-green-700',   bg: 'bg-green-100' },
  cancelado:            { label: 'Cancelado',           color: 'text-red-600',     bg: 'bg-red-100' },
}

export const SETOR_LABELS: Record<string, string> = {
  atendimento:        'Atendimento',
  compra:             'Compra',
  corte:              'Corte',
  costura:            'Costura',
  estamparia_silk:    'Estamparia Silk',
  prensa_dtf:         'Prensa DTF',
  prensa_sublimacao:  'Prensa Sublimação',
  acabamento:         'Acabamento',
}

export function totalPecas(pedido: { pecas: { tamanhos: { quantidade: number }[] }[] }) {
  return pedido.pecas.reduce((acc, p) => acc + p.tamanhos.reduce((a, t) => a + t.quantidade, 0), 0)
}

export function formatarTelefone(v: string) {
  return v.replace(/\D/g, '').replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3')
}
