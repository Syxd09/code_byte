import { Loader2 } from 'lucide-react'

const LoadingSpinner = ({ message = 'Loading...', size = 'default' }) => {
  const sizeClasses = {
    small: 'h-4 w-4',
    default: 'h-8 w-8',
    large: 'h-12 w-12'
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4">
      <Loader2 className={`animate-spin text-primary-600 ${sizeClasses[size]}`} />
      <p className="text-gray-600 text-sm font-medium">{message}</p>
    </div>
  )
}

export default LoadingSpinner