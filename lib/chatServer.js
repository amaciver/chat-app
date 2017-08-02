const io = require('socket.io')

let chat
let guestNumber = 1

const nickNames = {}
let namesUsed = []
const currentRoom = {}

const chatServer = {
  assignGuestName (socket, guestNumber, nickNames, namesUsed) {
    const name = `Guest_${guestNumber}`
    nickNames[socket.id] = name
    socket.emit('nameResult', {
      success: true,
      name
    })
    namesUsed.push(name)
    return guestNumber + 1
  },
  handleClientDisconnection (socket) {
    socket.on('disconnect', () => {
      const nameIdx = namesUsed.indexOf(nickNames[socket.id])
      delete nickNames[socket.id]
      namesUsed = [
        ...namesUsed.slice(0, nameIdx),
        ...namesUsed.slice(nameIdx + 1)
      ]
    })
  },
  handleNameChangeAttempts (socket, nickNames, namesUsed) {
    socket.on('nameAttempt', (name) => {
      if (name.toLowerCase().startsWith('guest')) {
        socket.emit('nameResult', {
          success: false,
          message: 'Names cannot begin with "Guest"'
        })
      } else {
        if (namesUsed.includes(name)) {
          const prevName = nickNames[socket.id]
          const prevNameIdx = namesUsed.indexOf(prevName)
          nickNames[socket.id] = name
          namesUsed = [
            ...namesUsed.slice(0, prevNameIdx),
            ...namesUsed.slice(prevNameIdx + 1),
            name
          ]
          socket.emit('nameResult', {
            success: true,
            name
          })
          socket.broadcast.to(currentRoom[socket.id]).emit('message', {
            text: `${prevName} is now known as ${name}.`
          })
        } else {
          socket.emit('nameResult', {
            success: false,
            message: 'That name is already in use.'
          })
        }
      }
    })
  },
  handleMessageBroadcast (socket) {
    socket.on('message', (message) => {
      socket.broadcast.to(message.room).emit('message', {
        text: `${nickNames[socket.id]}: ${message.text}`
      })
    })
  },
  handleRoomJoining (socket) {
    socket.on('join', (room) => {
      socket.leave(currentRoom[socket.id])
      this.joinRoom(socket, room.newRoom)
    })
  },
  joinRoom (socket, room) {
    socket.join(room)
    currentRoom[socket.id] = room
    socket.emit('joinResult', {room})
    socket.broadcast.to(room).emit('message', {
      text: `${nickNames[socket.id]} has joined ${room}.`
    })

    const usersInRoom = Object.keys(chat.sockets.sockets)

    if (usersInRoom.length > 1) {
      let usersInRoomSummary = `Users currently in ${room}: `
      for (let idx = 0; idx < usersInRoom.length; idx++) {
        const userSocketId = usersInRoom[idx]
        if (userSocketId !== socket.id) {
          if (idx > 0) {
            usersInRoomSummary += ', '
          }
          usersInRoomSummary += nickNames[userSocketId]
        }
      }
      usersInRoomSummary += '.'
      socket.emit('message', {text: usersInRoomSummary})
    }
  },
  listen (server) {
    chat = io(server)

    chat.on('connection', (socket) => {
      console.log('connected: ', socket.id)
      guestNumber = this.assignGuestName(
        socket, guestNumber, nickNames, namesUsed
      )
      this.joinRoom(socket, 'lobby')
      this.handleMessageBroadcast(socket, nickNames)
      this.handleNameChangeAttempts(socket, nickNames, namesUsed)
      this.handleRoomJoining(socket)

      socket.on('rooms', () => {
        socket.emit('rooms', chat.rooms)
      })

      this.handleClientDisconnection(socket)
    })
  }
}

module.exports = chatServer