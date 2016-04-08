/**
 * This example uses socket.io to send audio data to the server and processed data back to the browser.
 * To run this example you need to install socket.io first:
 *
 * npm install socketio
 *
 * Start the example with `node socket_io.js` and open localhost:3000 in the browser for a live demo. 
 */

const	app = require('express')(),
		http = require('http').Server(app),
		io = require('socket.io')(http),
		sp = require('../spectro.js')

/**
 * Serve the socket_io.html to the clients
 */
app.get('/', function(req, res) {
	res.sendFile(__dirname + '/socket_io.html')
})

/**
 * Wait for client connections
 */
io.on('connection', function(socket) {

	var spectro = new sp({
		overlap: 0.5
	})
	spectro.stop()

	/**
	 * This color map is basically a gradient over the specified magnitudes
	 *
	 * @type {Object}
	 */
	const colorMap = {
		'50': '#fff',
		'10': '#f00',
		'-20': '#00f',
		'-50': '#000',
	}
	/** @type {Function} This function can then be used to get an rgb array for the amplitudes **/
	const cFunc = sp.colorize(colorMap)

	/**
	 * When the browser sent new data write them into the Spectro instance
	 */
	socket.on('data', (data) => {
		spectro._write(data)
	})
	/**
	 * When the recording stopped we can kill the workers to free resources
	 */
	socket.on('suspend', () => {
		console.log('Suspending work...')
		spectro.stop()
	})
	/**
	 * Recreate the workers when resuming the recording
	 */
	socket.on('resume', () => {
		console.log('Restarting work...')
		spectro.start()
	})

	/**
	 * When the spectro instance has new data they can be send back to the browser
	 */
	spectro.on('data', (err, frame) => {
		if (err !== null) return console.error('Spectro error:', err)
		// Colorize the data
		for (var i = 0, j = frame.data.length; i < j; ++i)
			frame.data[i] = cFunc(frame.data[i])
		// Send it back to the browser
		socket.emit('data', frame)
	})

	/**
	 * Free resources when the client disconnected
	 */
	socket.on('disconnect', function(){
		spectro.clear()
	})
})

/**
 * Start listening on port 3000
 */
http.listen(3000, function(){
	console.log('listening on *:3000')
})