const CaressServer = require("./lib/caress-server")

new CaressServer().catch(error => console.log(`server stopped: ${error}`))
