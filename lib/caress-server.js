/*
 * Caress Server v0.2.0
 *
 * A simple server that listens for TUIO events, translates
 * them and then exposes them as an event emitter.
 *
 * Copyright (c) 2019 Julien Sergent
 * MIT Licensed
 */
const { EventEmitter } = require("events")
const dgram = require("dgram")
const net = require("net")
const util = require("util")

const Packet = require("./tuio-packet")

/*
 * Server version
 */

exports.version = "0.2.0"

/*
 * Supported TUIO protocol version
 */

exports.protocol = "1.1"

/*
 * Supported Caress client version
 */

// exports.clientVersion = client.version;

/**
 * Creates a Caress TUIO Server
 *
 * @param String host to listen for TUIO data
 * @param Integer port to listen to TUIO data - default is 3333
 * @param Object options
 * @api public
 */

function Caress(
  host = "127.0.0.1",
  port = 3333,
  options = { debug: false, json: true }
) {
  // Needed to convert this constructor into EventEmitter
  EventEmitter.call(this)

  this.host = host
  this.port = port
  this.debug = options.debug
  this.json = options.json

  // Bind to UDP socket for TUIO
  const tuioUdpSocket = dgram.createSocket("udp4")

  tuioUdpSocket.on("message", packet => {
    const parsedPacket = this.json
      ? new Packet(packet).toJSON()
      : new Packet(packet).toArray()

    if (this.debug) {
      console.log(
        now() +
          " - TUIO UDP Server Received Packet: " +
          util.inspect(parsedPacket, true, null, true)
      )
    }
    this.emit("tuio", parsedPacket)
  })

  tuioUdpSocket.on("error", error => {
    this.emit("error", error)
    console.log("TUIO UDP Server ERROR: ", error)
  })

  tuioUdpSocket.on("close", () => {
    if (this.debug) {
      console.log(now() + " - TUIO UDP Server Disconnected")
    }
  })

  tuioUdpSocket.on("listening", () => {
    console.log(`TUIO UDP Server listening on: ${getAddress(tuioUdpSocket)}`)
  })

  tuioUdpSocket.bind(this.port, this.host)

  // Bind to TCP socket for TUIO
  const tuioTcpSocket = net.createServer(socket => {
    socket.on("connect", () => {
      if (this.debug) {
        const now = new Date()
        console.log(now + " - TUIO TCP Client Connected")
      }
    })

    socket.on("data", packet => {
      if (this.debug) {
        console.log(now() + " - TUIO TCP Server Received Packet: " + packet)
      }

      const parsedPacket = this.json
        ? new Packet(packet, true).toJSON()
        : new Packet(packet, true).toArray()

      this.emit("tuio", parsedPacket)
    })

    socket.on("error", error => {
      this.emit("error", error)
      console.log("TUIO TCP Server ERROR: ", error)
    })

    socket.on("close", () => {
      if (this.debug) {
        console.log(now() + " - TUIO TCP Server Disconnected")
      }
    })

    socket.on("end", () => {
      if (this.debug) {
        console.log(now() + " - TUIO TCP Client Disconnected")
      }
    })
  })

  tuioTcpSocket.listen(this.port, () => {
    console.log(`TUIO TCP Server listening on: ${getAddress(tuioTcpSocket)}`)
  })
}

// Needed to convert this constructor into EventEmitter
util.inherits(Caress, EventEmitter)

function getAddress(socket) {
  const { address, port } = socket.address()

  return `${address}:${port}`
}

function now() {
  return new Date()
}

/**
 * Expose Caress Server constructor
 */
module.exports = Caress
