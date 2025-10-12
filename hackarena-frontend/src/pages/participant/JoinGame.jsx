import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trophy, Users, QrCode, ArrowRight, Loader2 } from 'lucide-react'
import { api } from '../../utils/api'
import toast from 'react-hot-toast'

const JoinGame = () => {
  const { gameCode: urlGameCode } = useParams()
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    gameCode: urlGameCode || '',
    name: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If game code is in URL, focus on name input
    if (urlGameCode && urlGameCode.length === 8) {
      setFormData(prev => ({ ...prev, gameCode: urlGameCode.toUpperCase() }))
    }
  }, [urlGameCode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.gameCode.trim()) {
      toast.error('Game code is required')
      return
    }
    
    if (!formData.name.trim()) {
      toast.error('Your name is required')
      return
    }

    if (formData.name.length < 2) {
      toast.error('Name must be at least 2 characters')
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/participants/join', {
        gameCode: formData.gameCode.toUpperCase(),
        name: formData.name.trim()
      })

      const { participant, sessionToken, gameCode } = response.data

      // Store session data
      localStorage.setItem('hackarena_session', sessionToken)
      localStorage.setItem('hackarena_participant', JSON.stringify(participant))

      toast.success(`Welcome ${participant.name}! ${participant.avatar}`)
      navigate(`/game/${gameCode}`)

    } catch (error) {
      console.error('Join game error:', error)
      toast.error(error.response?.data?.error || 'Failed to join game')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'gameCode' ? value.toUpperCase() : value
    }))
  }

  return (
    <div className="min-h-screen participant-interface flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4 shadow-lg">
            <Trophy className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">HackArena</h1>
          <p className="text-blue-100">Join the competition!</p>
        </div>

        {/* Join Form */}
        <div className="card p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Join Game</h2>
            <p className="text-gray-600">Enter your details to participate</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="gameCode" className="block text-sm font-medium text-gray-700 mb-2">
                Game Code
              </label>
              <div className="relative">
                <input
                  id="gameCode"
                  name="gameCode"
                  type="text"
                  value={formData.gameCode}
                  onChange={handleChange}
                  className="input w-full text-center text-lg font-mono tracking-wider uppercase"
                  placeholder="ENTER CODE"
                  maxLength={8}
                  required
                />
                <QrCode className="absolute right-3 top-3 h-5 w-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Scan QR code or enter the 8-digit game code
              </p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <div className="relative">
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder="Enter your name"
                  maxLength={30}
                  required
                />
                <Users className="absolute right-3 top-3 h-5 w-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This name will be visible to everyone
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full h-12 text-lg flex items-center justify-center"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Join Game
                  <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 mb-2">
              Don't have a game code?
            </p>
            <p className="text-xs text-gray-500">
              Ask your organizer or scan the QR code from their screen
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 text-center">
          <div className="grid grid-cols-3 gap-4 text-white">
            <div>
              <Trophy className="h-6 w-6 mx-auto mb-2 text-yellow-300" />
              <p className="text-sm">Compete</p>
            </div>
            <div>
              <Users className="h-6 w-6 mx-auto mb-2 text-blue-300" />
              <p className="text-sm">Real-time</p>
            </div>
            <div>
              <QrCode className="h-6 w-6 mx-auto mb-2 text-green-300" />
              <p className="text-sm">Easy Join</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JoinGame