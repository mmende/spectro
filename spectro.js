'use strict'

const	cluster = require('cluster'),
		path = require("path"),
		fs = require('fs'),
		stream = require('stream'),
		util = require('util'),
		BufferReader = require('buffer-reader'),
		chroma = require('chroma-js')

/***********************/
/*** The master code ***/
/***********************/
if (cluster.isMaster) {

	/** @type {number} This value will be used as default value for the workers count **/
	const CPUs = require('os').cpus().length

	/**
	 * Creates a spectrogram object
	 *
	 * Options:
	 *   bps: number      Bits per sample (8, 16 or 32)
	 *   channels: number The channels count (at the moment only 1 is allowed)
	 *   wSize: number    The window size (must be a potenz of 2)
	 *   wFunc: string    The window function to use ('Hamming')
	 *   overlap: number  The overlap size (must be >= 0 and < 1)
	 *   workers: number  The number of workers to use (> 0)
	 */
	function Spectrogram(options) {

		const opts = Spectrogram.__defaults(Spectrogram.__constructorDefaults, options)

		this.bps = opts.bps
		this.channels = opts.channels
		this.wSize = opts.wSize
		this.wFunc = opts.wFunc
		this.overlap = opts.overlap
		this.workers = opts.workers

		// Validate the options
		if (this.bps !== 8 && this.bps !== 16 && this.bps !== 32)
			throw new Error('Bits per sample must be 8, 16 or 32')
		if (this.channels !== 1)
			throw new Error('At the moment only mono is supported')
		if (this.wSize < 128 || this.wSize > 4096 || !((this.wSize & (this.wSize - 1)) == 0))
			throw new Error('wSize must be a power of 2 between 128 and 4069')
		if (Spectrogram.__windowFunctions.indexOf(this.wFunc) === -1)
			throw new Error('Unknown wFunc: ' + this.wFunc)
		if (this.overlap < 0 || this.overlap >= 1)
			throw new Error('Invalid overlap size ' + this.overlap + '. Overlap must be >= 0 and < 1.')
		if (this.workers < 1)
			throw new Error('Threads must be at least 1')

		/** These values will be used to messure the execution time **/
		this.startTime = null
		this.execTime = null

		/** @type {Array} All idle workers **/
		this.idleWorkers = []

		/** @type {Array} This holds the result data **/
		this.data = []

		/** @type {Array} The data to work on **/
		this.wData = []

		/** @type {Number} The shift of the window last handed to a worker **/
		this.wShift = 0

		/** @type {Number} The index of the window last handed to a worker **/
		this.wIdx = 0

		/** Setup the cluster **/
		cluster.setupMaster({
			exec: path.join(__dirname, 'spectro.worker.js')
		})
		this.start()

		/** Inheritance **/
		stream.Writable.call(this)
	}
	// Let Spectrogram be a writable stream
	util.inherits(Spectrogram, stream.Writable)


	/**
	 * Returns the execution time in ms (available after the end event was triggered)
	 *
	 * @return {number} The execution time in ms
	 */
	Spectrogram.prototype.getExecutionTime = function() {
		return this.execTime
	}

	/**
	 * This will check if data are available to be processed by idle workers
	 */
	Spectrogram.prototype.__process = function () {
		// Check if their are enough data to fill the next window
		var enoughData = ((this.wShift + this.wSize) < this.wData.length)

		if (enoughData === true) {
			// Get an idle worker
			var idleWorker = this.idleWorkers.pop()
			if (idleWorker === undefined) return

			var workData = this.wData.slice(this.wShift, this.wShift + this.wSize)
			idleWorker.send({
				action: 'processData',
				index: this.wIdx,
				data: workData,
				windowFunction: this.wFunc
			})
			// Increase the window index
			++this.wIdx
			// Increase the window shift by the window size minus the overlap size
			this.wShift += this.wSize - Math.ceil(this.overlap * this.wSize)
			// Check if there are more idle workers
			this.__process()
		}
		if (enoughData === false) {
			// Check if there are any data
			if (this.data.length <= 0) return
			// Before the end event can be emited we must check if
			// the workers have processed all previous packages
			var allPackagesProcessed = true
			for(var i = 0; i < this.data.length; ++i) {
				if (this.data.hasOwnProperty(i) === false) {
					allPackagesProcessed = false
					break
				}
			}
			if (allPackagesProcessed) {
				// Check execution time
				var endTime = new Date().getTime()
				this.execTime = (endTime - this.startTime)

				this.emit('end', null, this.data)
			} else {
				// When not all workers finished...
				//console.log('Still waiting for some packages...')
			}
		}
	}

	/**
	 * This will be called when data will be written into the stream
	 *
	 * @param  {Array}    chunk    The data
	 * @param  {string}   encoding The encoding of the data
	 * @param  {Function} callback A callback function
	 */
	Spectrogram.prototype._write = function (chunk, encoding, callback) {
		// Start messuring when startTime is null
		if (this.startTime === null) this.startTime = new Date().getTime()

		if (Buffer.isBuffer(chunk)) {
			// The numbers count depents on the bits per second this audio has
			var divisor = (this.bps === 8) ? 1 : ((this.bps === 16) ? 2 : 4)
			var reader = new BufferReader(chunk)
			for (var i = 0, j = chunk.length / divisor; i < j; ++i)
				this.wData.push(reader['nextInt' + this.bps + 'LE']())
		} else if (Array.isArray(chunk)) {
			for (var i = 0, j = chunk.length; i < j; ++i)
				this.wData.push(chunk[i])
		} else if (typeof chunk === 'object') {
			for (var key in chunk)
				this.wData.push(chunk[key])
		} else {
			callback(new Error(`Unknown chunk type ${typeof chunk}`))
			return
		}
		this.__process()
		if (typeof callback === 'function') callback(null)
	}

	/**
	 * Creates the workers and binds their events
	 */
	Spectrogram.prototype.start = function() {
		// Create the workers
		for (var i = 0; i < this.workers; ++i)
			cluster.fork()
		// Binds the events
		var self = this
		Object.keys(cluster.workers).forEach((id) => {
			cluster.workers[id].on('message', (msg) => {
				var worker = cluster.workers[id]
				switch (msg.status) {
					case 'readyForData':
						// Push processed data
						if (msg.hasOwnProperty('result')) {
							self.data[msg.result.index] = msg.result.data
							self.emit('data', null, {
								index: msg.result.index,
								data: msg.result.data
							})
						}
						self.idleWorkers.push(worker)
						self.__process()
						break
					case 'error':
						// There are no error messages at the moment...
						break
				}
			})
		})
	}

	/**
	 * Stops all workers
	 */
	Spectrogram.prototype.stop = function() {
		Object.keys(cluster.workers).forEach((id) => {
			var worker = cluster.workers[id]
			worker.send({ action: 'shutdown' })
			worker.disconnect()
			/*setTimeout(function() {
				worker.kill()
			}, 2000)*/
			worker.kill()
		})
		this.idleWorkers = []
	}

	/**
	 * Clears the spectrogram
	 */
	Spectrogram.prototype.clear = function () {
		// Stop all workers
		this.stop()
		// Reset the time
		this.startTime = null
		// Reset the data
		this.data = []
		this.wData = []
	}

	/************************/
	/**** static methods ****/
	/************************/

	/**
	 * A list of all implemented window functions
	 *
	 * @type {Array}
	 */
	Spectrogram.__windowFunctions = [
		'Square',
		'Hamming',
		'VonHann',
		'Blackman',
		'BlackmanHarris',
		'BlackmanNuttall',
		'Bartlett'
	]

	/**
	 * These are the default options
	 *
	 * @type {Object}
	 */
	Spectrogram.__constructorDefaults = {
		bps: 16,
		channels: 1,
		wSize: 1024,
		wFunc: 'Hamming',
		overlap: 0.0,
		workers: CPUs
	}

	/**
	 * Extends options with a default value object
	 *
	 * @param  {Object} defaults The defaults object
	 * @param  {Object} options  The options object
	 *
	 * @return {Object}          The extended options
	 */
	Spectrogram.__defaults = function(defaults, options) {
		options = options || {}
		for (var key in defaults)
			if ((key in options) === false)
				options[key] = defaults[key]
		return options
	}

	/**
	 * Turns a two dimensional array into a single dimensional array
	 *
	 * @param  {Array} arr The two dimensional array
	 *
	 * @return {Array}     A single dimensional one
	 */
	Spectrogram.__reduce = function(arr) {
		return [].concat.apply([], arr)
	}

	/**
	 * Returns the global maxima or minima of a one dimensional array
	 *
	 * @param  {boolean} max Whether to search the maxima or minima
	 * @param  {Array}   arr The one dimensional array
	 *
	 * @return {number}      The extrema
	 */
	Spectrogram.__extrema = function(max, arr) {
		/** Returns the max value for large arrays **/
		return arr.reduce((p, v) => {
			if (max) return ( p > v ? p : v )
			return ( p < v ? p : v )
		})
	}

	/**
	 * Returns the maximum amplitude of a spectrogram
	 *
	 * @param  {Array} spectrogram  The spectrogram
	 *
	 * @return {number}             The max amplitude
	 */
	Spectrogram.maxApplitude = function(spectrogram) {
		return Spectrogram.__extrema(true, Spectrogram.__reduce(spectrogram))
	}

	/**
	 * Returns the minimum amplitude of a spectrogram
	 *
	 * @param  {Array} spectrogram  The spectrogram
	 *
	 * @return {number}             The min amplitude
	 */
	Spectrogram.minApplitude = function(spectrogram) {
		return Spectrogram.__extrema(false, Spectrogram.__reduce(spectrogram))
	}


	/**
	 * Returns a color mapping function
	 *
	 * @param  {Object} colorMap A map of color stops {'<amplitude intensity>': '<color therefore>', '<amplitude intensity>': '<color therefore>', ...}
	 *
	 * @return {Function}        A mapping function (intensity) => ([r,g,b])
	 */
	Spectrogram.colorize = function(colorMap) {
		// Create an array with the colors
		var map = []
		for (var colorStop in colorMap) {
			var color = colorMap[colorStop]
			map.push({color: color, stop: parseInt(colorStop)})
		}
		// Sort the map by it's color stops (smallest first)
		map.sort((a, b) => a.stop > b.stop)

		var colorsArr = []
		var stopsArr = []
		map.forEach((el) => {
			colorsArr.push(el.color)
			stopsArr.push(el.stop)
		})

		var scale = chroma.scale(colorsArr).mode('lab').domain(stopsArr)
		return function(intensity) { return scale(intensity).rgb() }
	}


	/**
	 * This is just experimental stuff...
	 * Filters a spectrogram by clipping values outside of the interquartile range
	 *
	 * @param  {Array} spectrogram The spectrogram
	 */
	Spectrogram.filterIQR = function(spectrogram) {
		// Create a sorted clone of spectrogram
		var values = [].concat.apply([], spectrogram)
			values = values.sort(function(a, b) { return a - b })

		/**
		 * Then find a generous IQR. This is generous because if (values.length / 4) 
		 * is not an int, then really you should average the two elements on either 
		 * side to find q1.
		 */     
		var q1 = values[Math.floor((values.length / 4))]
		// Likewise for q3. 
		var q3 = values[Math.ceil((values.length * (3 / 4)))]
		var iqr = q3 - q1;

		// Then find min and max values
		var maxValue = q3 + iqr * 1.5
		var minValue = q1 - iqr * 1.5

		for (var i = 0, j = spectrogram.length; i < j; ++i) {
			for (var k = 0, l = spectrogram[i].length; k < l; ++k) {
				spectrogram[i][k] = (spectrogram[i][k] <= minValue) ? minValue : spectrogram[i][k]
				spectrogram[i][k] = (spectrogram[i][k] >= maxValue) ? maxValue : spectrogram[i][k]
			}
		}
	}

	module.exports = Spectrogram
}