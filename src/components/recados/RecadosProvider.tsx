'use client'
// Estado de tudo em Recados (Fase J) — a gaveta de chat entre duas pessoas.
//
// Montado no AppShell, envolvendo Sidebar e main. Só carrega e assina o
// Realtime quando há `membro` e `permissoes.usarRecados` — hoje isso é
// sempre verdade (os 8 perfis têm a permissão), mas o guard fica pronto para
// o dia em que algum perfil deixar de ter.
//
// A privacidade da conversa é RLS (migration 018) — este arquivo não filtra
// "quem pode ver o quê" no client, porque o banco já garante isso.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { useMembro } from '@/components/AuthProvider'
import {
  agruparConversas,
  enviarRecado as enviarRecadoApi,
  getEquipeRecados,
  getMeusRecados,
  marcarLidos as marcarLidosApi,
  assinarRecados,
} from '@/lib/recados'
import type { Conversa, MembroEquipe, Recado } from '@/types'
import PainelRecados from './PainelRecados'

/** Um recado como ele existe no client: igual ao do banco, mais o estado de
 * envio otimista. `pendente` só existe enquanto o recado ainda não foi
 * confirmado pelo banco — nunca é gravado, é só UI. */
export type RecadoLocal = Recado & { pendente?: 'enviando' | 'erro' }

export type TelaRecados = 'lista' | 'conversa' | 'nova'

type RecadosCtx = {
  usarRecados: boolean
  naoLidas: number
  conversas: Conversa[]
  recadosCom: (outroId: string) => RecadoLocal[]
  equipe: MembroEquipe[]
  aberto: boolean
  tela: TelaRecados
  conversaCom: string | null
  pedidoAnexado: string | null
  abrir: () => void
  abrirConversa: (id: string) => void
  abrirNova: (pedidoId?: string) => void
  fechar: () => void
  enviar: (texto: string) => void
  reenviar: (idTemporario: string) => void
  removerPedidoAnexado: () => void
}

const valorPadrao: RecadosCtx = {
  usarRecados: false,
  naoLidas: 0,
  conversas: [],
  recadosCom: () => [],
  equipe: [],
  aberto: false,
  tela: 'lista',
  conversaCom: null,
  pedidoAnexado: null,
  abrir: () => {},
  abrirConversa: () => {},
  abrirNova: () => {},
  fechar: () => {},
  enviar: () => {},
  reenviar: () => {},
  removerPedidoAnexado: () => {},
}

const Contexto = createContext<RecadosCtx>(valorPadrao)

export function useRecados() {
  return useContext(Contexto)
}

