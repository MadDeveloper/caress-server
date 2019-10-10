/*! caress-client - v0.1.0 - 2012-11-01
 * https://github.com/ekryski/caress-client
 * Copyright (c) 2012 Eric Kryski; Licensed MIT */

;((root, factory) => {
  if (typeof define === "function" && define.amd) {
    // AMD. Register as an anonymous module.
    define(["underscore"], function(underscore) {
      return (root.Caress = factory(underscore))
    })
  } else if (typeof module === "object" && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(require("underscore"))
  } else {
    // Browser globals
    root.Caress = factory(root._)
  }
})(typeof self !== "undefined" ? self : this, _ => {
  /**
   * Caress namespace.
   *
   * @namespace
   */
  const Caress = {}

  /**
   * Caress version
   *
   * @api public
   */

  Caress.version = "0.1.0"

  /**
   * TUIO Protocol implemented.
   *
   * @api public
   */

  Caress.protocol = "1.1"

  /**
   * The Caress Client Object
   */
  const Client = (Caress.Client = function Client(options) {
    options = options || {}
    this.host = options.host || "127.0.0.1"
    this.port = options.port || 5000
    this.connected = false
    this.sessions = {} // {id: pointerToObjectInList}
    this.cursors = {}
    this.objects = {}
    this.blobs = {}
    this.touches = {}
    this.touchList = createTouchList()

    // _.bindAll(this, 'connect', 'onConnect', 'onDisconnect', 'processPacket', 'processMessage', 'process2dCursorMessage', 'source2dCursor', 'alive2dCursor', 'set2dCursor');
    _.bindAll(
      this,
      "connect",
      "onConnect",
      "onDisconnect",
      "processPacket",
      "processMessage",
      "processCursorSource",
      "processObjectSource",
      "processBlobSource",
      "processCursorAlive",
      "processObjectAlive",
      "processBlobAlive",
      "processCursorSet",
      "processObjectSet",
      "processBlobSet",
      "processFseq"
    )
  })

  Client.prototype.connect = function() {
    this.socket = io.connect(`http://${this.host}:${this.port}`)
    this.socket.on("connect", this.onConnect)
    this.socket.on("disconnect", this.onDisconnect)
  }

  Client.prototype.onConnect = function() {
    this.connected = true

    this.socket.on("tuio", this.processPacket)
    // this.trigger("connect");
    console.log("Connected to Socket.io")
  }

  Client.prototype.onDisconnect = function() {
    this.connected = false

    // We disconnected from the server so we emit touch cancel
    // events for each touch point still remaining.
    for (let namespace in this.touches) {
      for (let touch in this.touches[namespace]) {
        const cancelledTouch = this.touches[namespace][touch]

        delete this.touches[namespace][touch]
        this.createTouchEvent("touchcancel", cancelledTouch)
      }
    }

    // Clean up all the TUIO and touch lists
    this.touches = {}
    this.cursors = {}
    this.objects = {}
    this.blobs = {}

    // this.trigger("disconnect");
    console.log("Disconnected from Socket.io")
  }

  Client.prototype.processPacket = function(packet) {
    this.processMessage(packet)

    // if (packet.bundle) {
    //   this.processMessage(packet)
    // } else {
    //   // It's a regular message and not a bundle
    //   // TODO: Figure out what to do. Haven't seen one of these yet
    // }
  }

  Client.prototype.processMessage = function(packet) {
    const cursorTypes = {
      source: this.processCursorSource,
      alive: this.processCursorAlive,
      set: this.processCursorSet,
      fseq: this.processFseq
    }

    const objectTypes = {
      source: this.processObjectSource,
      alive: this.processObjectAlive,
      set: this.processObjectSet,
      fseq: this.processFseq
    }

    const blobTypes = {
      source: this.processBlobSource,
      alive: this.processBlobAlive,
      set: this.processBlobSet,
      fseq: this.processFseq
    }

    // Ignore duplicate packets for now
    if (!packet.duplicate) {
      // Default all the sources to localhost, assuming that if
      // we don't have an address then it is from localhost. Maybe
      // this is a bad assumption to make. We override this if
      // a source was actually provided!
      packet.source = "localhost"

      for (let message in packet.messages) {
        const key = packet.messages[message].type

        switch (packet.messages[message].profile) {
          case "/tuio/2Dcur":
          case "/tuio/25Dcur":
          case "/tuio/3Dcur":
            cursorTypes[key](packet, packet.messages[message])
            break
          case "/tuio/2Dobj":
          case "/tuio/25Dobj":
          case "/tuio/3Dobj":
            objectTypes[key](packet, packet.messages[message])
            break
          case "/tuio/2Dblb":
          case "/tuio/25Dblb":
          case "/tuio/3Dblb":
            blobTypes[key](packet, packet.messages[message])
            break
        }
      }
    }
  }

  Client.prototype.processCursorSource = function(packet, message) {
    packet.source = message.address
    if (this.cursors[packet.source] === undefined) {
      this.cursors[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }
  }

  Client.prototype.processObjectSource = function(packet, message) {
    packet.source = message.address
    if (this.objects[packet.source] === undefined) {
      this.objects[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }
  }

  Client.prototype.processBlobSource = function(packet, message) {
    packet.source = message.address
    if (this.blobs[packet.source] === undefined) {
      this.blobs[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }
  }

  Client.prototype.processCursorAlive = function(packet, message) {
    // Setup multiplexing namespacing if it doesn't already exist.
    // Also needs to be done in here because sometimes you don't get source
    // messages.
    if (this.cursors[packet.source] === undefined) {
      this.cursors[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }

    // Remove the non-active cursors from the cursor namespace
    const activeCursors = (message.sessionIds || []).map(id => id.toString())
    const notActiveCursors = _.difference(
      _.keys(this.cursors[packet.source]),
      activeCursors
    )

    for (let i = 0; i < notActiveCursors.length; i++) {
      const key = notActiveCursors[i]
      const touch = this.touches[packet.source][key]

      if (touch !== undefined) {
        delete this.touches[packet.source][key]
        delete this.cursors[packet.source][key]
        this.createTouchEvent("touchend", touch)
      }
    }
  }

  Client.prototype.processObjectAlive = function(packet, message) {
    // Setup multiplexing namespacing if it doesn't already exist.
    // Also needs to be done in here because sometimes you don't get source
    // messages.
    if (this.objects[packet.source] === undefined) {
      this.objects[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }

    // Remove the non-active objects from the object namespace
    const activeObjects = (message.sessionIds || []).map(id => id.toString())
    const notActiveObjects = _.difference(
      Object.keys(this.objects[packet.source]),
      activeObjects
    )

    for (let i = 0; i < notActiveObjects.length; i++) {
      var key = notActiveObjects[i]
      var touch = this.touches[packet.source][key]

      if (touch !== undefined) {
        delete this.touches[packet.source][key]
        delete this.objects[packet.source][key]
        this.createTouchEvent("touchend", touch)
      }
    }
  }

  Client.prototype.processBlobAlive = function(packet, message) {
    // Setup multiplexing namespacing if it doesn't already exist.
    // Also needs to be done in here because sometimes you don't get source
    // messages.
    if (this.blobs[packet.source] === undefined) {
      this.blobs[packet.source] = {}
    }

    if (this.touches[packet.source] === undefined) {
      this.touches[packet.source] = {}
    }

    // Remove the non-active blobs from the blob namespace
    const activeBlobs = (message.sessionIds || []).map(id => id.toString())
    const notActiveBlobs = _.difference(
      Object.keys(this.blobs[packet.source]),
      activeBlobs
    )

    for (let i = 0; i < notActiveBlobs.length; i++) {
      const key = notActiveBlobs[i]
      const touch = this.touches[packet.source][key]

      if (touch !== undefined) {
        delete this.touches[packet.source][key]
        delete this.blobs[packet.source][key]
        this.createTouchEvent("touchend", touch)
      }
    }
  }

  Client.prototype.processCursorSet = function(packet, message) {
    const cursor = new TuioCursor(message)
    const touch = cursor.coherceToTouch()
    const id = message.sessionId.toString()

    if (
      this.cursors[packet.source][id] !== undefined &&
      this.cursors[packet.source][id].sessionId.toString() === id
    ) {
      // Existing cursor so we update it
      this.cursors[packet.source][id] = cursor

      // Find existing touch in touches hash, replace it with the
      // updated touch and then create a 'touchmove' event
      if (
        this.touches[packet.source][id] !== undefined &&
        this.touches[packet.source][id].identifier.toString() === id
      ) {
        this.touches[packet.source][id] = touch
        this.createTouchEvent("touchmove", touch)
        // console.log('UPDATE', this.cursors, this.touches);

        return
      }

      // Shouldn't really get here unless somebody removed the touch from
      // the touches hash without removing the cursor from cursors as well.
      return
    }

    // New cursor
    this.cursors[packet.source][id] = cursor
    this.touches[packet.source][id] = touch

    this.createTouchEvent("touchstart", touch)
    // console.log('SET', this.cursors[packet.source], this.touches[packet.source]);
  }

  Client.prototype.processObjectSet = function(packet, message) {
    const id = message.sessionId.toString()

    if (
      this.objects[packet.source][id] !== undefined &&
      this.objects[packet.source][id].sessionId.toString() === id
    ) {
      // Existing object so we update it
      this.objects[packet.source][id] = new TuioObject(message)

      // Find existing touch in touches hash, replace it with the
      // updated touch and then create a 'touchmove' event
      if (
        this.touches[packet.source][id] !== undefined &&
        this.touches[packet.source][id].identifier.toString() === id
      ) {
        const touch = this.objects[packet.source][id].coherceToTouch()
        this.touches[packet.source][id] = touch
        this.createTouchEvent("touchmove", touch)
        // console.log('UPDATE', this.objects, this.touches);

        return
      }

      // Shouldn't really get here unless somebody removed the touch from
      // the touches hash without removing the object from objects as well.
      return
    }

    // New TUIO object
    const tuioObject = new TuioObject(message)
    const touch = tuioObject.coherceToTouch()

    this.objects[packet.source][id] = tuioObject
    this.touches[packet.source][id] = touch

    this.createTouchEvent("touchstart", touch)
    // console.log('SET', this.objects[packet.source], this.touches[packet.source]);
  }

  Client.prototype.processBlobSet = function(packet, message) {
    const id = message.sessionId.toString()

    if (
      this.blobs[packet.source][id] !== undefined &&
      this.blobs[packet.source][id].sessionId.toString() === id
    ) {
      // Existing blob so we update it
      this.blobs[packet.source][id] = new TuioBlob(message)

      // Find existing touch in touches hash, replace it with the
      // updated touch and then create a 'touchmove' event
      if (
        this.touches[packet.source][id] !== undefined &&
        this.touches[packet.source][id].identifier.toString() === id
      ) {
        const touch = this.blobs[packet.source][id].coherceToTouch()
        this.touches[packet.source][id] = touch
        this.createTouchEvent("touchmove", touch)
        // console.log('UPDATE', this.blobs, this.touches);

        return
      }

      // Shouldn't really get here unless somebody removed the touch from
      // the touches hash without removing the blob from blobs as well.
      return
    }

    // New blob
    const blob = new TuioBlob(message)
    const touch = blob.coherceToTouch()

    this.blobs[packet.source][id] = blob
    this.touches[packet.source][id] = touch

    this.createTouchEvent("touchstart", touch)
    // console.log('SET', this.blobs[packet.source], this.touches[packet.source]);
  }

  Client.prototype.processFseq = function(packet, message) {
    // TODO: Figure out what to do with fseq messages.
  }

  Client.prototype.getCursor = function(sessionId) {
    return this.cursors[sessionId]
  }

  Client.prototype.getObject = function(sessionId) {
    return this.objects[sessionId]
  }

  Client.prototype.getBlob = function(sessionId) {
    return this.blobs[sessionId]
  }

  Client.prototype.getCursors = function() {
    return this.cursors
  }

  Client.prototype.getObjects = function() {
    return this.objects
  }

  Client.prototype.getBlobs = function() {
    return this.blobs
  }

  // Create our custom TouchEvent
  Client.prototype.createTouchEvent = function(type, touch) {
    // Get all currently active touches so they can be attached
    // to the touchEvent
    const touches = []

    // Convert touches hash to array because that's what W3C says
    // it should be.
    // TODO: Find a better way! This is super efficient, NOT!
    for (let namespace in this.touches) {
      for (let key in this.touches[namespace]) {
        touches.push(this.touches[namespace][key])
      }
    }

    // Get the touches that started on the attribute so they can
    // be attached to the touchEvent
    const targetTouches = getTargetTouches(touch)

    // Get the touches that contributed to the event so they can
    // be attached to the touchEvent
    const changedTouches = createTouchList(touch)

    // This is used in place of document.createEvent('TouchEvent');
    // because almost all browsers except for Firefox at the moment
    // do not support it.
    const touchEvent = new TouchEvent(type, {
      touches,
      targetTouches,
      changedTouches
    })

    // Dispatch the event
    if (touch.target) {
      touch.target.dispatchEvent(touchEvent)
    } else {
      document.dispatchEvent(touchEvent)
    }
  }

  /**
   * A TUIO Cursor Object
   */
  const TuioCursor = (Caress.TuioCursor = function TuioCursor(options) {
    for (let key in options) {
      this[key] = options[key]
    }
  })

  TuioCursor.prototype.coherceToTouch = function() {
    const identifier = this.sessionId
    const clientX = window.innerWidth * this.xPosition
    const clientY = window.innerHeight * this.yPosition
    const pageX = document.documentElement.clientWidth * this.xPosition
    const pageY = document.documentElement.clientHeight * this.yPosition
    const target = document.elementFromPoint(pageX, pageY)
    const screenX = screen.width * this.xPosition
    const screenY = screen.height * this.yPosition
    const radiusX = this.radius
    const radiusY = this.radius
    const rotationAngle = this.rotationAngle
    const force = this.force

    return new Touch({
      target,
      identifier,
      clientX,
      clientY,
      pageX,
      pageY,
      screenX,
      screenY,
      radiusX,
      radiusY,
      rotationAngle,
      force
    })
  }

  /**
   * A TUIO Object Object (an Object Object? whaaat?)
   */
  const TuioObject = (Caress.TuioObject = function TuioObject(options) {
    for (let key in options) {
      this[key] = options[key]
    }
  })

  TuioObject.prototype.coherceToTouch = function() {
    const identifier = this.sessionId
    const clientX = window.innerWidth * this.xPosition
    const clientY = window.innerHeight * this.yPosition
    const pageX = document.documentElement.clientWidth * this.xPosition
    const pageY = document.documentElement.clientHeight * this.yPosition
    const target = document.elementFromPoint(pageX, pageY)
    const screenX = screen.width * this.xPosition
    const screenY = screen.height * this.yPosition
    const radiusX = this.radius
    const radiusY = this.radius
    const rotationAngle = this.rotationAngle
    const force = this.force
    const touch = new Touch({
      target,
      identifier,
      clientX,
      clientY,
      pageX,
      pageY,
      screenX,
      screenY,
      radiusX,
      radiusY,
      rotationAngle,
      force
    })

    touch.classId = this.classId

    return touch
  }

  /**
   * A TUIO Blob Object
   */
  const TuioBlob = (Caress.TuioBlob = function TuioBlob(options) {
    for (let key in options) {
      this[key] = options[key]
    }
  })

  TuioBlob.prototype.coherceToTouch = function() {
    const identifier = this.sessionId
    const clientX = window.innerWidth * this.xPosition
    const clientY = window.innerHeight * this.yPosition
    const pageX = document.documentElement.clientWidth * this.xPosition
    const pageY = document.documentElement.clientHeight * this.yPosition
    const target = document.elementFromPoint(pageX, pageY)
    const screenX = screen.width * this.xPosition
    const screenY = screen.height * this.yPosition
    const radiusX = this.radius
    const radiusY = this.radius
    const rotationAngle = this.rotationAngle
    const force = this.force

    return new Touch({
      target,
      identifier,
      clientX,
      clientY,
      pageX,
      pageY,
      screenX,
      screenY,
      radiusX,
      radiusY,
      rotationAngle,
      force
    })
  }

  function getTargetTouches(touch) {
    const targetTouches = createTouchList()

    for (let namespace in window.client.touches) {
      for (let key in window.client.touches[namespace]) {
        const currentTouch = window.client.touches[namespace][key]

        if (currentTouch.target == touch.target) {
          targetTouches.push(currentTouch)
        }
      }
    }

    return targetTouches
  }

  function createTouchList(touches) {
    return Array.isArray(touches)
      ? touches
      : touches !== undefined
      ? [touches]
      : []
  }

  window.ontouchstart = document.ontouchstart = null
  window.ontouchend = document.ontouchend = null
  window.ontouchmove = document.ontouchmove = null
  window.ontouchcancel = document.ontouchcancel = null
  window.ontouchenter = document.ontouchenter = null
  window.ontouchleave = document.ontouchleave = null

  // Return the Caress module API
  return Caress
})
