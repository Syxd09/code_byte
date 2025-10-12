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
  BarChart3,
  Pause
} from 'lucide-react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/themes/prism.css'
import socketManager from '../../utils/socket'
import CheatDetectionManager from '../../utils/cheatDetection'
import { api } from '../../utils/api'
import toast from 'react-hot-toast'

const GameInterface = () => {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  
  const [participant, setParticipant] = useState(null)
  const [gameState, setGameState] = useState('waiting') // waiting, active, paused, ended
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
  const [isPaused, setIsPaused] = useState(false)

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
    if (timeLeft > 0 && !submitted && gameState === 'active' && !isPaused) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            console.log('Timer reached zero, triggering auto-submit')
            autoSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else if (timeLeft === 0 && !submitted && gameState === 'active' && !isPaused) {
      // Additional check in case timer wasn't running but time is 0
      console.log('Time is 0 and not submitted, triggering auto-submit as fallback')
      autoSubmit()
    }
    return () => clearInterval(timer)
  }, [timeLeft, submitted, gameState, isPaused])

  const initializeGame = async () => {
    try {
      console.log('🔄 Initializing game for participant...')

      // Get session data
      const sessionToken = localStorage.getItem('hackarena_session')
      const participantData = localStorage.getItem('hackarena_participant')

      console.log('📋 Session data check:', {
        hasSessionToken: !!sessionToken,
        hasParticipantData: !!participantData,
        gameCode
      })

      if (!sessionToken || !participantData) {
        console.log('❌ Session data missing, redirecting to join page')
        toast.error('Session expired. Please join again.')
        navigate(`/join/${gameCode}`)
        return
      }

      const parsedParticipant = JSON.parse(participantData)
      console.log('👤 Parsed participant data:', parsedParticipant)
      setParticipant(parsedParticipant)

      // Try to rejoin if already in game
      console.log('🔄 Attempting to rejoin game...')
      await rejoinGame(sessionToken)

      // Setup socket connection
      console.log('🔌 Connecting to socket...')
      const socketConnection = socketManager.connect()
      setSocket(socketConnection)

      console.log('🔌 Socket connection established:', socketConnection?.id)

      // Setup cheat detection
      const cheatManager = new CheatDetectionManager((cheatData) => {
        console.log('🚨 Cheat detected:', cheatData)
        socketConnection?.emit('cheatDetected', cheatData)
      })
      setCheatDetection(cheatManager)

      console.log('🎧 Setting up socket listeners...')
      setupSocketListeners(socketConnection, parsedParticipant)

      console.log('✅ Game initialization completed')

    } catch (error) {
      console.error('❌ Failed to initialize game:', error)
      toast.error('Failed to connect to game')
    }
  }

  const rejoinGame = async (sessionToken) => {
    try {
      console.log('🔄 Rejoining game with session token...')
      const response = await api.post('/participants/rejoin', {}, {
        headers: { 'x-session-token': sessionToken }
      })

      console.log('📥 Rejoin response:', response.data)
      const { participant: updatedParticipant, currentQuestion: activeQuestion } = response.data
      setParticipant(updatedParticipant)

      console.log('🎮 Game status from rejoin:', updatedParticipant.gameStatus)

      if (activeQuestion) {
        console.log('❓ Active question found during rejoin:', activeQuestion)
        setCurrentQuestion(activeQuestion)
        setGameState('active')

        // Check if answers are revealed
        const answersRevealed = activeQuestion.answers_revealed
        console.log('🔍 Answers revealed status:', answersRevealed)

        if (answersRevealed) {
          // If answers are revealed, show the answer immediately
          console.log('✅ Answers revealed, showing correct answer')
          setShowAnswer(true)
          setSubmitted(true) // Mark as submitted since answer is revealed
        } else {
          // Calculate time left only if answers not revealed
          const calculatedTimeLeft = Math.max(0, Math.floor((new Date(activeQuestion.question_ends_at) - new Date()) / 1000))
          console.log('⏱️ Rejoin - Question ends at:', activeQuestion.question_ends_at)
          console.log('⏱️ Rejoin - Current time:', new Date().toISOString())
          console.log('⏱️ Rejoin - Calculated time left:', calculatedTimeLeft)
          setTimeLeft(calculatedTimeLeft)
        }
      } else if (updatedParticipant.gameStatus === 'completed') {
        console.log('🏁 Game already completed during rejoin')
        setGameState('ended')
        fetchAnalytics()
      } else if (updatedParticipant.gameStatus === 'active') {
        console.log('⚠️ Game is active but no current question received - this might be the issue!')
        // Game is active but no question sent - participant should receive current question
        console.log('🔄 Game active but no question - staying in waiting state, expecting gameStarted event')
      } else {
        console.log('⏳ No active question during rejoin, staying in waiting state')
      }
    } catch (error) {
      console.error('❌ Rejoin failed:', error)
    }
  }

  const setupSocketListeners = (socketConnection, participantData) => {
    console.log('🎧 Setting up socket listeners for participant:', participantData.id)

    // Join participant room
    console.log('🏠 Joining game room with data:', {
      gameCode,
      participantId: participantData.id,
      role: 'participant'
    })
    socketConnection.emit('joinGameRoom', {
      gameCode,
      participantId: participantData.id,
      role: 'participant'
    })

    // Game started
    socketConnection.on('gameStarted', (data) => {
      console.log('🎮 Game started event received:', data)
      console.log('📊 Current game state before update:', gameState)

      setCurrentQuestion(data.question)
      setGameState('active')
      setTimeLeft(data.question.time_limit)
      setSubmitted(false)
      setAnswer('')
      setHintUsed(false)
      setShowHint(false)
      setShowAnswer(false)

      console.log('✅ Game state updated to active')
      console.log('⏱️ Time left set to:', data.question.time_limit)
      console.log('❓ Question data:', data.question)

      // Start cheat detection
      if (cheatDetection) {
        console.log('🛡️ Starting cheat detection')
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

      console.log('Next question - Time limit:', data.question.time_limit)
      console.log('Next question - Question data:', data.question)

      toast('Next question!')
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

    // Game paused
    socketConnection.on('gamePaused', () => {
      setIsPaused(true)
      toast.info('Game has been paused by the organizer')
    })

    // Game resumed
    socketConnection.on('gameResumed', () => {
      setIsPaused(false)
      toast.success('Game has been resumed!')
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
      setGameState('eliminated')
      if (cheatDetection) {
        cheatDetection.stopMonitoring()
      }
    })

    // Re-admitted
    socketConnection.on('reAdmitted', (data) => {
      toast.success(data.message)
      setGameState('waiting')
      // Re-enable cheat detection if game is active
      if (gameState === 'active' && cheatDetection) {
        cheatDetection.startMonitoring()
      }
    })

    // Time expired
    socketConnection.on('questionTimeExpired', () => {
      console.log('Received questionTimeExpired event from server')
      autoSubmit()
    })
  }

  const submitAnswer = async (isAutoSubmit = false) => {
    if (submitted || !currentQuestion) return

    try {
      const sessionToken = localStorage.getItem('hackarena_session')
      const timeTaken = currentQuestion.time_limit - timeLeft

      const payload = {
        questionId: currentQuestion.id,
        answer: answer.trim(),
        hintUsed,
        timeTaken,
        autoSubmit: isAutoSubmit
      }

      console.log('Submitting answer with payload:', payload)
      console.log('Session token present:', !!sessionToken)
      console.log('Current question:', currentQuestion)
      console.log('Time left on frontend:', timeLeft)
      console.log('Time taken calculated:', timeTaken)

      const response = await api.post('/participants/answer', payload, {
        headers: { 'x-session-token': sessionToken }
      })

      console.log('Submit answer response:', response.data)

      setSubmitted(true)
      setAnswerResult(response.data)

      if (response.data.isCorrect) {
        toast.success(`Correct! +${response.data.scoreEarned} points`)
      } else {
        toast.error('Incorrect answer')
      }

    } catch (error) {
      console.error('Submit answer error:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)

      // Handle time expired error specifically
      if (error.response?.data?.error === 'Question time has expired') {
        console.log('Time expired error received, forcing auto-submit')
        setSubmitted(true)
        setAnswerResult({
          isCorrect: false,
          scoreEarned: 0,
          message: 'Time expired - answer submitted automatically'
        })
        toast.error('Time expired - answer submitted automatically')
        return
      }

      toast.error('Failed to submit answer')
    }
  }

  const autoSubmit = () => {
    if (!submitted && currentQuestion) {
      console.log('Auto-submitting answer due to time expiry')
      // Force submit with current answer or blank if empty
      const answerToSubmit = answer.trim() || ''
      console.log('Auto-submit - Answer to submit:', answerToSubmit)

      // Temporarily modify answer state for submission
      const originalAnswer = answer
      setAnswer(answerToSubmit)

      // Submit after state update
      setTimeout(() => {
        submitAnswer(true)
        // Restore original answer after submission attempt
        setTimeout(() => setAnswer(originalAnswer), 100)
      }, 0)
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

  const validateLanguage = (lang) => {
    const validLanguages = ['javascript', 'python', 'java', 'cpp']
    return validLanguages.includes(lang) ? lang : 'javascript'
  }

  const getLanguageHighlight = (lang = 'javascript') => {
    const validLang = validateLanguage(lang)
    switch (validLang) {
      case 'javascript': return Prism.languages.javascript
      case 'python': return Prism.languages.python
      case 'java': return Prism.languages.java
      case 'cpp': return Prism.languages.cpp
      default: return Prism.languages.javascript
    }
  }

  const renderQuestionInput = () => {
    if (!currentQuestion) return null

    const questionType = currentQuestion.question_type

    switch (questionType) {
      case 'mcq':
        let options = []
        if (Array.isArray(currentQuestion.options)) {
          // Options is already an array, use it directly
          options = currentQuestion.options
        } else if (typeof currentQuestion.options === 'string') {
          // Options is a string, try to parse it
          try {
            options = JSON.parse(currentQuestion.options || '[]')
            if (!Array.isArray(options)) {
              options = []
            }
          } catch (error) {
            console.error('Invalid options JSON for MCQ question:', currentQuestion.options, error)
            // Fallback: try to split by comma if it's a comma-separated string
            if (currentQuestion.options.trim()) {
              options = currentQuestion.options.split(',').map(opt => opt.trim()).filter(opt => opt)
            } else {
              options = []
            }
          }
        } else {
          // Options is neither array nor string, use empty array
          options = []
        }
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
        const evaluationMode = currentQuestion.evaluation_mode || 'mcq';
        const codeLanguage = currentQuestion.code_language || 'javascript';
        let placeholder = "Write your code here...";

        if (evaluationMode === 'textarea') {
          placeholder = "Write your code solution. AI will evaluate semantic correctness...";
        } else if (evaluationMode === 'compiler') {
          placeholder = "Write your code. It will be tested against provided test cases...";
        } else if (evaluationMode === 'ide') {
          placeholder = "Write your complete solution...";
        } else if (evaluationMode === 'bugfix') {
          placeholder = "Fix the buggy code above...";
        } else {
          placeholder = "Write your code here...";
        }

        // Display code snippet for MCQ mode
        if (evaluationMode === 'mcq' && currentQuestion.code_snippet) {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code Snippet ({codeLanguage}):
                </label>
                <div className="bg-gray-100 p-4 rounded-lg border">
                  <Editor
                    value={currentQuestion.code_snippet}
                    readOnly={true}
                    highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                    padding={15}
                    style={{
                      fontFamily: '"Inconsolata", "Monaco", monospace',
                      fontSize: 14,
                      backgroundColor: 'transparent',
                      border: 'none',
                      minHeight: '120px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Answer Options:
                </label>
                <div className="space-y-3">
                  {(() => {
                    let options = []
                    if (Array.isArray(currentQuestion.options)) {
                      options = currentQuestion.options
                    } else if (typeof currentQuestion.options === 'string') {
                      try {
                        options = JSON.parse(currentQuestion.options || '[]')
                        if (!Array.isArray(options)) {
                          options = []
                        }
                      } catch (error) {
                        console.error('Invalid options JSON for code MCQ question:', currentQuestion.options, error)
                        options = []
                      }
                    }
                    return options.map((option, index) => (
                      <label key={index} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="radio"
                          name="code-mcq-answer"
                          value={option}
                          checked={answer === option}
                          onChange={(e) => setAnswer(e.target.value)}
                          disabled={submitted}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="font-medium text-gray-700">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        <div className="flex-1">
                          <Editor
                            value={option}
                            readOnly={true}
                            highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                            padding={10}
                            style={{
                              fontFamily: '"Inconsolata", "Monaco", monospace',
                              fontSize: 12,
                              backgroundColor: 'transparent',
                              border: 'none',
                              minHeight: '60px'
                            }}
                          />
                        </div>
                      </label>
                    ))
                  })()}
                </div>
              </div>
            </div>
          )
        }

        // Display buggy code for bugfix mode
        if (evaluationMode === 'bugfix' && currentQuestion.bug_fix_code) {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buggy Code ({codeLanguage}):
                </label>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <Editor
                    value={currentQuestion.bug_fix_code}
                    readOnly={true}
                    highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                    padding={15}
                    style={{
                      fontFamily: '"Inconsolata", "Monaco", monospace',
                      fontSize: 14,
                      backgroundColor: 'transparent',
                      border: 'none',
                      minHeight: '150px'
                    }}
                  />
                </div>
                {currentQuestion.bug_fix_instructions && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Instructions:</strong> {currentQuestion.bug_fix_instructions}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Fixed Code:
                </label>
                <Editor
                  value={answer}
                  onValueChange={(code) => setAnswer(code)}
                  highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                  padding={15}
                  disabled={submitted}
                  style={{
                    fontFamily: '"Inconsolata", "Monaco", monospace',
                    fontSize: 14,
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    minHeight: '200px'
                  }}
                  placeholder={placeholder}
                />
              </div>
            </div>
          )
        }

        // IDE mode with optional template
        if (evaluationMode === 'ide') {
          return (
            <div className="space-y-4">
              {currentQuestion.ide_template && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Starter Template ({codeLanguage}):
                  </label>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <Editor
                      value={currentQuestion.ide_template}
                      readOnly={true}
                      highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                      padding={15}
                      style={{
                        fontFamily: '"Inconsolata", "Monaco", monospace',
                        fontSize: 14,
                        backgroundColor: 'transparent',
                        border: 'none',
                        minHeight: '120px'
                      }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Solution ({codeLanguage}):
                </label>
                <Editor
                  value={answer}
                  onValueChange={(code) => setAnswer(code)}
                  highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
                  padding={15}
                  disabled={submitted}
                  style={{
                    fontFamily: '"Inconsolata", "Monaco", monospace',
                    fontSize: 14,
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    minHeight: '250px'
                  }}
                  placeholder={placeholder}
                />
              </div>
            </div>
          )
        }

        // Default code editor for other modes
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Code Solution ({codeLanguage}):
            </label>
            <Editor
              value={answer}
              onValueChange={(code) => setAnswer(code)}
              highlight={(code) => Prism.highlight(code, getLanguageHighlight(codeLanguage))}
              padding={15}
              disabled={submitted}
              style={{
                fontFamily: '"Inconsolata", "Monaco", monospace',
                fontSize: 14,
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                minHeight: '200px'
              }}
              placeholder={placeholder}
            />
            {evaluationMode === 'textarea' && (
              <p className="text-xs text-gray-500 mt-1">
                💡 AI will evaluate your code for semantic correctness, not just exact matching.
              </p>
            )}
            {evaluationMode === 'compiler' && (
              <p className="text-xs text-gray-500 mt-1">
                🧪 Your code will be tested against multiple test cases for correctness and efficiency.
              </p>
            )}
          </div>
        )

      case 'fill':
      case 'short':
      case 'image':
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

      case 'crossword':
        return (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-2">
              Fill in the crossword answers in the format: 1A:WORD,2D:WORD,...
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitted}
              className="input w-full h-32 resize-none"
              placeholder="1A:EXAMPLE,2D:TEST,..."
            />
            {currentQuestion.crossword_clues && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-2">Clues:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {(() => {
                    let clues = {}
                    try {
                      clues = JSON.parse(currentQuestion.crossword_clues)
                      if (typeof clues !== 'object' || clues === null) {
                        clues = {}
                      }
                    } catch (error) {
                      console.error('Invalid crossword_clues JSON:', currentQuestion.crossword_clues, error)
                      clues = {}
                    }
                    return Object.entries(clues).map(([clueNum, clueData]) => (
                      <div key={clueNum} className="flex">
                        <span className="font-medium w-12">{clueNum}:</span>
                        <span>{clueData?.clue || 'No clue available'}</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        )

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

  // Eliminated screen
  if (gameState === 'eliminated') {
    return (
      <div className="participant-interface min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="animate-pulse mb-8">
            {participant?.avatar && (
              <div className="text-6xl mb-4">{participant.avatar}</div>
            )}
            <XCircle className="h-16 w-16 text-red-400 mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">
            Eliminated
          </h1>
          <p className="text-blue-100 mb-8">
            You have been eliminated from the game by the organizer.
          </p>
          <div className="card p-6 bg-white/10 backdrop-blur-sm border-white/20">
            <p className="text-white text-sm">
              Waiting for the organizer to re-admit you or for the game to end...
            </p>
          </div>
        </div>
      </div>
    )
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
                          {answer.timeBonus > 0 && (
                            <span className="text-blue-500 ml-1">(+{answer.timeBonus} time bonus)</span>
                          )}
                          {answer.partialScore > 0 && (
                            <span className="text-orange-500 ml-1">(+{answer.partialScore} partial)</span>
                          )}
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

          <div className="text-center mt-8 space-x-4">
            <button
              onClick={() => navigate('/analytics')}
              className="btn btn-primary"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Detailed Analytics
            </button>
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

          {isPaused && (
            <div className="mt-3 p-4 bg-yellow-500/20 border border-yellow-400/30 rounded-lg">
              <div className="flex items-center justify-center space-x-2 text-yellow-200">
                <Pause className="h-5 w-5" />
                <span className="text-lg font-semibold">Game Paused</span>
              </div>
              <p className="text-center text-yellow-100 mt-2">The organizer has paused the game. Please wait for it to resume.</p>
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

            {/* Display image for image-based questions */}
            {currentQuestion.question_type === 'image' && currentQuestion.image_url && (
              <div className="mb-6">
                <img
                  src={`http://localhost:3001${currentQuestion.image_url}`}
                  alt="Question"
                  className="max-w-full h-64 object-contain border rounded-lg shadow-sm"
                />
              </div>
            )}

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
                  <span>
                    {currentQuestion?.time_decay_enabled
                      ? 'Answer quickly for exponential time bonus!'
                      : 'Answer quickly for more points!'
                    }
                  </span>
                )}
              </div>

              <button
                onClick={() => submitAnswer()}
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
                      {answerResult.timeBonus > 0 && (
                        <span className="text-blue-500 ml-1">(+{answerResult.timeBonus} time bonus)</span>
                      )}
                      {answerResult.partialScore > 0 && (
                        <span className="text-orange-500 ml-1">(+{answerResult.partialScore} partial)</span>
                      )}
                    </span>
                  )}
                  {!answerResult.isCorrect && answerResult.partialScore > 0 && (
                    <span className="text-orange-600">
                      +{answerResult.partialScore} partial points
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