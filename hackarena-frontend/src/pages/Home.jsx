import { Link } from 'react-router-dom'
import { 
  Trophy, 
  Users, 
  Clock, 
  Shield, 
  BarChart3, 
  Zap,
  ArrowRight,
  Play,
  UserPlus
} from 'lucide-react'

const Home = () => {
  const features = [
    {
      icon: <Trophy className="h-8 w-8" />,
      title: "Real-time Competition",
      description: "Live hackathon games with instant leaderboards and scoring"
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "500+ Participants",
      description: "Support for massive concurrent participation"
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: "Time-based Scoring",
      description: "Faster responses earn more points with dynamic scoring"
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Anti-cheat Protection",
      description: "Advanced cheat detection and prevention system"
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "Live Analytics",
      description: "Real-time performance insights and detailed reports"
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Multiple Question Types",
      description: "MCQ, Code snippets, Fill-in-blanks, and more"
    }
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">HackArena</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/join" className="text-gray-600 hover:text-gray-900">
                Join Game
              </Link>
              <Link to="/login" className="btn btn-secondary">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative game-gradient text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            The Ultimate Inter-College
            <span className="block text-yellow-300">Hackathon Platform</span>
          </h1>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Host live technical competitions with real-time scoring, anti-cheat protection, 
            and support for 500+ concurrent participants. Perfect for college fests and tech events.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-3">
              <UserPlus className="h-5 w-5 mr-2" />
              Create Account
            </Link>
            <Link to="/join" className="btn bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary-600 text-lg px-8 py-3">
              <Play className="h-5 w-5 mr-2" />
              Join Game
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything You Need for Live Competitions
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Designed specifically for college hackathons and technical events with 
              enterprise-grade reliability and real-time performance.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card p-6 hover:shadow-lg transition-shadow">
                <div className="text-primary-600 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How HackArena Works
            </h2>
            <p className="text-lg text-gray-600">
              Simple setup, powerful features, seamless execution
            </p>
          </div>
          
          <div className="space-y-12">
            <div className="flex items-center space-x-8">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <h3 className="text-xl font-semibold">Create Your Game</h3>
                </div>
                <p className="text-gray-600 ml-14">
                  Set up questions, configure scoring rules, and generate QR codes for easy participant access.
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-8">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <h3 className="text-xl font-semibold">Participants Join</h3>
                </div>
                <p className="text-gray-600 ml-14">
                  Students scan QR codes or enter game codes to join. Anti-duplication ensures fair play.
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-8">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <h3 className="text-xl font-semibold">Live Competition</h3>
                </div>
                <p className="text-gray-600 ml-14">
                  Control the game flow, reveal answers, and watch real-time leaderboards update instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to Host Your Next Hackathon?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Join hundreds of organizers already using HackArena for their technical events.
          </p>
          <Link 
            to="/register" 
            className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-3 inline-flex items-center"
          >
            Start Free Today
            <ArrowRight className="h-5 w-5 ml-2" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">HackArena</span>
            </div>
            <p className="mb-4">
              Empowering college hackathons with real-time competition technology
            </p>
            <p className="text-sm">
              Proposed by Dayananda Sagar Business Academy (IT Club)
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home