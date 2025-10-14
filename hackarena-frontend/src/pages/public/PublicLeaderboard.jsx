import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Trophy, Users, Clock, Target, RefreshCw } from 'lucide-react'
import { api } from '../../utils/api'
import socketManager from '../../utils/socket'
import LoadingSpinner from '../../components/LoadingSpinner'
import Footer from '../../components/Footer'

const PublicLeaderboard = () => {
  console.log('PublicLeaderboard component rendered')
  const { gameCode } = useParams()
  const [leaderboard, setLeaderboard] = useState([])
  const [gameInfo, setGameInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    fetchLeaderboard()
    
    // Setup socket connection for live updates
    const socketConnection = socketManager.connect()
    setSocket(socketConnection)

    // Join viewer room
    socketConnection.emit('joinGameRoom', {
      gameCode,
      role: 'viewer'
    })

    // Listen for leaderboard updates
    socketConnection.on('leaderboardUpdate', (data) => {
      setLeaderboard(data)
      setLastUpdate(new Date())
    })

    // Refresh every 30 seconds as fallback
    const interval = setInterval(fetchLeaderboard, 30000)

    return () => {
      clearInterval(interval)
      if (socketConnection) {
        socketConnection.disconnect()
      }
    }
  }, [gameCode])

  const fetchLeaderboard = async () => {
    try {
      const response = await api.get(`/games/${gameCode}/leaderboard`)
      setLeaderboard(response.data)
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRankColor = (rank) => {
    switch (rank) {
      case 1: return 'text-yellow-600 bg-yellow-50'
      case 2: return 'text-gray-600 bg-gray-50'
      case 3: return 'text-orange-600 bg-orange-50'
      default: return 'text-gray-700 bg-white'
    }
  }

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading leaderboard..." />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <img src="/dsba-logo.svg" alt="DSBA Logo" className="h-6 w-auto" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">DSBA Live Leaderboard</h1>
                <p className="text-blue-100">DSBA Game Code: {gameCode}</p>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center space-x-2 text-sm text-blue-100 mb-1">
                <Clock className="h-4 w-4" />
                <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-1">
                  <Users className="h-4 w-4" />
                  <span>{leaderboard.length} participants</span>
                </div>
                <button
                  onClick={fetchLeaderboard}
                  className="flex items-center space-x-1 text-blue-200 hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-7xl mx-auto px-4 py-12 bg-white">
        {leaderboard.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-100 rounded-2xl mb-6">
              <Trophy className="h-12 w-12 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              No participants yet
            </h2>
            <p className="text-gray-600 text-lg">
              Participants will appear here once they join the game
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                {/* Second Place */}
                <div className="text-center pt-8">
                  <div className="bg-gray-100 rounded-lg p-6">
                    <div className="text-4xl mb-2">{leaderboard[1]?.avatar}</div>
                    <div className="text-6xl mb-2">🥈</div>
                    <h3 className="font-bold text-gray-900">{leaderboard[1]?.name}</h3>
                    <p className="text-lg font-semibold text-gray-700">
                      {leaderboard[1]?.total_score} pts
                    </p>
                  </div>
                </div>

                {/* First Place */}
                <div className="text-center">
                  <div className="bg-yellow-100 rounded-lg p-6 transform scale-110">
                    <div className="text-4xl mb-2">{leaderboard[0]?.avatar}</div>
                    <div className="text-6xl mb-2">🥇</div>
                    <h3 className="font-bold text-gray-900">{leaderboard[0]?.name}</h3>
                    <p className="text-xl font-bold text-yellow-700">
                      {leaderboard[0]?.total_score} pts
                    </p>
                  </div>
                </div>

                {/* Third Place */}
                <div className="text-center pt-8">
                  <div className="bg-orange-100 rounded-lg p-6">
                    <div className="text-4xl mb-2">{leaderboard[2]?.avatar}</div>
                    <div className="text-6xl mb-2">🥉</div>
                    <h3 className="font-bold text-gray-900">{leaderboard[2]?.name}</h3>
                    <p className="text-lg font-semibold text-orange-700">
                      {leaderboard[2]?.total_score} pts
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Full Leaderboard */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-12 gap-4 p-6 bg-gray-50 font-bold text-base border-b border-gray-200 text-gray-900">
                <div className="col-span-1">Rank</div>
                <div className="col-span-1">Avatar</div>
                <div className="col-span-6">Participant</div>
                <div className="col-span-2">Score</div>
                <div className="col-span-2">Status</div>
              </div>
              
              <div className="divide-y divide-gray-200">
                {leaderboard.map((participant, index) => (
                  <div
                    key={index}
                    className={`grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 transition-colors ${
                      index < 3 ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="col-span-1">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankColor(index + 1)}`}>
                        {index < 3 ? getRankIcon(index + 1) : `#${index + 1}`}
                      </span>
                    </div>
                    
                    <div className="col-span-1">
                      <span className="text-2xl">{participant.avatar}</span>
                    </div>
                    
                    <div className="col-span-6">
                      <h3 className="font-semibold text-gray-900">{participant.name}</h3>
                      <p className="text-sm text-gray-600">
                        Rank #{participant.current_rank}
                      </p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-xl font-bold text-gray-900">
                        {participant.total_score}
                      </p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                    
                    <div className="col-span-2">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        participant.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : participant.status === 'eliminated'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {participant.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-200">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Users className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {leaderboard.filter(p => p.status === 'active').length}
                    </p>
                    <p className="text-gray-600 font-medium">Active Players</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-200">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-green-100 rounded-xl">
                    <Target className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {Math.max(...leaderboard.map(p => p.total_score))}
                    </p>
                    <p className="text-gray-600 font-medium">Highest Score</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-200">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-yellow-100 rounded-xl">
                    <Trophy className="h-8 w-8 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {Math.round(leaderboard.reduce((sum, p) => sum + p.total_score, 0) / leaderboard.length) || 0}
                    </p>
                    <p className="text-gray-600 font-medium">Average Score</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}

export default PublicLeaderboard