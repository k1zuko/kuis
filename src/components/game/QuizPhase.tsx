
"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Skull, Zap, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import ZombieFeedback from "./ZombieFeedback";

interface QuizPhaseProps {
  room: any;
  gameState: any;
  currentPlayer: any;
  players: any[];
  gameLogic: any;
  isSoloMode: boolean;
  wrongAnswers: number;
  resumeState?: {
    health: number;
    correctAnswers: number;
    currentIndex: number;
    speed?: number;
    isResuming: boolean;
  };
}

export default function QuizPhase({
  room,
  gameState,
  currentPlayer,
  players,
  gameLogic,
  isSoloMode,
  wrongAnswers,
  resumeState,
}: QuizPhaseProps) {
  const router = useRouter();
  const params = useParams();
  const roomCode = params.roomCode as string;

  const [timeLeft, setTimeLeft] = useState(300);
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [playerHealth, setPlayerHealth] = useState(resumeState?.health || 3);
  const [playerSpeed, setPlayerSpeed] = useState(resumeState?.speed || 20);
  const [correctAnswers, setCorrectAnswers] = useState(resumeState?.correctAnswers || 0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const questions = room?.questions || [];
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];

  const pulseIntensity = timeLeft <= 30 ? (31 - timeLeft) / 30 : 0;
  const FEEDBACK_DURATION = 1000;

  const getDangerLevel = () => {
    if (playerHealth <= 1) return 3;
    if (playerHealth <= 2) return 2;
    return 1;
  };

  const dangerLevel = getDangerLevel();

  const saveGameCompletion = async (
    finalHealth: number,
    finalCorrect: number,
    totalAnswered: number,
    isEliminated = false
  ) => {
    try {
      const { error } = await supabase.from("game_completions").insert({
        player_id: currentPlayer.id,
        room_id: room.id,
        final_health: finalHealth,
        correct_answers: finalCorrect,
        total_questions_answered: totalAnswered,
        is_eliminated: isEliminated,
        completion_type: isEliminated ? "eliminated" : finalCorrect === totalQuestions ? "completed" : "partial",
        completed_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Gagal menyimpan penyelesaian permainan:", error);
      } else {
        console.log("Penyelesaian permainan berhasil disimpan");
      }
    } catch (error) {
      console.error("Error di saveGameCompletion:", error);
    }
  };

  const saveAnswerAndUpdateHealth = async (answer: string, isCorrectAnswer: boolean) => {
    try {
      setIsProcessingAnswer(true);

      const newSpeed = isCorrectAnswer ? Math.min(playerSpeed + 5, 100) : playerSpeed; // Cap speed at 100
      console.log(`Menyimpan jawaban: isCorrect=${isCorrectAnswer}, speed=${newSpeed}`);

      const { error: answerError } = await supabase.from("player_answers").insert({
        player_id: currentPlayer.id,
        room_id: room.id,
        question_index: currentQuestionIndex,
        answer: answer,
        is_correct: isCorrectAnswer,
        speed: newSpeed,
      });

      if (answerError) {
        console.error("Gagal menyimpan jawaban:", answerError);
        return false;
      }

      setInactivityCountdown(null); // Reset inactivity countdown on answer

      if (isCorrectAnswer) {
        const { data: speedResult, error: speedError } = await supabase.rpc("handle_correct_answer_speed", {
          p_player_id: currentPlayer.id,
          p_room_id: room.id,
          p_question_index: currentQuestionIndex,
          p_answer: answer,
        });

        if (speedError) {
          console.error("Gagal menangani kecepatan untuk jawaban benar:", speedError);
          return false;
        }

        console.log("Hasil kecepatan dari RPC:", speedResult);

        if (speedResult) {
          setPlayerSpeed(speedResult.new_speed);
          setPlayerHealth(speedResult.new_health);
          return speedResult;
        }
      } else {
        const { data: attackResult, error: attackError } = await supabase.rpc("handle_wrong_answer_attack", {
          p_player_id: currentPlayer.id,
          p_room_id: room.id,
          p_question_index: currentQuestionIndex,
          p_answer: answer,
          p_player_nickname: currentPlayer.nickname,
        });

        if (attackError) {
          console.error("Gagal menangani serangan:", attackError);
          return false;
        }

        console.log("Hasil serangan:", attackResult);

        if (attackResult) {
          setPlayerSpeed(attackResult.new_speed);
          setPlayerHealth(attackResult.new_health);
          return attackResult;
        }
      }

      return true;
    } catch (error) {
      console.error("Error di saveAnswerAndUpdateHealth:", error);
      return false;
    } finally {
      setIsProcessingAnswer(false);
    }
  };

  const syncHealthAndSpeedFromDatabase = async () => {
    if (!room?.id || !currentPlayer?.id) {
      console.log("⚠️ room or currentPlayer is null, skipping sync");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_player_health", {
        p_player_id: currentPlayer.id,
        p_room_id: room.id,
      });

      if (error) {
        console.error("Gagal mendapatkan kesehatan pemain:", error);
        return;
      }

      if (data !== null && data !== playerHealth) {
        console.log(`Kesehatan disinkronkan dari ${playerHealth} ke ${data}`);
        setPlayerHealth(data);
      }

      const { data: speedData, error: speedError } = await supabase
        .from("player_health_states")
        .select("speed, last_answer_time")
        .eq("player_id", currentPlayer.id)
        .eq("room_id", room.id)
        .single();

      if (speedError) {
        console.error("Gagal mendapatkan kecepatan pemain:", speedError);
        return;
      }

      if (speedData && speedData.speed !== playerSpeed) {
        console.log(`Kecepatan disinkronkan dari ${playerSpeed} ke ${speedData.speed}`);
        setPlayerSpeed(speedData.speed);
      }
    } catch (error) {
      console.error("Error saat sinkronisasi kesehatan dan kecepatan:", error);
    }
  };

  const checkInactivityPenalty = async () => {
    if (!room?.id || !currentPlayer?.id || playerHealth <= 0 || isProcessingAnswer) {
      console.log("⚠️ Skipping inactivity penalty check: invalid room, player, eliminated, or processing answer");
      setInactivityCountdown(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("player_health_states")
        .select("last_answer_time, speed")
        .eq("player_id", currentPlayer.id)
        .eq("room_id", room.id)
        .single();

      if (error) {
        console.error("Gagal memeriksa ketidakaktifan:", error);
        setInactivityCountdown(null);
        return;
      }

      const lastAnswerTime = new Date(data.last_answer_time).getTime();
      const currentTime = Date.now();
      const timeSinceLastAnswer = (currentTime - lastAnswerTime) / 1000;

      console.log(`🕒 Pemeriksaan ketidakaktifan: timeSinceLastAnswer=${timeSinceLastAnswer}s, speed=${data.speed}`);

      if (timeSinceLastAnswer >= 0 && timeSinceLastAnswer < 10 && data.speed > 20) {
        const countdown = Math.ceil(10 - timeSinceLastAnswer);
        console.log(`⏲️ Memulai countdown penalti: ${countdown}s`);
        setInactivityCountdown(countdown);
      } else if (timeSinceLastAnswer >= 10 && data.speed > 20) {
        const newSpeed = Math.max(20, data.speed - 10);
        console.log(`⚠️ Pemain tidak aktif selama ${timeSinceLastAnswer}s, kecepatan dikurangi dari ${data.speed} ke ${newSpeed}`);
        await supabase
          .from("player_health_states")
          .update({ speed: newSpeed, last_answer_time: new Date().toISOString() })
          .eq("player_id", currentPlayer.id)
          .eq("room_id", room.id);
        setPlayerSpeed(newSpeed);
        setInactivityCountdown(null);
      } else {
        if (inactivityCountdown !== null) {
          console.log("🔄 Menghapus countdown penalti karena pemain aktif atau kecepatan <= 20");
          setInactivityCountdown(null);
        }
      }
    } catch (error) {
      console.error("Error di checkInactivityPenalty:", error);
      setInactivityCountdown(null);
    }
  };

  const redirectToResults = (
    health: number,
    correct: number,
    total: number,
    isEliminated = false,
    isPerfect = false
  ) => {
    console.log(
      `Mengalihkan ke hasil: health=${health}, correct=${correct}, total=${total}, eliminated=${isEliminated}, perfect=${isPerfect}`
    );

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    saveGameCompletion(health, correct, total, isEliminated).then(() => {
      const urlParams = new URLSearchParams({
        health: health.toString(),
        correct: correct.toString(),
        total: total.toString(),
        nickname: encodeURIComponent(currentPlayer.nickname),
        ...(isEliminated && { eliminated: "true" }),
        ...(isPerfect && { perfect: "true" }),
      });

      router.push(`/game/${roomCode}/results?${urlParams.toString()}`);
    });
  };

  useEffect(() => {
    syncHealthAndSpeedFromDatabase();
    const syncInterval = setInterval(syncHealthAndSpeedFromDatabase, 2000);
    return () => clearInterval(syncInterval);
  }, [currentPlayer.id, room.id]);

  useEffect(() => {
    const penaltyInterval = setInterval(checkInactivityPenalty, 1000);
    return () => clearInterval(penaltyInterval);
  }, [currentPlayer.id, room.id, playerHealth, isProcessingAnswer]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (playerHealth <= 0) {
      console.log("Pemain tereliminasi, mengalihkan ke hasil");
      setShowFeedback(false);
      redirectToResults(0, correctAnswers, currentQuestionIndex + 1, true);
    }
  }, [playerHealth, correctAnswers, currentQuestionIndex]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (timeLeft > 0 && playerHealth > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            console.log("Waktu habis, mengalihkan ke hasil");
            setIsAnswered(true);
            saveGameCompletion(playerHealth, correctAnswers, currentQuestionIndex, playerHealth <= 0).then(() => {
              redirectToResults(playerHealth, correctAnswers, currentQuestionIndex, playerHealth <= 0);
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timeLeft, playerHealth, correctAnswers, currentQuestionIndex]);

  useEffect(() => {
    if (showFeedback) {
      const feedbackTimer = setTimeout(() => {
        setShowFeedback(false);
        if (playerHealth <= 0) {
          console.log("Pemain tereliminasi selama feedback, mengalihkan ke hasil");
          redirectToResults(0, correctAnswers, currentQuestionIndex + 1, true);
        } else if (currentQuestionIndex + 1 >= totalQuestions) {
          console.log("Semua pertanyaan dijawab, mengalihkan ke hasil");
          redirectToResults(playerHealth, correctAnswers, totalQuestions, false, correctAnswers === totalQuestions);
        } else {
          nextQuestion();
        }
      }, FEEDBACK_DURATION);
      return () => clearTimeout(feedbackTimer);
    }
  }, [showFeedback, playerHealth, correctAnswers, currentQuestionIndex]);

  const nextQuestion = () => {
    setCurrentQuestionIndex(currentQuestionIndex + 1);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setIsCorrect(null);
  };

  const handleAnswerSelect = async (answer: string) => {
    if (isAnswered || !currentQuestion || isProcessingAnswer) return;

    setSelectedAnswer(answer);
    setIsAnswered(true);

    if (answer === currentQuestion.correct_answer) {
      await handleCorrectAnswer();
    } else {
      await handleWrongAnswer();
    }
  };

  const handleCorrectAnswer = async () => {
    if (isProcessingAnswer) return;

    const newCorrectAnswers = correctAnswers + 1;
    setCorrectAnswers(newCorrectAnswers);
    setIsCorrect(true);
    setShowFeedback(true);

    await saveAnswerAndUpdateHealth(selectedAnswer || "", true);
  };

  const handleWrongAnswer = async () => {
    if (isProcessingAnswer) return;

    setIsCorrect(false);
    setShowFeedback(true);

    await saveAnswerAndUpdateHealth(selectedAnswer || "TIME_UP", false);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const getAnswerButtonClass = (option: string) => {
    if (!isAnswered) {
      return "bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-red-500 text-white hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]";
    }

    if (option === currentQuestion?.correct_answer) {
      return "bg-green-600 border-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]";
    }

    if (option === selectedAnswer && option !== currentQuestion?.correct_answer) {
      return "bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)]";
    }

    return "bg-gray-700 border-gray-600 text-gray-400";
  };

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Skull className="w-16 h-16 text-red-500 mx-auto mb-4 animate-pulse" />
          <p className="text-white font-mono text-xl">Memuat pertanyaan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          dangerLevel === 3
            ? "bg-gradient-to-br from-red-900/40 via-black to-red-950/40"
            : dangerLevel === 2
            ? "bg-gradient-to-br from-red-950/25 via-black to-purple-950/25"
            : "bg-gradient-to-br from-red-950/15 via-black to-purple-950/15"
        }`}
        style={{
          opacity: 0.3 + pulseIntensity * 0.4,
          filter: `hue-rotate(${pulseIntensity * 30}deg)`,
        }}
      />

      {isClient && (timeLeft <= 30 || dangerLevel >= 2) && (
        <div className="absolute inset-0">
          {[...Array(Math.floor((pulseIntensity + dangerLevel) * 5))].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-red-500 rounded-full animate-ping opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 1}s`,
                animationDuration: `${0.8 + Math.random() * 1}s`,
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {inactivityCountdown !== null && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-900/90 text-white font-mono text-lg px-6 py-3 rounded-lg shadow-lg border border-red-500/50 animate-pulse"
          >
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-yellow-300 animate-bounce" />
              <span>Peringatan: Tidak aktif! Penalti kecepatan dalam {inactivityCountdown}s</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 container mx-auto px-4 py-8 pb-24">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <Skull className="w-8 h-8 text-red-500 mr-3 animate-pulse" />
            <h1 className="text-3xl font-bold text-white font-mono tracking-wider">UJIAN KEGELAPAN</h1>
            <Skull className="w-8 h-8 text-red-500 ml-3 animate-pulse" />
          </div>

          <div className="max-w-md mx-auto mb-4">
            <div className="flex items-center justify-center space-x-4 mb-2">
              <span className="text-white font-mono text-lg">
                Pertanyaan {currentQuestionIndex + 1} dari {totalQuestions}
              </span>
            </div>
            <Progress value={((currentQuestionIndex + 1) / totalQuestions) * 100} className="h-2 bg-gray-800" />
          </div>

          <div className="max-w-md mx-auto mb-6">
            <div className="flex items-center justify-center space-x-4 mb-3">
              <Clock className={`w-6 h-6 ${timeLeft <= 30 ? "text-red-500 animate-pulse" : "text-yellow-500"}`} />
              <span
                className={`text-2xl font-mono font-bold ${timeLeft <= 30 ? "text-red-500 animate-pulse" : "text-white"}`}
              >
                {formatTime(timeLeft)}
              </span>
              {timeLeft <= 15 && <AlertTriangle className="w-6 h-6 text-red-500 animate-bounce" />}
            </div>
            <Progress value={(timeLeft / 300) * 100} className="h-3 bg-gray-800" />
          </div>

          <div className="flex items-center justify-center space-x-4 mb-4">
            <span className="text-white font-mono">Nyawa:</span>
            <div className="flex space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                    i < playerHealth
                      ? playerHealth <= 1
                        ? "bg-red-500 border-red-400 animate-pulse"
                        : "bg-green-500 border-green-400"
                      : "bg-gray-600 border-gray-500"
                  }`}
                />
              ))}
            </div>
            <span className="text-white font-mono">Kecepatan: {playerSpeed}</span>
            <span className="text-gray-400 font-mono text-sm">Benar: {correctAnswers}</span>
            {isProcessingAnswer && (
              <span className="text-yellow-400 font-mono text-xs animate-pulse">Memproses...</span>
            )}
          </div>
        </div>

        <Card className="max-w-4xl mx-auto mb-8 bg-gray-900/90 border-red-900/50 backdrop-blur-sm">
          <div className="p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-purple-500/5" />
            <div className="relative z-10">
              {currentQuestion.question_type === "IMAGE" && currentQuestion.image_url && (
                <div className="mb-4 text-center">
                  <img
                    src={currentQuestion.image_url}
                    alt={currentQuestion.question_text}
                    className="max-w-xs max-h-48 mx-auto rounded-lg"
                  />
                </div>
              )}

              <div className="flex items-start space-x-4 mb-8">
                <Zap className="w-8 h-8 text-purple-500 animate-pulse flex-shrink-0 mt-1" />
                <h2 className="text-2xl font-bold text-white leading-relaxed">{currentQuestion.question_text}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option: string, index: number) => (
                  <Button
                    key={index}
                    onClick={() => handleAnswerSelect(option)}
                    disabled={isAnswered || isProcessingAnswer}
                    className={`${getAnswerButtonClass(option)} p-6 text-left justify-start font-mono text-lg border-2 transition-all duration-300 relative overflow-hidden group ${
                      isProcessingAnswer ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="flex items-center space-x-3 relative z-10">
                      <span className="w-8 h-8 rounded-full border-2 border-current flex-items-center justify-center text-sm font-bold">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span>{option}</span>
                      {isAnswered && option === currentQuestion.correct_answer && (
                        <CheckCircle className="w-5 h-5 ml-auto animate-pulse" />
                      )}
                      {isAnswered && option === selectedAnswer && option !== currentQuestion.correct_answer && (
                        <XCircle className="w-5 h-5 ml-auto animate-pulse" />
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <ZombieFeedback isCorrect={isCorrect} isVisible={showFeedback} />
    </div>
  );
}
