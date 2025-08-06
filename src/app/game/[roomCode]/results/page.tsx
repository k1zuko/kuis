"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Trophy, Skull, Heart, Target, Clock, Home, RotateCcw, AlertTriangle, Zap } from "lucide-react"
import { motion, AnimatePresence, Transition } from "framer-motion"
import { HorrorCard } from "@/components/ui/horror-card"
import type { GameRoom } from "@/lib/supabase"
import Image from "next/image"

interface GameCompletion {
  id: string
  player_id: string
  final_health: number
  correct_answers: number
  total_questions_answered: number
  is_eliminated: boolean
  completion_type: string
  completed_at: string
  players: {
    nickname: string
    character_type: string
  }
}

interface PlayerStats {
  id: string
  nickname: string
  score: number
  correct_answers: number
  is_alive: boolean
  rank: number
}

interface RoomStats {
  total_players: number
  alive_players: number
  total_attacks: number
  recent_attacks: number
  average_health: number
}

interface GameActivity {
  activity_type: string
  player_nickname: string
  activity_data: {
    correct_answers?: number
    final_health?: number
    is_eliminated?: boolean
    completion_type?: string
    damage?: number
    attack_type?: string
    attack_data?: {
      question_index?: number
      answer?: string
      player_nickname?: string
      damage_dealt?: number
    }
  }
  activity_time: string
}

const characterGifs = [
  '/character.gif',
  '/character1.gif',
  '/character2.gif',
  '/character3.gif',
  '/character4.gif'
]

