import { io } from 'socket.io-client'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

class SocketManager {
  constructor() {
    this.socket = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  connect() {
    if (this.socket?.connected) return this.socket

    this.socket = io(BASE_URL, {
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
    })

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id)
      this.reconnectAttempts = 0
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      if (reason === 'io server disconnect') {
        this.socket.connect()
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => {
          console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
          this.socket.connect()
        }, 1000 * this.reconnectAttempts)
      }
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }
}

export const socketManager = new SocketManager()
export default socketManager