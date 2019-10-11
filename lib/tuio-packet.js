/*
 * TUIO Packet
 *
 * A wrapper for TUIO messages that has functions to
 * decode and format the raw OSC packets.
 *
 * Copyright (c) 2019 Julien Sergent
 * MIT Licensed
 */

const { jspack } = require("jspack")

// const messageConverter = {
//   's': 'sessionId',
//   'i': 'classId',
//   'x': 'xPosition',
//   'y': 'yPosition',
//   'z': 'zPosition',
//   'a': 'aAngle',
//   'b': 'bAngle',
//   'c': 'cAngle',
//   'w': 'width',
//   'h': 'height',
//   'd': 'depth',
//   'f': 'area',
//   'v': 'volume',
//   'X': 'xVelocity',
//   'Y': 'yVelocity',
//   'Z': 'zVelocity',
//   'A': 'aRotationSpeed',
//   'B': 'bRotationSpeed',
//   'C': 'cRotationSpeed',
//   'm': 'motionAcceleration',
//   'r': 'rotationAccleration',
//   'p': 'freeParameter'
// };

function Packet(msg, tcp = false) {
  this.packet = []
  this.data = msg
  this.tcp = tcp
  this.types = {
    source: (jsonMessage, message) => {
      jsonMessage.address = message[2]
      return jsonMessage
    },
    alive: (jsonMessage, message) => {
      jsonMessage.sessionIds = []

      for (let j = 2, length = message.length; j < length; j++) {
        jsonMessage.sessionIds.push(message[j])
      }

      return jsonMessage
    },
    fseq: (jsonMessage, message) => {
      jsonMessage.frameID = message[2]

      return jsonMessage
    }
  }
  this.profiles = {
    "/tuio/2Dobj": decode2DObjectMessage,
    "/tuio/2Dcur": decode2DCursorMessage,
    "/tuio/2Dblb": decode2DBlobMessage
    // '/tuio/25Dobj': decode25DObjectMessage(message),
    // '/tuio/25Dcur': decode25DCursorMessage(message),
    // '/tuio/25Dblb': decode25DBlobMessage(message),
    // '/tuio/3Dobj': decode3DObjectMessage(message),
    // '/tuio/3Dcur': decode3DCursorMessage(message),
    // '/tuio/3Dblb': decode3DBlobMessage(message)
  }
}

Packet.prototype.toArray = function() {
  if (this.tcp) {
    // Get remaining data after the first ascii character
    // because it is garbage.
    this.data = this.data.slice(4)
  }

  this.packet = decode(this.data, this.packet)

  return this.packet
}

// Convert packet to JSON output
Packet.prototype.toJSON = function() {
  if (this.tcp) {
    // Get remaining data after the first ascii character
    // because it is garbage.
    this.data = this.data.slice(4)
  }

  this.packet = decode(this.data, this.packet)

  let json = {}

  // If it's bundle we have multiple messages
  if (this.packet[0] === "#bundle") {
    json = convertBundleToJSON(this.packet, this) //pass context of the Packet
  } else {
    //TODO: Handle non-bundled messages (haven't seen one yet)
  }

  return json
}

function convertBundleToJSON(bundle, self) {
  const json = {
    bundle: true,
    messages: [],
    duplicate: false
  }

  // Parse the array and convert to proper JSON format given
  // the message profile.
  for (let i = 2, length = bundle.length; i < length; i++) {
    if (Array.isArray(bundle[i])) {
      let jsonMessage = {}

      if (bundle[i][0] === "#bundle") {
        jsonMessage = convertBundleToJSON(bundle[i], self)
      } else {
        jsonMessage.profile = bundle[i][0]
        jsonMessage.type = bundle[i][1]

        if (bundle[i].length > 2) {
          // Call message type decoder based on the profile if it is a 'set' message
          if (self.types[jsonMessage.type] === undefined) {
            jsonMessage = self.profiles[jsonMessage.profile](
              jsonMessage,
              bundle[i]
            )
          } else {
            jsonMessage = self.types[jsonMessage.type](jsonMessage, bundle[i])
            if (jsonMessage.frameID && jsonMessage.frameID === -1) {
              json.duplicate = true
            }
          }
        }
      }

      json.messages.push(jsonMessage)
    }
  }

  return json
}