export default function ResultsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const roomCode = params.roomCode as string

  const [gameCompletions, setGameCompletions] = useState<GameCompletion[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([])
  const [roomStats, setRoomStats] = useState<RoomStats | null>(null)
  const [recentActivities, setRecentActivities] = useState<GameActivity[]>([])
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerData, setPlayerData] = useState<{
    health: number
    correct: number
    total: number
    eliminated: boolean
    perfect: boolean
    nickname: string
  } | null>(null)

  const isMountedRef = useRef(true)
  const channelsRef = useRef<any[]>([])

  const initializePlayerData = useCallback(() => {
    console.log("Initializing player data...");
    try {
      // Use default values if parameters are invalid
      const health = parseInt(searchParams.get("health") || "3")
      const correct = parseInt(searchParams.get("correct") || "0")
      const total = parseInt(searchParams.get("total") || "10")
      const eliminated = searchParams.get("eliminated") === "true"
      let nickname = decodeURIComponent(searchParams.get("nickname") || "Unknown")

      // Validate parameters
      if (isNaN(health) || isNaN(correct) || isNaN(total)) {
        console.warn("Invalid URL parameters: using fallback values", {
          health: searchParams.get("health"),
          correct: searchParams.get("correct"),
          total: searchParams.get("total"),
        })
        setError("Parameter URL tidak valid, menggunakan nilai default")
        setPlayerData({
          health: 3,
          correct: 0,
          total: 10,
          eliminated: false,
          perfect: false,
          nickname: "Unknown"
        })
        return
      }

      // Validate nickname
      if (!nickname || nickname === "null") {
        console.warn("Invalid nickname, using default")
        nickname = "Unknown"
      }

      const perfect = correct === total && total > 0

      setPlayerData({
        health,
        correct,
        total,
        eliminated,
        perfect,
        nickname
      })
      console.log("Player data set:", { health, correct, total, eliminated, perfect, nickname })
    } catch (err: any) {
      console.error("Error initializing player data:", err.message)
      setError("Gagal memuat data pemain dari URL, menggunakan nilai default")
      setPlayerData({
        health: 3,
        correct: 0,
        total: 10,
        eliminated: false,
        perfect: false,
        nickname: "Unknown"
      })
    }
  }, [searchParams]) // Dependency: searchParams

  const fetchInitialData = useCallback(async () => {
    console.log("Starting fetchInitialData for roomCode:", roomCode)
    if (!roomCode) {
      console.error("Invalid roomCode")
      setError("Kode ruangan tidak valid")
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      console.log("Fetching room data...")

      // Initialize player data
      initializePlayerData()

      // Fetch room data to get room_id
      const { data: roomData, error: roomError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", roomCode)
        .single()

      if (roomError || !roomData) {
        console.error("Room fetch error:", roomError?.message)
        setError(`Ruangan tidak ditemukan: ${roomError?.message || "Ruangan tidak valid"}`)
        setIsLoading(false)
        return
      }

      console.log("Room data fetched:", roomData)
      setRoom(roomData)

      // Fetch other data concurrently
      console.log("Fetching additional data...")
      const [
        { data: completionsData, error: completionsError },
        { data: leaderboardData, error: leaderboardError },
        { data: battleStatsData, error: battleStatsError },
        { data: activityData, error: activityError }
      ] = await Promise.all([
        supabase
          .from("game_completions")
          .select(`
            *,
            players!inner(nickname, character_type)
          `)
          .eq("room_id", roomData.id)
          .order("completed_at", { ascending: false }),
        supabase.rpc("get_room_leaderboard", { p_room_id: roomData.id }),
        supabase.rpc("get_room_battle_stats", { p_room_id: roomData.id }),
        supabase.rpc("get_recent_game_activity", { p_room_id: roomData.id, p_limit: 10 })
      ])

      if (completionsError) {
        console.warn("Error fetching game completions:", completionsError.message)
        setGameCompletions([])
      } else {
        const formattedCompletions = completionsData.map((completion: any) => ({
          ...completion,
          players: {
            nickname: completion.players?.nickname || "Tidak Dikenal",
            character_type: completion.players?.character_type || "default",
          },
        }))
        setGameCompletions(formattedCompletions)
        console.log("Game completions set:", formattedCompletions)
      }

      if (leaderboardError) {
        console.warn("Error fetching leaderboard:", leaderboardError.message)
        setPlayerStats([])
      } else if (leaderboardData) {
        setPlayerStats(leaderboardData)
        console.log("Player stats set:", leaderboardData)
      }

      if (battleStatsError) {
        console.warn("Error fetching battle stats:", battleStatsError.message)
        setRoomStats(null)
      } else {
        setRoomStats(battleStatsData[0] || null)
        console.log("Room stats set:", battleStatsData[0])
      }

      if (activityError) {
        console.warn("Error fetching recent activities:", activityError.message)
        setRecentActivities([])
      } else {
        setRecentActivities(activityData)
        console.log("Recent activities set:", activityData)
      }
    } catch (err: any) {
      console.error("Fetch initial data error:", err.message)
      setError(err.message || "Gagal memuat data tambahan, menampilkan hasil parsial")
    } finally {
      if (isMountedRef.current) {
        console.log("Setting isLoading to false")
        setIsLoading(false)
      }
    }
  }, [roomCode, initializePlayerData]) // Dependencies: roomCode, initializePlayerData

  const setupRealtimeSubscriptions = useCallback(() => {
    if (!room || !isMountedRef.current) return () => {}

    console.log("Setting up realtime subscriptions for room:", room.id)
    const completionsChannel = supabase
      .channel(`completions-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_completions",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!isMountedRef.current) return
          const { data: completionsData, error } = await supabase
            .from("game_completions")
            .select(`
              *,
              players!inner(nickname, character_type)
            `)
            .eq("room_id", room.id)
            .order("completed_at", { ascending: false })

          if (!error && completionsData && isMountedRef.current) {
            const formattedCompletions = completionsData.map((completion: any) => ({
              ...completion,
              players: {
                nickname: completion.players?.nickname || "Tidak Dikenal",
                character_type: completion.players?.character_type || "default",
              },
            }))
            setGameCompletions(formattedCompletions)
            console.log("Realtime update: game completions", formattedCompletions)
          } else if (error) {
            console.warn("Realtime completions error:", error.message)
          }
        },
      )
      .subscribe()

    const playersChannel = supabase
      .channel(`players-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!isMountedRef.current) return
          const { data: leaderboardData, error } = await supabase.rpc("get_room_leaderboard", {
            p_room_id: room.id,
          })

          if (!error && leaderboardData && isMountedRef.current) {
            setPlayerStats(leaderboardData)
            console.log("Realtime update: player stats", leaderboardData)
          } else if (error) {
            console.warn("Realtime leaderboard error:", error.message)
          }
        },
      )
      .subscribe()

    const healthChannel = supabase
      .channel(`health-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_health_states",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!isMountedRef.current) return
          const { data: battleStatsData, error } = await supabase.rpc("get_room_battle_stats", {
            p_room_id: room.id,
          })

          if (!error && battleStatsData && isMountedRef.current) {
            setRoomStats(battleStatsData[0] || null)
            console.log("Realtime update: room stats", battleStatsData[0])
          } else if (error) {
            console.warn("Realtime battle stats error:", error.message)
          }
        },
      )
      .subscribe()

    const answersChannel = supabase
      .channel(`answers-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_answers",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!isMountedRef.current) return
          const { data: activityData, error } = await supabase.rpc("get_recent_game_activity", {
            p_room_id: room.id,
            p_limit: 10,
          })

          if (!error && activityData && isMountedRef.current) {
            setRecentActivities(activityData)
            console.log("Realtime update: recent activities", activityData)
          } else if (error) {
            console.warn("Realtime activities error:", error.message)
          }
        },
      )
      .subscribe()

    const attacksChannel = supabase
      .channel(`attacks-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_attacks",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!isMountedRef.current) return
          const { data: activityData, error } = await supabase.rpc("get_recent_game_activity", {
            p_room_id: room.id,
            p_limit: 10,
          })

          if (!error && activityData && isMountedRef.current) {
            setRecentActivities(activityData)
            console.log("Realtime update: recent attacks", activityData)
          } else if (error) {
            console.warn("Realtime attacks error:", error.message)
          }
        },
      )
      .subscribe()

    channelsRef.current = [completionsChannel, playersChannel, healthChannel, answersChannel, attacksChannel]

    return () => {
      console.log("Cleaning up realtime subscriptions")
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel)
      })
      channelsRef.current = []
    }
  }, [room])

  useEffect(() => {
    console.log("Triggering fetchInitialData")
    fetchInitialData()

    // Timeout to prevent loading from getting stuck
    const timeout = setTimeout(() => {
      if (isMountedRef.current && isLoading) {
        console.warn("Loading timeout reached, forcing render")
        setIsLoading(false)
        if (!playerData) {
          console.error("Player data still null after timeout")
          setError("Pemuatan terlalu lama, menampilkan hasil parsial dari URL")
        }
      }
    }, 3000) // 3-second timeout

    return () => clearTimeout(timeout)
  }, [fetchInitialData]) // Removed playerData from dependencies

  useEffect(() => {
    if (room) {
      const cleanup = setupRealtimeSubscriptions()
      return cleanup
    }
  }, [room, setupRealtimeSubscriptions])

  useEffect(() => {
    return () => {
      console.log("Component unmounting")
      isMountedRef.current = false
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel)
      })
    }
  }, [])

  const getPlayerRank = () => {
    if (!playerData || gameCompletions.length === 0) return 1

    const sortedCompletions = [...gameCompletions].sort((a, b) => {
      if (a.correct_answers !== b.correct_answers) {
        return b.correct_answers - a.correct_answers
      }
      return b.final_health - a.final_health
    })

    const playerCompletion = sortedCompletions.find(
      (c) => c.correct_answers === playerData.correct && c.final_health === playerData.health,
    )

    return playerCompletion ? sortedCompletions.indexOf(playerCompletion) + 1 : 1
  }

  const getPerformanceTitle = () => {
    if (!playerData) return "JIWA YANG HILANG"
    const accuracy = playerData.total > 0 ? (playerData.correct / playerData.total) * 100 : 0

    if (playerData.perfect) return "PENYINTAS ULUNG"
    if (accuracy >= 90) return "PEMUSNAH MIMPI BURUK"
    if (accuracy >= 80) return "PEMBURU KEGELAPAN"
    if (accuracy >= 70) return "PEJUANG BERCERMIN DARAH"
    if (accuracy >= 60) return "PEJUANG KETAKUTAN"
    if (accuracy >= 50) return "KORBAN TERLUKAI"
    if (accuracy >= 40) return "JIWA YANG HANCUR"
    if (accuracy >= 30) return "BERKELIARAN DALAM SAKIT"
    if (accuracy >= 20) return "MERINTIH MINTA AMPUN"
    return "KORBAN YANG MENYEDIHKAN"
  }

  const getPerformanceMessage = () => {
    if (!playerData) return "Jiwamu lenyap dalam kegelapan... tidak ada jejak yang tersisa..."
    const accuracy = playerData.total > 0 ? (playerData.correct / playerData.total) * 100 : 0

    if (playerData.perfect) return "Kamu tampil sangat sempurna!!"
    if (playerData.eliminated) return "Makhluk malam telah mengklaim dirimu... jeritanmu bergema di kehampaan..."
    if (accuracy >= 90) return "Kamu tampil sangat hebat "
    if (accuracy >= 70) return "Kamu cukup hebat"
    if (accuracy >= 60) return "Semangat mu tidak akan lepas dari bayanganmu... coba lagi"
    if (accuracy >= 50) return "Semangat mu tidak akan lepas dari bayanganmu... coba lagi"
    if (accuracy >= 40) return "Semangat mu tidak akan lepas dari bayanganmu... coba lagi"
    if (accuracy >= 30) return "Semangat mu tidak akan lepas dari bayanganmu... coba lagi"
    if (accuracy >= 20) return "Semangat mu tidak akan lepas dari bayanganmu... coba lagi"
    return "Kau hanyalah mangsa. Kegelapan menelammu tanpa usaha..."
  }

  const getActivityMessage = (activity: GameActivity) => {
    if (activity.activity_type === "completion") {
      const { correct_answers, final_health, is_eliminated, completion_type } = activity.activity_data
      if (is_eliminated) {
        return `${activity.player_nickname} Mati (${correct_answers}/${playerData?.total || 10} benar)`
      }
      if (completion_type === "completed") {
        return `${activity.player_nickname} Telah selesai bermain! (${correct_answers}/${playerData?.total || 10} benar, ${final_health} HP)`
      }
      return `${activity.player_nickname} Telah selesai bermain... (${correct_answers}/${playerData?.total || 10} benar, ${final_health} HP)`
    }
    if (activity.activity_type === "attack") {
  const { attack_type, attack_data, damage } = activity.activity_data;

  if (attack_type === "wrong_answer") {
    // Gunakan nullish coalescing untuk memberikan nilai default
    const questionIndex = attack_data?.question_index ?? -1;

    // Buat pesan yang berbeda tergantung apakah ada index atau tidak
    const questionMessage = questionIndex !== -1 ? ` pada pertanyaan ${questionIndex + 1}` : "";

    return `${activity.player_nickname} diserang zombie karena jawaban salah${questionMessage}! (-${damage} HP)`;
  }

  return `${activity.player_nickname} menderita serangan ${attack_type}! (-${damage} HP)`;
}
    return `${activity.player_nickname} TERKENA SERANGAN`
  }

  const getRandomCharacterGif = () => {
    return characterGifs[Math.floor(Math.random() * characterGifs.length)]
  }

  if (!playerData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/tombstone.png')] bg-no-repeat bg-center bg-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 via-black to-purple-900/10" />
        <div className="text-center z-10">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white font-mono text-xl mb-4 tracking-widest">KEHAMPAN BERJERIT DALAM SAKIT</p>
          <p className="text-red-400 font-mono text-sm mb-6">{error || "Data permainan tidak ditemukan"}</p>
          <Button 
            onClick={fetchInitialData} 
            className="bg-red-900 hover:bg-red-800 text-white font-mono border border-red-700"
          >
            PANGGIL KEMBALI ROH-ROH
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/images/dark-clouds.png')] opacity-30" />
      <div className="absolute inset-0 bg-[url('/images/fog-texture1.png')] opacity-15 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 via-black to-purple-900/10" />
      
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-red-900 rounded-full opacity-10 blur-xl" />
        <div className="absolute top-1/3 right-20 w-24 h-24 bg-red-900 rounded-full opacity-10 blur-xl" />
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-red-900 rounded-full opacity-10 blur-xl" />
        <div className="absolute bottom-1/3 right-1/4 w-20 h-20 bg-red-900 rounded-full opacity-10 blur-xl" />
      </div>

      <div className="absolute top-20 left-10 opacity-20">
        <Image src="/images/tombstone.png" width={80} height={80} alt="Nisan" />
      </div>
      <div className="absolute top-1/3 right-10 opacity-20">
        <Image src="/images/dead-tree.png" width={120} height={120} alt="Pohon mati" />
      </div>
      <div className="absolute bottom-20 left-20 opacity-20">
        <Image src="/images/spooky-tree-2.png" width={100} height={100} alt="Pohon seram" />
      </div>

      <div className="absolute inset-0">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 bg-red-900/50 rounded-full"
            initial={{
              x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== "undefined" ? window.innerHeight : 1000),
              opacity: 0,
            }}
            animate={{
              y: -100,
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              repeatType: "loop",
              delay: Math.random() * 5,
            } as Transition}
          />
        ))}
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center justify-center mb-6">
            <Skull className="w-8 h-8 text-red-500 mr-3 animate-pulse" />
            <h1 className="text-5xl font-bold text-white font-horror tracking-wider text-red-600 drop-shadow-[0_0_8px_rgba(255,0,0,0.7)]">
              Hasil Permainan
            </h1>
            <Skull className="w-8 h-8 text-red-500 ml-3 animate-pulse" />
          </div>
          <p className="text-gray-400 font-mono tracking-widest text-sm">Kode ruangan: {roomCode}</p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <p className="text-red-400 font-mono text-sm">{error}</p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <HorrorCard variant="blood" glowing animated className="max-w-2xl mx-auto mb-8">
            <div className="p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/4 w-1 h-16 bg-red-900/70" />
              <div className="absolute top-0 right-1/3 w-1 h-10 bg-red-900/70" />
              
              <div className="relative z-10">
                <h2 className="text-3xl font-bold text-white mb-2 font-horror tracking-wider text-red-500">
                  {getPerformanceTitle()}
                </h2>
                
                <p className="text-gray-300 mb-6 italic font-mono text-sm">
                  {getPerformanceMessage()}
                </p>

                <div className="mb-6 flex justify-center">
                  <Image 
                    src={getRandomCharacterGif()} 
                    width={120} 
                    height={120} 
                    alt="Karakter" 
                    className="rounded-full border-2 border-red-900"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-900/70 rounded-lg p-4 border border-red-900/50">
                    <Target className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white font-mono">{playerData.correct}</div>
                    <div className="text-xs text-gray-400 tracking-widest">BENAR</div>
                  </div>

                  <div className="bg-gray-900/70 rounded-lg p-4 border border-red-900/50">
                    <Heart className="w-6 h-6 text-red-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white font-mono">{playerData.health}</div>
                    <div className="text-xs text-gray-400 tracking-widest">NYAWA</div>
                  </div>

                  <div className="bg-gray-900/70 rounded-lg p-4 border border-red-900/50">
                    <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white font-mono">#{getPlayerRank()}</div>
                    <div className="text-xs text-gray-400 tracking-widest">PERINGKAT</div>
                  </div>

                  <div className="bg-gray-900/70 rounded-lg p-4 border border-red-900/50">
                    <Zap className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white font-mono">
                      {playerData.total > 0 ? Math.round((playerData.correct / playerData.total) * 100) : 0}%
                    </div>
                    <div className="text-xs text-gray-400 tracking-widest">AKURASI</div>
                  </div>
                </div>

                {/* <div className="mb-6">
                  <div className="flex justify-between text-xs text-gray-400 mb-2 tracking-widest">
                    <span>HARGA DARAH DIBAYAR</span>
                    <span>
                      {playerData.correct}/{playerData.total}
                    </span>
                  </div>
                  <Progress
                    value={playerData.total > 0 ? (playerData.correct / playerData.total) * 100 : 0}
                    className="h-2 bg-gray-900 border border-red-900/50"
                  />
                </div> */}
              </div>
            </div>
          </HorrorCard>
        </motion.div>

        {/* {roomStats && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <HorrorCard variant="shadow" className="max-w-4xl mx-auto mb-8">
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-4 font-horror tracking-wider flex items-center">
                  <Skull className="w-5 h-5 mr-2 text-red-500" />
                  INFORMASI RUANGAN
                  <Badge className="ml-2 bg-red-900 text-xs animate-pulse border border-red-700">LANGSUNG</Badge>
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="text-2xl font-bold text-blue-400 font-mono">{roomStats.total_players}</div>
                    <div className="text-xs text-gray-400 tracking-widest">JIWA YANG MASUK</div>
                  </div>

                  <div className="text-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="text-2xl font-bold text-green-400 font-mono">{roomStats.alive_players}</div>
                    <div className="text-xs text-gray-400 tracking-widest">MASIH HIDUP</div>
                  </div>

                  <div className="text-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="text-2xl font-bold text-red-400 font-mono">{roomStats.total_attacks}</div>
                    <div className="text-xs text-gray-400 tracking-widest">SERANGAN DILAKUKAN</div>
                  </div>

                  <div className="text-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="text-2xl font-bold text-yellow-400 font-mono">{roomStats.recent_attacks}</div>
                    <div className="text-xs text-gray-400 tracking-widest">PERTUMPAHAN DARAH TERAKHIR</div>
                  </div>

                  <div className="text-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="text-2xl font-bold text-purple-400 font-mono">{roomStats.average_health.toFixed(1)}</div>
                    <div className="text-xs text-gray-400 tracking-widest">RATA-RATA SISA DARAH PEMAIN</div>
                  </div>
                </div>
              </div>
            </HorrorCard>
          </motion.div>
        )} */}

        {playerStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <HorrorCard variant="curse" glowing className="max-w-4xl mx-auto mb-8">
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-4 font-horror tracking-wider flex items-center">
                  <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
                    URUTAN PEMENANG
                  {/* <Badge className="ml-2 bg-red-900 text-xs animate-pulse border border-red-700">LANGSUNG</Badge> */}
                </h3>

                <div className="space-y-2">
                  <AnimatePresence>
                    {playerStats.slice(0, 10).map((player, index) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 50 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          index === 0
                            ? "bg-yellow-900/20 border-yellow-800"
                            : index === 1
                              ? "bg-gray-800/20 border-gray-700"
                              : index === 2
                                ? "bg-orange-900/20 border-orange-800"
                                : "bg-gray-900/50 border-gray-800"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              index === 0
                                ? "bg-yellow-600 text-white"
                                : index === 1
                                  ? "bg-gray-600 text-white"
                                  : index === 2
                                    ? "bg-orange-600 text-white"
                                    : "bg-gray-700 text-gray-300"
                            }`}
                          >
                            {index + 1}
                          </div>

                          <div>
                            <div className="text-white font-mono tracking-wider">{player.nickname}</div>
                            <div className="text-xs text-gray-400">
                              {player.correct_answers} benar • {player.is_alive ? "🩸 MASIH HIDUP" : "💀 TEWAS"}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-bold text-white font-mono">{player.score}</div>
                          <div className="text-xs text-gray-400 tracking-widest">POIN JIWA</div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </HorrorCard>
          </motion.div>
        )}

        {recentActivities.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <HorrorCard variant="dark" className="max-w-4xl mx-auto mb-8">
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-4 font-horror tracking-wider flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-purple-400" />
                  INFO PEMAIN
                  {/* <Badge className="ml-2 bg-purple-900 text-xs animate-pulse border border-purple-700">Live</Badge> */}
                </h3>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  <AnimatePresence>
                    {recentActivities.map((activity, index) => (
                      <motion.div
                        key={`${activity.activity_type}-${activity.activity_time}-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg border border-gray-800"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              activity.activity_type === "completion"
                                ? activity.activity_data.is_eliminated
                                  ? "bg-red-500"
                                  : "bg-green-500"
                                : "bg-yellow-500"
                            } animate-pulse`}
                          />
                          <div>
                            <div className="text-white font-mono text-sm tracking-wider">
                              {getActivityMessage(activity)}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(activity.activity_time).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-xs text-gray-400">
                          {activity.activity_type === "completion" ? (
                            <span>❤️ {activity.activity_data.final_health} HP</span>
                          ) : (
                            <span>⚔️ {activity.activity_data.damage} DMG</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </HorrorCard>
          </motion.div>
        )}

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0 }}
        >
          <Button
            onClick={() => (window.location.href = "/")}
            className="bg-gray-900 hover:bg-gray-800 text-white font-mono tracking-wider flex items-center justify-center border border-gray-700"
          >
            <Home className="w-4 h-4 mr-2" />
            KEMBALI KE AMAN
          </Button>

          <Button
            onClick={() =>
              (window.location.href = `/game/${roomCode}?nickname=Survivor${Math.floor(Math.random() * 1000)}`)
            }
            className="bg-red-900 hover:bg-red-800 text-white font-mono tracking-wider flex items-center justify-center border border-red-700"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            HADAPI HOROR LAGI
          </Button>
        </motion.div>

        <motion.div 
          className="mt-12 text-center text-gray-500 text-xs font-mono tracking-widest"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
        >
          <p>MALAM TAK PERNAH BERAKHIR...</p>
          <p className="mt-1">JERITANMU AKAN DIKENANG</p>
        </motion.div>
      </div>
    </div>
  )
}