function idTemporario(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function RecadosProvider({ children }: { children: React.ReactNode }) {
  const { membro, permissoes } = useMembro()
  const usarRecados = permissoes.usarRecados

  const [equipe, setEquipe] = useState<MembroEquipe[]>([])
  const [recados, setRecados] = useState<RecadoLocal[]>([])
  const [aberto, setAberto] = useState(false)
  const [tela, setTela] = useState<TelaRecados>('lista')
  const [conversaCom, setConversaCom] = useState<string | null>(null)
  const [pedidoAnexado, setPedidoAnexado] = useState<string | null>(null)

  // Lidos pela callback do Realtime, que é montada uma vez (não pode fechar
  // sobre estado desatualizado) — por isso refs em vez de ler `aberto`/`tela`/
  // `conversaCom` direto.
  const abertoRef = useRef(aberto)
  const telaRef = useRef(tela)
  const conversaComRef = useRef(conversaCom)
  useEffect(() => { abertoRef.current = aberto }, [aberto])
  useEffect(() => { telaRef.current = tela }, [tela])
  useEffect(() => { conversaComRef.current = conversaCom }, [conversaCom])

  const meuId = membro?.id

  const marcarConversaLida = useCallback(async (deId: string) => {
    if (!meuId) return
    try {
      await marcarLidosApi(deId)
      setRecados(prev => prev.map(r =>
        r.remetenteId === deId && r.destinatarioId === meuId && r.lidoEm === null
          ? { ...r, lidoEm: new Date().toISOString() }
          : r
      ))
    } catch {
      // Só afeta o ✓✓ — não é uma ação que o usuário pediu diretamente, então
      // não vale um banner de erro. A próxima abertura da conversa tenta de novo.
    }
  }, [meuId])

  // Carrega equipe + recados ao montar, e de novo quando a aba volta a ter
  // foco — cobre mensagem perdida se o Realtime cair enquanto a aba estava
  // em segundo plano.
  useEffect(() => {
    if (!meuId || !usarRecados) return
    let cancelado = false

    async function carregar() {
      try {
        const [eq, rec] = await Promise.all([getEquipeRecados(meuId!), getMeusRecados()])
        if (cancelado) return
        setEquipe(eq)
        // Preserva balões ainda não confirmados pelo banco (envio em
        // andamento ou com falha) — sem isso, um reload no meio de um envio
        // faria a mensagem "desaparecer" da tela até o usuário reenviar.
        setRecados(prev => {
          const pendentes = prev.filter(r => r.pendente && r.id.startsWith('tmp-'))
          return [...rec, ...pendentes]
        })
      } catch {
        // Mantém o que já tinha na tela; a próxima visibilitychange tenta de novo.
      }
    }

    carregar()

    function aoFicarVisivel() {
      if (document.visibilityState === 'visible') carregar()
    }
    document.addEventListener('visibilitychange', aoFicarVisivel)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoFicarVisivel)
    }
  }, [meuId, usarRecados])

  // Realtime: um canal só, criado uma vez por sessão (não a cada troca de tela).
  useEffect(() => {
    if (!meuId || !usarRecados) return

    const parar = assinarRecados(meuId, {
      aoInserir(novo) {
        setRecados(prev => (prev.some(r => r.id === novo.id) ? prev : [...prev, novo]))
        if (abertoRef.current && telaRef.current === 'conversa' && conversaComRef.current === novo.remetenteId) {
          marcarConversaLida(novo.remetenteId)
        }
      },
      aoAtualizar(atualizado) {
        setRecados(prev => prev.map(r => (r.id === atualizado.id ? atualizado : r)))
      },
    })

    return parar
  }, [meuId, usarRecados, marcarConversaLida])

  const naoLidas = useMemo(
    () => recados.filter(r => r.destinatarioId === meuId && r.lidoEm === null).length,
    [recados, meuId]
  )

  // Título da aba avisa recado não lido mesmo com o painel fechado.
  useEffect(() => {
    document.title = naoLidas > 0 ? `(${naoLidas}) Nice Confecções` : 'Nice Confecções'
    return () => { document.title = 'Nice Confecções' }
  }, [naoLidas])

  const conversas = useMemo(
    () => (meuId ? agruparConversas(recados, meuId, equipe) : []),
    [recados, meuId, equipe]
  )

  const recadosCom = useCallback((outroId: string): RecadoLocal[] => {
    if (!meuId) return []
    return recados
      .filter(r =>
        (r.remetenteId === meuId && r.destinatarioId === outroId) ||
        (r.remetenteId === outroId && r.destinatarioId === meuId)
      )
      .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())
  }, [recados, meuId])

  const abrir = useCallback(() => {
    setTela('lista')
    setPedidoAnexado(null)
    setAberto(true)
  }, [])

  const abrirConversa = useCallback((id: string) => {
    setTela('conversa')
    setConversaCom(id)
    setAberto(true)
    marcarConversaLida(id)
  }, [marcarConversaLida])

  const abrirNova = useCallback((pedidoId?: string) => {
    setTela('nova')
    setConversaCom(null)
    setPedidoAnexado(pedidoId ?? null)
    setAberto(true)
  }, [])

  const fechar = useCallback(() => setAberto(false), [])

  const removerPedidoAnexado = useCallback(() => setPedidoAnexado(null), [])

  const enviarPara = useCallback(async (destinatarioId: string, texto: string, pedidoId: string | null, idTemp: string) => {
    try {
      const salvo = await enviarRecadoApi({ remetenteId: meuId!, destinatarioId, texto, pedidoId })
      setRecados(prev => prev.map(r => (r.id === idTemp ? salvo : r)))
    } catch {
      setRecados(prev => prev.map(r => (r.id === idTemp ? { ...r, pendente: 'erro' } : r)))
    }
  }, [meuId])

  const enviar = useCallback((texto: string) => {
    if (!meuId || !conversaCom) return
    const pedidoId = pedidoAnexado
    setPedidoAnexado(null) // o chip do pedido vale só para este envio (regra da J2)

    const idTemp = idTemporario()
    const otimista: RecadoLocal = {
      id: idTemp,
      remetenteId: meuId,
      destinatarioId: conversaCom,
      texto: texto.trim(),
      pedidoId: pedidoId ?? null,
      criadoEm: new Date().toISOString(),
      lidoEm: null,
      pendente: 'enviando',
    }
    setRecados(prev => [...prev, otimista])
    enviarPara(conversaCom, texto, pedidoId, idTemp)
  }, [meuId, conversaCom, pedidoAnexado, enviarPara])

  const reenviar = useCallback((idTemp: string) => {
    const item = recados.find(r => r.id === idTemp)
    if (!item) return
    setRecados(prev => prev.map(r => (r.id === idTemp ? { ...r, pendente: 'enviando' } : r)))
    enviarPara(item.destinatarioId, item.texto, item.pedidoId, idTemp)
  }, [recados, enviarPara])

  const valor = useMemo<RecadosCtx>(() => ({
    usarRecados,
    naoLidas,
    conversas,
    recadosCom,
    equipe,
    aberto,
    tela,
    conversaCom,
    pedidoAnexado,
    abrir,
    abrirConversa,
    abrirNova,
    fechar,
    enviar,
    reenviar,
    removerPedidoAnexado,
  }), [
    usarRecados, naoLidas, conversas, recadosCom, equipe, aberto, tela, conversaCom,
    pedidoAnexado, abrir, abrirConversa, abrirNova, fechar, enviar, reenviar, removerPedidoAnexado,
  ])

  return (
    <Contexto.Provider value={valor}>
      {children}
      <PainelRecados />
    </Contexto.Provider>
  )
}
