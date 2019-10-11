/*
 * Caress example server
 * Copyright (c) 2019 Julien Sergent
 * MIT Licensed
 */

const express = require("express")
const http = require("http")

const socketIO = require("socket.io")

const Caress = require("../lib/caress-server")

const app = express()
const server = http.createServer(app)
const io = socketIO.listen(server)
const caress = new Caress("0.0.0.0", 3333, { json: true })

io.on("connection", onSocketConnect)

// Setup Express
app.configure(() => {
  app.use(express.methodOverride())
  app.use(express.bodyParser())
  app.use(express.static(__dirname))
  app.use(
    express.errorHandler({
      dumpExceptions: true,
      showStack: true
    })
  )
  app.use(app.router)
})

app.get("/", (req, res) => res.sendfile(__dirname + "/index.html"))

function onSocketConnect(socket) {
  console.log("Socket.io Client Connected")

  caress.on("tuio", message => socket.emit("tuio", message))
  socket.on("disconnect", () => {
    console.log("Socket.io Client Disconnected")
  })
}

server.listen(5000)
