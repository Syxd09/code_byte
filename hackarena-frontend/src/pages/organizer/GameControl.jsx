import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Users, 
  Play, 
  Pause, 
  Square, 
  SkipForward, 
  Eye, 
  EyeOff,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  UserX,
  Settings,
  Trophy,
  Clock,
  Target,
  BarChart3
} from 'lucide-react'
import { api } from '../../utils/api'
import socketManager from '../../utils/socket'
import LoadingSpinner from '../../components/LoadingSpinner'
import GameCodeDisplay from '../../components/GameCodeDisplay'
import QuestionForm from '../../components/QuestionForm'
import toast from 'react-hot-toast'

const GameControl = () => {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [liveStats, setLiveStats] = useState({
    connectedParticipants: 0,
    answeredCount: 0,
    currentQuestionStats: null
  })
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    fetchGameDetails()
    
    // Setup socket connection
    const socketConnection = socketManager.connect()
    setSocket(socketConnection)

    return () => {
      if (socketConnection) {
        socketConnection.off('participantCountUpdate')
        socketConnection.off('participantFlagged')
        socketConnection.off('liveAnalytics')
        socketConnection.off('answerSubmitted')
      }
    }
  }, [gameId])

  useEffect(() => {
    if (socket && game) {
      // Join organizer room
      socket.emit('joinGameRoom', {
        gameCode: game.game_code,
        role: 'organizer'
      })

      // Listen for live updates
      socket.on('participantCountUpdate', (data) => {
        setLiveStats(prev => ({ ...prev, connectedParticipants: data.count }))
      })

      socket.on('participantFlagged', (data) => {
        toast.error(`Participant ${data.name} flagged for ${data.cheatType}`)
        fetchGameDetails() // Refresh participant list
      })

      socket.on('liveAnalytics', (data) => {
        setLiveStats(prev => ({ ...prev, currentQuestionStats: data }))
      })

      socket.on('answerSubmitted', (data) => {
        setLiveStats(prev => ({ ...prev, answeredCount: prev.answeredCount + 1 }))
      })

      // Request live analytics
      socket.emit('requestLiveAnalytics', { gameId: game.id })
    }
  }, [socket, game])

  const fetchGameDetails = async () => {
    try {
      const response = await api.get(`/games/${gameId}`)
      setGame(response.data)
      setLiveStats(prev => ({
        ...prev,
        connectedParticipants: response.data.participants?.length || 0
      }))
    } catch (error) {
      console.error('Failed to fetch game details:', error)
      toast.error('Failed to load game details')
    } finally {
      setLoading(false)
    }
  }

  const startGame = async () => {
    if (!game.questions || game.questions.length === 0) {
      toast.error('Add at least one question before starting the game')
      return
    }

    try {
      await api.post(`/games/${gameId}/start`)
      toast.success('Game started successfully!')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to start game:', error)
      toast.error('Failed to start game')
    }
  }

  const nextQuestion = async () => {
    try {
      await api.post(`/games/${gameId}/next-question`)
      toast.success('Next question started!')
      setLiveStats(prev => ({ ...prev, answeredCount: 0 }))
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to start next question:', error)
      toast.error(error.response?.data?.error || 'Failed to start next question')
    }
  }

  const revealAnswer = async () => {
    try {
      await api.post(`/games/${gameId}/reveal-answer`)
      toast.success('Answer revealed!')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to reveal answer:', error)
      toast.error('Failed to reveal answer')
    }
  }

  const endGame = async () => {
    if (!confirm('Are you sure you want to end this game?')) return

    try {
      await api.post(`/games/${gameId}/end`)
      toast.success('Game ended successfully!')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to end game:', error)
      toast.error('Failed to end game')
    }
  }

  const saveQuestion = async (questionData) => {
    try {
      if (editingQuestion) {
        await api.put(`/games/${gameId}/questions/${editingQuestion.id}`, questionData)
        toast.success('Question updated successfully!')
      } else {
        await api.post(`/games/${gameId}/questions`, questionData)
        toast.success('Question added successfully!')
      }
      
      setShowQuestionForm(false)
      setEditingQuestion(null)
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to save question:', error)
      toast.error('Failed to save question')
    }
  }

  const deleteQuestion = async (questionId) => {
    if (!confirm('Are you sure you want to delete this question?')) return

    try {
      await api.delete(`/games/${gameId}/questions/${questionId}`)
      toast.success('Question deleted successfully!')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to delete question:', error)
      toast.error('Failed to delete question')
    }
  }

  const eliminateParticipant = async (participantId) => {
    if (!confirm('Are you sure you want to eliminate this participant?')) return

    try {
      socket?.emit('eliminateParticipant', { participantId, gameId })
      toast.success('Participant eliminated')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to eliminate participant:', error)
      toast.error('Failed to eliminate participant')
    }
  }

  const warnParticipant = async (participantId) => {
    const penalty = prompt('Enter penalty points (default: 5):', '5')
    if (penalty === null) return

    try {
      socket?.emit('warnParticipant', { 
        participantId, 
        gameId, 
        customPenalty: parseInt(penalty) || 5 
      })
      toast.success('Warning sent to participant')
      fetchGameDetails()
    } catch (error) {
      console.error('Failed to warn participant:', error)
      toast.error('Failed to warn participant')
    }
  }

  const getCurrentQuestion = () => {
    if (!game?.questions || !game?.current_question_index) return null
    return game.questions.find(q => q.question_order === game.current_question_index)
  }

  if (loading) {
    return <LoadingSpinner message="Loading game control panel..." />
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Game Not Found</h2>
          <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const currentQuestion = getCurrentQuestion()
  const activeParticipants = game.participants?.filter(p => p.status === 'active') || []
  const flaggedParticipants = game.participants?.filter(p => p.status === 'flagged') || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Dashboard
              </Link>
              <h1 className="text-xl font-bold text-gray-900">{game.title}</h1>
              <span className={`px-3 py-1 text-sm rounded-full ${
                game.status === 'active' ? 'bg-green-100 text-green-800' : 
                game.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                'bg-gray-100 text-gray-800'
              }`}>
                {game.status}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <Link
                to={`/leaderboard/${game.game_code}`}
                target="_blank"
                className="btn btn-secondary"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Public Board
              </Link>
              
              <div className="flex items-center space-x-2">
                {game.status === 'draft' && (
                  <button onClick={startGame} className="btn btn-primary">
                    <Play className="h-4 w-4 mr-2" />
                    Start Game
                  </button>
                )}
                
                {game.status === 'active' && (
                  <>
                    <button onClick={nextQuestion} className="btn btn-primary">
                      <SkipForward className="h-4 w-4 mr-2" />
                      Next Question
                    </button>
                    <button onClick={revealAnswer} className="btn btn-secondary">
                      <Eye className="h-4 w-4 mr-2" />
                      Reveal Answer
                    </button>
                    <button onClick={endGame} className="btn btn-danger">
                      <Square className="h-4 w-4 mr-2" />
                      End Game
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Game Info & Current Question */}
          <div className="lg:col-span-2 space-y-6">
            {/* Game Code */}
            <GameCodeDisplay
              gameCode={game.game_code}
              qrCode={game.qrCode}
              joinUrl={game.joinUrl}
            />

            {/* Live Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Connected</p>
                    <p className="text-xl font-bold">{liveStats.connectedParticipants}</p>
                  </div>
                </div>
              </div>
              
              <div className="card p-4">
                <div className="flex items-center space-x-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Answered</p>
                    <p className="text-xl font-bold">{liveStats.answeredCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="card p-4">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600">Questions</p>
                    <p className="text-xl font-bold">{game.questions?.length || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="card p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-gray-600">Current Q</p>
                    <p className="text-xl font-bold">{game.current_question_index || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Question Display */}
            {currentQuestion && game.status === 'active' && (
              <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4">Current Question</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800">
                      Question {currentQuestion.question_order}
                    </span>
                    <span className="text-sm text-blue-600">
                      {currentQuestion.time_limit}s • {currentQuestion.marks} pts
                    </span>
                  </div>
                  <p className="text-gray-900 font-medium mb-2">{currentQuestion.question_text}</p>
                  {currentQuestion.options && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {JSON.parse(currentQuestion.options).map((option, index) => (
                        <span key={index} className="text-gray-700">
                          {String.fromCharCode(65 + index)}. {option}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Questions Management */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Questions</h3>
                <button
                  onClick={() => setShowQuestionForm(true)}
                  className="btn btn-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </button>
              </div>

              {game.questions?.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No questions added yet</p>
                  <button
                    onClick={() => setShowQuestionForm(true)}
                    className="btn btn-primary"
                  >
                    Add First Question
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {game.questions?.map((question, index) => (
                    <div
                      key={question.id}
                      className={`border rounded-lg p-4 ${
                        question.question_order === game.current_question_index
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-medium text-gray-600">
                              Q{question.question_order}
                            </span>
                            <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                              {question.question_type.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500">
                              {question.time_limit}s • {question.marks}pts
                            </span>
                          </div>
                          <p className="font-medium text-gray-900 mb-2">
                            {question.question_text}
                          </p>
                          {question.hint && (
                            <p className="text-sm text-gray-600">
                              Hint: {question.hint} (-{question.hint_penalty}pts)
                            </p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingQuestion(question)
                              setShowQuestionForm(true)
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteQuestion(question.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Participants & Analytics */}
          <div className="space-y-6">
            {/* Flagged Participants Alert */}
            {flaggedParticipants.length > 0 && (
              <div className="card p-4 border-red-200 bg-red-50">
                <div className="flex items-center space-x-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <h3 className="font-semibold text-red-800">Flagged Participants</h3>
                </div>
                <div className="space-y-2">
                  {flaggedParticipants.map(participant => (
                    <div key={participant.id} className="flex items-center justify-between">
                      <span className="text-sm">
                        {participant.avatar} {participant.name}
                        <span className="text-red-600 ml-2">
                          ({participant.cheat_warnings} warnings)
                        </span>
                      </span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => warnParticipant(participant.id)}
                          className="text-xs btn btn-secondary"
                        >
                          Warn
                        </button>
                        <button
                          onClick={() => eliminateParticipant(participant.id)}
                          className="text-xs btn btn-danger"
                        >
                          <UserX className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Leaderboard */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold mb-4">Live Leaderboard</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeParticipants
                  .sort((a, b) => b.total_score - a.total_score)
                  .slice(0, 10)
                  .map((participant, index) => (
                    <div key={participant.id} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50">
                      <span className="text-sm font-medium text-gray-500 w-6">
                        #{index + 1}
                      </span>
                      <span className="text-lg">{participant.avatar}</span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{participant.name}</p>
                        <p className="text-sm text-gray-600">{participant.total_score} points</p>
                      </div>
                      {participant.cheat_warnings > 0 && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* All Participants */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold mb-4">
                All Participants ({activeParticipants.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {activeParticipants.map(participant => (
                  <div key={participant.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{participant.avatar}</span>
                      <div>
                        <p className="font-medium text-gray-900">{participant.name}</p>
                        <p className="text-sm text-gray-600">
                          Rank #{participant.current_rank} • {participant.total_score} pts
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {participant.cheat_warnings > 0 && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          {participant.cheat_warnings} warns
                        </span>
                      )}
                      <button
                        onClick={() => warnParticipant(participant.id)}
                        className="text-yellow-600 hover:text-yellow-800 p-1"
                        title="Warn participant"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => eliminateParticipant(participant.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Eliminate participant"
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Form Modal */}
      {showQuestionForm && (
        <QuestionForm
          question={editingQuestion}
          onSave={saveQuestion}
          onCancel={() => {
            setShowQuestionForm(false)
            setEditingQuestion(null)
          }}
        />
      )}
    </div>
  )
}

export default GameControl