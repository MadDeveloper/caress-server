/*
 * Caress Server v0.2.0
 *
 * A simple server that listens for TUIO events, translates
 * them and then exposes them as an event emitter.
 *
 * Copyright (c) 2019 Julien Sergent
 * MIT Licensed
 */
const dgram = require("dgram")
const net = require("net")

const socketIO = require("socket.io")

const Packet = require("./tuio-packet")

const io = socketIO.listen(5000)

/**
 * Creates a Caress TUIO Server
 *
 * @param String host to listen for TUIO data
 * @param Integer port to listen to TUIO data - default is 3333
 * @param Object options
 * @api public
 */
function CaressServer({
  host = "127.0.0.1",
  port = 3333,
  debug = false,
  json = true,
  useTCP = false,
  useUDP = true
} = {}) {
  return new Promise((resolve, reject) => {
    if (useUDP) {
      const tuioUdpSocket = dgram.createSocket("udp4")

      tuioUdpSocket.on("message", message => {
        handleMessage({ message, socketType: "UDP" })
      })

      tuioUdpSocket.on("error", error => {
        handleError(error)
        logDebug("TUIO UDP Server ERROR: ", error)
      })

      tuioUdpSocket.on("close", () => {
        logDebug("TUIO UDP Server Disconnected")
      })

      tuioUdpSocket.on("listening", () => {
        logDebug(`TUIO UDP Server listening on: ${getAddress(tuioUdpSocket)}`)
        handleConnect()
      })

      tuioUdpSocket.bind(port, host)
    }

    if (useTCP) {
      const tuioTcpSocket = net.createServer(socket => {
        socket.on("connect", () => {
          logDebug("TUIO TCP Client Connected")
          handleConnect()
        })

        socket.on("data", message => {
          handleMessage({ message, socketType: "TCP" })
        })

        socket.on("error", error => {
          handleError(error)
          logDebug("TUIO TCP Server ERROR: ", error)
        })

        socket.on("close", () => {
          logDebug("TUIO TCP Server Disconnected")
        })
        socket.on("end", () => {
          logDebug("TUIO TCP Client Disconnected")
        })
      })

      tuioTcpSocket.listen(port, () => {
        logDebug(`TUIO TCP Server listening on: ${getAddress(tuioTcpSocket)}`)
      })
    }

    function handleConnect() {
      io.emit("connected")
      resolve()
    }

    function handleError(error) {
      io.emit("error", error)
      reject(error)
    }

    function handleMessage({ message, socketType }) {
      const packet = json
        ? new Packet(message).toJSON()
        : new Packet(message).toArray()

      logDebug(
        `TUIO ${socketType} Server Received Packet: ${JSON.stringify(packet)}`
      )

      io.emit("tuio", packet)
    }

    function logDebug(message) {
      if (debug) {
        console.log(`${now()} - ${message}`)
      }
    }
  })
}

function getAddress(socket) {
  const { address, port } = socket.address()

  return `${address}:${port}`
}

function now() {
  return new Date()
}

/*
 * Server version
 */
CaressServer.version = "0.2.0"

/*
 * Supported TUIO protocol version
 */
CaressServer.protocol = "1.1"

module.exports = CaressServer
