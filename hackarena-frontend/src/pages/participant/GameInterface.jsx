import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Clock, 
  Trophy, 
  Users, 
  Lightbulb, 
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Medal,
  Target,
  BarChart3
} from 'lucide-react'
import socketManager from '../../utils/socket'
import CheatDetectionManager from '../../utils/cheatDetection'
import { api } from '../../utils/api'
import toast from 'react-hot-toast'

const GameInterface = () => {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  
  const [participant, setParticipant] = useState(null)
  const [gameState, setGameState] = useState('waiting') // waiting, active, ended
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answer, setAnswer] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const [hintUsed, setHintUsed] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [showAnswer, setShowAnswer] = useState(false)
  const [answerResult, setAnswerResult] = useState(null)
  const [cheatWarnings, setCheatWarnings] = useState(0)
  const [gameAnalytics, setGameAnalytics] = useState(null)
  const [socket, setSocket] = useState(null)
  const [cheatDetection, setCheatDetection] = useState(null)

  useEffect(() => {
    initializeGame()
    
    return () => {
      // Cleanup
      if (cheatDetection) {
        cheatDetection.stopMonitoring()
      }
      if (socket) {
        socket.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    let timer
    if (timeLeft > 0 && !submitted && gameState === 'active') {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            autoSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [timeLeft, submitted, gameState])

  const initializeGame = async () => {
    try {
      // Get session data
      const sessionToken = localStorage.getItem('hackarena_session')
      const participantData = localStorage.getItem('hackarena_participant')
      
      if (!sessionToken || !participantData) {
        toast.error('Session expired. Please join again.')
        navigate(`/join/${gameCode}`)
        return
      }

      const parsedParticipant = JSON.parse(participantData)
      setParticipant(parsedParticipant)

      // Try to rejoin if already in game
      await rejoinGame(sessionToken)

      // Setup socket connection
      const socketConnection = socketManager.connect()
      setSocket(socketConnection)

      // Setup cheat detection
      const cheatManager = new CheatDetectionManager((cheatData) => {
        socketConnection?.emit('cheatDetected', cheatData)
      })
      setCheatDetection(cheatManager)
      
      setupSocketListeners(socketConnection, parsedParticipant)
      
    } catch (error) {
      console.error('Failed to initialize game:', error)
      toast.error('Failed to connect to game')
    }
  }

  const rejoinGame = async (sessionToken) => {
    try {
      const response = await api.post('/participants/rejoin', {}, {
        headers: { 'x-session-token': sessionToken }
      })

      const { participant: updatedParticipant, currentQuestion: activeQuestion } = response.data
      setParticipant(updatedParticipant)

      if (activeQuestion) {
        setCurrentQuestion(activeQuestion)
        setGameState('active')
        setTimeLeft(Math.max(0, Math.floor((new Date(activeQuestion.question_ends_at) - new Date()) / 1000)))
      } else if (updatedParticipant.gameStatus === 'completed') {
        setGameState('ended')
        fetchAnalytics()
      }
    } catch (error) {
      console.error('Rejoin failed:', error)
    }
  }

  const setupSocketListeners = (socketConnection, participantData) => {
    // Join participant room
    socketConnection.emit('joinGameRoom', {
      gameCode,
      participantId: participantData.id,
      role: 'participant'
    })

    // Game started
    socketConnection.on('gameStarted', (data) => {
      setCurrentQuestion(data.question)
      setGameState('active')
      setTimeLeft(data.question.time_limit)
      setSubmitted(false)
      setAnswer('')
      setHintUsed(false)
      setShowHint(false)
      setShowAnswer(false)
      
      // Start cheat detection
      if (cheatDetection) {
        cheatDetection.startMonitoring()
      }
      
      toast.success('Game started! Good luck!')
    })

    // Next question
    socketConnection.on('nextQuestion', (data) => {
      setCurrentQuestion(data.question)
      setTimeLeft(data.question.time_limit)
      setSubmitted(false)
      setAnswer('')
      setHintUsed(false)
      setShowHint(false)
      setShowAnswer(false)
      setAnswerResult(null)
      
      toast.info('Next question!')
    })

    // Answer revealed
    socketConnection.on('answerRevealed', (data) => {
      setShowAnswer(true)
      setTimeout(() => {
        setShowAnswer(false)
      }, 5000)
    })

    // Leaderboard update
    socketConnection.on('leaderboardUpdate', (data) => {
      setLeaderboard(data)
      // Update participant rank
      const participantRank = data.find(p => p.name === participant?.name)
      if (participantRank && participant) {
        setParticipant(prev => ({
          ...prev,
          currentRank: participantRank.current_rank,
          totalScore: participantRank.total_score
        }))
      }
    })

    // Game ended
    socketConnection.on('gameEnded', () => {
      setGameState('ended')
      if (cheatDetection) {
        cheatDetection.stopMonitoring()
      }
      fetchAnalytics()
      toast.success('Game completed!')
    })

    // Cheat penalty
    socketConnection.on('cheatPenalty', (data) => {
      setCheatWarnings(data.warningCount)
      toast.error(data.message)
    })

    // Organizer warning
    socketConnection.on('organiserWarning', (data) => {
      toast.error(data.message)
    })

    // Eliminated
    socketConnection.on('eliminated', (data) => {
      toast.error(data.message)
      setTimeout(() => {
        localStorage.removeItem('hackarena_session')
        localStorage.removeItem('hackarena_participant')
        navigate('/')
      }, 3000)
    })

    // Time expired
    socketConnection.on('questionTimeExpired', () => {
      autoSubmit()
    })
  }

  const submitAnswer = async () => {
    if (submitted || !currentQuestion) return

    try {
      const sessionToken = localStorage.getItem('hackarena_session')
      const timeTaken = currentQuestion.time_limit - timeLeft
      
      const response = await api.post('/participants/answer', {
        questionId: currentQuestion.id,
        answer: answer.trim(),
        hintUsed,
        timeTaken
      }, {
        headers: { 'x-session-token': sessionToken }
      })

      setSubmitted(true)
      setAnswerResult(response.data)
      
      if (response.data.isCorrect) {
        toast.success(`Correct! +${response.data.scoreEarned} points`)
      } else {
        toast.error('Incorrect answer')
      }

    } catch (error) {
      console.error('Submit answer error:', error)
      toast.error('Failed to submit answer')
    }
  }

  const autoSubmit = () => {
    if (!submitted && currentQuestion) {
      submitAnswer()
    }
  }

  const useHint = () => {
    if (!hintUsed && currentQuestion?.hint) {
      setHintUsed(true)
      setShowHint(true)
      toast.info(`Hint revealed! -${currentQuestion.hint_penalty} points`)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const sessionToken = localStorage.getItem('hackarena_session')
      const response = await api.get('/participants/analytics', {
        headers: { 'x-session-token': sessionToken }
      })
      setGameAnalytics(response.data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const renderQuestionInput = () => {
    if (!currentQuestion) return null

    const questionType = currentQuestion.question_type

    switch (questionType) {
      case 'mcq':
        const options = JSON.parse(currentQuestion.options || '[]')
        return (
          <div className="space-y-3">
            {options.map((option, index) => (
              <label key={index} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="mcq-answer"
                  value={option}
                  checked={answer === option}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={submitted}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="font-medium text-gray-700">
                  {String.fromCharCode(65 + index)}.
                </span>
                <span className="text-gray-900">{option}</span>
              </label>
            ))}
          </div>
        )

      case 'truefalse':
        return (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center justify-center space-x-2 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="tf-answer"
                value="true"
                checked={answer === 'true'}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={submitted}
                className="w-4 h-4 text-primary-600"
              />
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">True</span>
            </label>
            <label className="flex items-center justify-center space-x-2 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="tf-answer"
                value="false"
                checked={answer === 'false'}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={submitted}
                className="w-4 h-4 text-primary-600"
              />
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium">False</span>
            </label>
          </div>
        )

      case 'code':
        return (
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={submitted}
            className="input w-full h-32 font-mono text-sm resize-none"
            placeholder="Write your code here..."
          />
        )

      case 'fill':
      case 'short':
      default:
        return (
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={submitted}
            className="input w-full"
            placeholder="Type your answer..."
          />
        )
    }
  }

  // Waiting screen
  if (gameState === 'waiting') {
    return (
      <div className="participant-interface min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="animate-bounce mb-8">
            {participant?.avatar && (
              <div className="text-6xl mb-4">{participant.avatar}</div>
            )}
            <Trophy className="h-16 w-16 text-yellow-300 mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">
            Welcome, {participant?.name}!
          </h1>
          <p className="text-blue-100 mb-8">
            Waiting for the game to start...
          </p>
          <div className="card p-6 bg-white/10 backdrop-blur-sm border-white/20">
            <div className="grid grid-cols-3 gap-4 text-center text-white">
              <div>
                <Users className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">Ready to compete</p>
              </div>
              <div>
                <Clock className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">Real-time scoring</p>
              </div>
              <div>
                <Trophy className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">Win prizes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Game ended screen
  if (gameState === 'ended') {
    return (
      <div className="participant-interface min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <Trophy className="h-16 w-16 text-yellow-300 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">Game Completed!</h1>
            <p className="text-blue-100">Here's how you performed</p>
          </div>

          {gameAnalytics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Final Stats */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Medal className="h-5 w-5 mr-2 text-yellow-500" />
                  Final Results
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Final Rank:</span>
                    <span className="font-bold text-primary-600">
                      #{gameAnalytics.participant.finalRank}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Score:</span>
                    <span className="font-bold text-green-600">
                      {gameAnalytics.participant.totalScore} points
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Accuracy:</span>
                    <span className="font-bold">
                      {gameAnalytics.stats.accuracy}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg. Time:</span>
                    <span className="font-bold">
                      {gameAnalytics.stats.averageTime}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Overview */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-blue-500" />
                  Performance Overview
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Correct Answers:</span>
                    <span className="font-bold text-green-600">
                      {gameAnalytics.stats.correctAnswers}/{gameAnalytics.stats.totalQuestions}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cheat Warnings:</span>
                    <span className={`font-bold ${gameAnalytics.participant.cheatWarnings > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {gameAnalytics.participant.cheatWarnings}
                    </span>
                  </div>
                </div>
              </div>

              {/* Question-wise Performance */}
              <div className="card p-6 md:col-span-2">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Target className="h-5 w-5 mr-2 text-purple-500" />
                  Question-wise Performance
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {gameAnalytics.answers.map((answer, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Question {index + 1}</span>
                        <span className={`flex items-center text-sm ${answer.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                          {answer.isCorrect ? (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-1" />
                          )}
                          {answer.scoreEarned}/{answer.maxScore} pts
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{answer.questionText}</p>
                      <div className="text-xs text-gray-500">
                        Your answer: <span className="font-medium">{answer.yourAnswer}</span>
                        <br />
                        Correct answer: <span className="font-medium">{answer.correctAnswer}</span>
                        <br />
                        Time taken: {answer.timeTaken}s
                        {answer.hintUsed && <span className="text-orange-500"> (Hint used)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => {
                localStorage.removeItem('hackarena_session')
                localStorage.removeItem('hackarena_participant')
                navigate('/')
              }}
              className="btn bg-white text-primary-600 hover:bg-gray-100"
            >
              Exit Game
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active game screen
  return (
    <div className="participant-interface min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="card p-4 mb-6 bg-white/10 backdrop-blur-sm border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl">{participant?.avatar}</div>
              <div className="text-white">
                <p className="font-semibold">{participant?.name}</p>
                <p className="text-sm text-blue-100">
                  Rank #{participant?.currentRank || 0} • {participant?.totalScore || 0} points
                </p>
              </div>
            </div>
            <div className="text-right text-white">
              <div className="flex items-center space-x-2 mb-1">
                <Clock className="h-4 w-4" />
                <span className={`font-mono text-lg ${timeLeft <= 10 ? 'text-red-300' : ''}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
              <p className="text-xs text-blue-100">Time remaining</p>
            </div>
          </div>
          
          {cheatWarnings > 0 && (
            <div className="mt-3 p-2 bg-red-500/20 border border-red-400/30 rounded-lg">
              <div className="flex items-center space-x-2 text-red-200">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  {cheatWarnings} warning{cheatWarnings > 1 ? 's' : ''} - Avoid suspicious activities
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Question */}
        {currentQuestion && (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-600">
                Question {currentQuestion.question_order}
              </h2>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {currentQuestion.question_type.toUpperCase()}
                </span>
                <span>{currentQuestion.marks} points</span>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              {currentQuestion.question_text}
            </h3>

            {/* Answer Input */}
            <div className="mb-6">
              {renderQuestionInput()}
            </div>

            {/* Hint */}
            {currentQuestion.hint && (
              <div className="mb-4">
                {!showHint ? (
                  <button
                    onClick={useHint}
                    disabled={hintUsed}
                    className="btn btn-secondary flex items-center"
                  >
                    <Lightbulb className="h-4 w-4 mr-2" />
                    {hintUsed ? 'Hint Used' : `Use Hint (-${currentQuestion.hint_penalty}pts)`}
                  </button>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-800">Hint:</p>
                        <p className="text-yellow-700">{currentQuestion.hint}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {submitted ? (
                  <span className="flex items-center text-green-600">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Answer submitted
                  </span>
                ) : (
                  <span>Answer quickly for more points!</span>
                )}
              </div>
              
              <button
                onClick={submitAnswer}
                disabled={submitted || !answer.trim()}
                className="btn btn-primary flex items-center"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitted ? 'Submitted' : 'Submit Answer'}
              </button>
            </div>

            {/* Answer Result */}
            {answerResult && (
              <div className={`mt-4 p-3 rounded-lg ${
                answerResult.isCorrect 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {answerResult.isCorrect ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    answerResult.isCorrect ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {answerResult.message}
                  </span>
                  {answerResult.isCorrect && (
                    <span className="text-green-600">
                      +{answerResult.scoreEarned} points
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Answer Reveal */}
        {showAnswer && currentQuestion && (
          <div className="card p-6 mb-6 border-green-200 bg-green-50">
            <h3 className="text-lg font-semibold text-green-800 mb-2">Correct Answer:</h3>
            <p className="text-green-700 font-medium mb-2">{currentQuestion.correct_answer}</p>
            {currentQuestion.explanation && (
              <p className="text-green-600 text-sm">{currentQuestion.explanation}</p>
            )}
          </div>
        )}

        {/* Mini Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
              Live Leaderboard
            </h3>
            <div className="space-y-2">
              {leaderboard.slice(0, 10).map((player, index) => (
                <div
                  key={index}
                  className={`flex items-center space-x-3 p-2 rounded ${
                    player.name === participant?.name ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                >
                  <span className="text-sm font-medium text-gray-500 w-6">
                    #{index + 1}
                  </span>
                  <span className="text-lg">{player.avatar}</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{player.name}</p>
                    <p className="text-sm text-gray-600">{player.total_score} points</p>
                  </div>
                  {player.name === participant?.name && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameInterface