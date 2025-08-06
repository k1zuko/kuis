"use client"

import { Heart, Skull, Zap, Shield, Crown, Eye } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface Player {
  id: string
  nickname: string
  health: number
  maxHealth: number
  score: number
  isHost?: boolean
  isReady?: boolean
  hasAnswered?: boolean
  status?: "alive" | "dead" | "spectating"
  powerUps?: string[]
}

interface SoulStatusProps {
  player: Player
  isCurrentPlayer?: boolean
  showDetailed?: boolean
  variant?: "compact" | "detailed" | "minimal"
  className?: string
}

export default function SoulStatus({
  player,
  isCurrentPlayer = false,
  showDetailed = false,
  variant = "compact",
  className,
}: SoulStatusProps) {
  const isDead = player.health <= 0 || player.status === "dead"
  const isLowHealth = player.health <= 1 && player.health > 0
  const healthPercentage = (player.health / player.maxHealth) * 100

  const getHealthColor = () => {
    if (isDead) return "text-gray-400"
    if (isLowHealth) return "text-red-600 animate-pulse"
    if (player.health <= 2) return "text-yellow-600"
    return "text-green-600"
  }

  const getStatusIcon = () => {
    if (isDead) return <Skull className="w-5 h-5 text-gray-400" />
    if (player.isHost) return <Crown className="w-5 h-5 text-yellow-600 animate-pulse" />
    if (isLowHealth) return <Heart className={`w-5 h-5 ${getHealthColor()} animate-throb`} />
    return <Eye className="w-5 h-5 text-red-500 animate-pulse" />
  }

  const getCardStyle = () => {
    if (isDead) return "bg-black/90 border-gray-800 shadow-[0_0_15px_rgba(100,0,0,0.5)]"
    if (isCurrentPlayer) return "bg-black/90 border-red-700/80 ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(255,0,0,0.7)]"
    if (isLowHealth) return "bg-black/90 border-red-900/80 shadow-[0_0_15px_rgba(255,0,0,0.5)]"
    return "bg-black/90 border-red-900/50 shadow-[0_0_10px_rgba(100,0,0,0.3)]"
  }

  // Blood drip effect component
  const BloodDrips = ({ count = 3 }: { count?: number }) => (
    <div className="absolute top-0 left-0 right-0 h-2 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="absolute h-4 w-1 bg-red-900/80"
          style={{
            left: `${10 + (i * 80 / count)}%`,
            height: `${4 + Math.random() * 8}px`,
            transform: 'translateY(-2px)'
          }}
        />
      ))}
    </div>
  )

  // Blood splatter effect
  const BloodSplatter = () => (
    <div className="absolute inset-0 pointer-events-none opacity-20">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute bg-red-900 rounded-full"
          style={{
            width: `${2 + Math.random() * 6}px`,
            height: `${2 + Math.random() * 6}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}
    </div>
  )

  if (variant === "minimal") {
    return (
      <div className={cn("flex items-center space-x-2 group", className)}>
        {getStatusIcon()}
        <span className={cn("font-mono text-sm font-bold", isDead ? "text-gray-500 line-through" : "text-red-400 group-hover:text-white transition-colors")}>
          {player.nickname}
        </span>
        <div className="flex space-x-1">
          {[...Array(player.maxHealth)].map((_, i) => (
            <Heart
              key={i}
              className={cn(
                "w-3 h-3 transition-all duration-300",
                i < player.health ? getHealthColor() : "text-gray-700",
                isLowHealth && i < player.health ? "animate-throb" : ""
              )}
              fill={i < player.health ? "currentColor" : "none"}
            />
          ))}
        </div>
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <Card className={cn(
        getCardStyle(),
        "backdrop-blur-sm transition-all duration-300 border-2 hover:border-red-600/80 relative overflow-hidden",
        isDead ? "hover:border-gray-600" : "",
        className
      )}>
        <BloodDrips />
        {isLowHealth && <BloodSplatter />}
        
        <div className="p-3 relative">
          {/* Blood pool effect for dead players */}
          {isDead && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-900/70" />
          )}

          {/* Low health warning effect */}
          {isLowHealth && (
            <div className="absolute inset-0 bg-gradient-to-b from-red-900/30 to-transparent animate-pulse" />
          )}

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <p className={cn(
                  "font-mono text-sm font-bold tracking-wider",
                  isDead ? "text-gray-400 line-through" : "text-red-200",
                  isCurrentPlayer ? "text-white" : ""
                )}>
                  {player.nickname}
                  {isCurrentPlayer && (
                    <span className="ml-2 text-xs bg-red-800 text-white px-1 py-0.5 rounded font-bold">YOU</span>
                  )}
                </p>
                {showDetailed && (
                  <p className="text-xs text-red-900 font-bold">Score: {player.score || 0}</p>
                )}
              </div>
            </div>

            {/* Health display */}
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                {[...Array(player.maxHealth)].map((_, i) => (
                  <Heart
                    key={i}
                    className={cn(
                      "w-4 h-4 transition-all duration-300",
                      i < player.health ? getHealthColor() : "text-gray-700",
                      isLowHealth && i < player.health ? "animate-throb" : ""
                    )}
                    fill={i < player.health ? "currentColor" : "none"}
                  />
                ))}
              </div>

              {/* Activity indicator */}
              <div className="flex space-x-1">
                {player.hasAnswered ? (
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                ) : player.status !== "dead" ? (
                  <div className="w-2 h-2 bg-yellow-600 rounded-full animate-pulse" />
                ) : (
                  <div className="w-2 h-2 bg-gray-700 rounded-full" />
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // Detailed variant
  return (
    <Card className={cn(
      getCardStyle(),
      "backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] relative overflow-hidden border-2",
      className
    )}>
      <BloodDrips count={5} />
      {(isLowHealth || isDead) && <BloodSplatter />}
      
      <div className="p-4 relative">
        {/* Blood pool effect for dead players */}
        {isDead && (
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-red-900/70 to-transparent" />
        )}

        {/* Low health warning effect */}
        {isLowHealth && (
          <div className="absolute inset-0 bg-gradient-to-b from-red-900/40 to-transparent animate-pulse" />
        )}

        <div className="relative z-10 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <p className={cn(
                  "font-mono text-lg font-bold tracking-wider",
                  isDead ? "text-gray-400 line-through" : "text-red-200",
                  isCurrentPlayer ? "text-white" : ""
                )}>
                  {player.nickname}
                </p>
                {isCurrentPlayer && (
                  <span className="text-xs bg-red-800 text-white px-2 py-1 rounded font-mono font-bold tracking-wider">
                    Saya
                  </span>
                )}
              </div>
            </div>

            {/* Status badges */}
            <div className="flex space-x-2">
              {player.isHost && (
                <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-1 rounded font-mono font-bold">
                  DEMON LORD
                </span>
              )}
              {isDead && (
                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono font-bold">
                  DEVOURED
                </span>
              )}
            </div>
          </div>

          {/* Health bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-900 font-mono font-bold tracking-wider">
                Jiwa
              </span>
              <span className={cn(
                "text-sm font-mono font-bold tracking-wider",
                getHealthColor()
              )}>
                {player.health}/{player.maxHealth}
              </span>
            </div>

            <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden border border-red-900/50">
              <div
                className={cn(
                  "h-full transition-all duration-500 rounded-full",
                  isDead
                    ? "bg-gray-600"
                    : isLowHealth
                      ? "bg-red-700 animate-pulse"
                      : player.health <= 2
                        ? "bg-yellow-600"
                        : "bg-green-700"
                )}
                style={{ width: `${healthPercentage}%` }}
              />
            </div>

            {/* Individual hearts */}
            <div className="flex justify-center space-x-1 pt-1">
              {[...Array(player.maxHealth)].map((_, i) => (
                <Heart
                  key={i}
                  className={cn(
                    "w-5 h-5 transition-all duration-300",
                    i < player.health ? getHealthColor() : "text-gray-700",
                    isLowHealth && i < player.health ? "animate-throb" : ""
                  )}
                  fill={i < player.health ? "currentColor" : "none"}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          {/* <div className="grid grid-cols-2 gap-4 pt-2 border-t border-red-900/50">
            <div className="text-center">
              <div className="text-lg font-bold text-white font-mono tracking-wider">
                {player.score || 0}
              </div>
              <div className="text-xs text-red-900 font-mono font-bold tracking-wider">
                SOULS TAKEN
              </div>
            </div>
            <div className="text-center">
              <div className="flex justify-center">
                {player.hasAnswered ? (
                  <Zap className="w-5 h-5 text-green-600 animate-pulse" />
                ) : player.status !== "dead" ? (
                  <Zap className="w-5 h-5 text-yellow-600 animate-pulse" />
                ) : (
                  <Skull className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="text-xs text-red-900 font-mono font-bold tracking-wider">
                {player.hasAnswered ? "HUNGERING" : isDead ? "CONSUMED" : "WAITING"}
              </div>
            </div>
          </div> */}

          {/* Power-ups */}
          {player.powerUps && player.powerUps.length > 0 && (
            <div className="pt-2 border-t border-red-900/50">
              <div className="text-xs text-red-900 font-mono font-bold mb-1 tracking-wider">
                CURSED RELICS:
              </div>
              <div className="flex space-x-1">
                {player.powerUps.map((powerUp, i) => (
                  <Shield key={i} className="w-4 h-4 text-purple-600" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}