function decode2DObjectMessage(jsonMessage, message) {
  const fields = [
    "sessionId",
    "classId",
    "xPosition",
    "yPosition",
    "aAngle",
    "xVelocity",
    "yVelocity",
    "aRotationSpeed",
    "motionAcceleration",
    "rotationAccleration"
  ]

  for (let j = 2, length = message.length; j < length; j++) {
    jsonMessage[fields[j - 2]] = message[j]
  }

  return jsonMessage
}

function decode2DCursorMessage(jsonMessage, message) {
  const fields = [
    "sessionId",
    "xPosition",
    "yPosition",
    "xVelocity",
    "yVelocity",
    "motionAcceleration"
  ]

  for (let j = 2, length = message.length; j < length; j++) {
    jsonMessage[fields[j - 2]] = message[j]
  }

  return jsonMessage
}

function decode2DBlobMessage(jsonMessage, message) {
  const fields = [
    "sessionId",
    "xPosition",
    "yPosition",
    "aAngle",
    "width",
    "height",
    "area",
    "xVelocity",
    "yVelocity",
    "aRotationSpeed",
    "motionAcceleration",
    "rotationAccleration"
  ]

  for (let j = 2, length = message.length; j < length; j++) {
    jsonMessage[fields[j - 2]] = message[j]
  }

  return jsonMessage
}

// Parse the OSC packet
function decode(data, packet) {
  const address = decodeString(data)

  data = address.data

  if (address.value === "#bundle") {
    data = decodeBundle(data, packet)
  } else if (data.length > 0) {
    data = decodeMessage(address, data, packet)
  }
  return packet
}

//Decode an OSC bundle
function decodeBundle(data, packet) {
  const time = decodeTime(data)
  let bundleSize, content

  data = time.data

  // Push the '#bundle' profile
  packet.push("#bundle")
  packet.push(time.value.toString())

  while (data.length > 0) {
    bundleSize = decodeInt(data)
    data = bundleSize.data

    content = data.slice(0, bundleSize.value)

    // Parse out the messages in the bundle
    const nestedContent = new Packet(content).toArray()

    packet.push(nestedContent)
    data = data.slice(bundleSize.value, data.length)
  }

  return data
}

//Decode the actual message
function decodeMessage(address, data, packet) {
  // TODO: May need to decode the case where OSC protocol
  // doesn't have type tags
  const types = {
    i: decodeInt,
    f: decodeFloat,
    s: decodeString,
    b: decodeBlob
  }

  packet.push(address.value)

  let typeTags = decodeString(data)

  data = typeTags.data
  typeTags = typeTags.value

  if (typeTags[0] === ",") {
    for (let i = 1, length = typeTags.length; i < length; i++) {
      //Decode data by type
      const arg = types[typeTags[i]](data)

      data = arg.data
      packet.push(arg.value)
    }
  }

  return data
}

// Decode the string
function decodeString(data) {
  let end = 0
  const { length } = data

  while (data[end] && end < length) {
    end++
  }

  return {
    // Get data up to next 00 value
    value: data.toString("ascii", 0, end),
    // Get remaining data after the first 00 value
    data: data.slice(Math.ceil((end + 1) / 4) * 4)
  }
}

//Decode integers
function decodeInt(data) {
  return {
    value: jspack.Unpack(">i", data.slice(0, 4))[0],
    data: data.slice(4)
  }
}

//Decode floats
function decodeFloat(data) {
  return {
    value: jspack.Unpack(">f", data.slice(0, 4))[0],
    data: data.slice(4)
  }
}

//Decode OSC Blobs
function decodeBlob(data) {
  const length = Math.ceil(data.length / 4.0) * 4

  return {
    value: jspack.Pack(">i" + length + "s", [length, data]),
    data: data.slice(length)
  }
}

//Decode timestamp
function decodeTime(data) {
  const time = jspack.Unpack(">LL", data.slice(0, 8))
  const seconds = time[0]
  const fraction = time[1]

  return {
    value: seconds + fraction / 4294967296,
    data: data.slice(8)
  }
}

exports = module.exports = Packet
