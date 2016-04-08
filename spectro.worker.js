'use strict'

const cluster = require('cluster')

/***********************/
/*** The worker code ***/
/***********************/
if (cluster.isWorker) {

	const dct = require('dct')
	const windowFunctions = {
		/**
		 * A Square Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		Square: function(n, m) {
			return 1
		},
		/**
		 * A Von-Hann Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		VonHann: function(n, m) {
			return 0.5 * (1 - Math.cos( (2 * Math.PI * n) / (m - 1) ))
		},
		/**
		 * A Haming Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		Hamming: function(n, m) {
			return 0.54 - 0.46 * Math.cos( (2 * Math.PI * n) / (m - 1) )
		},
		/**
		 * A Blackman Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		Blackman: function(n, m) {
			const alpha = 0.16
			const a0 = (1 - alpha) / 2
			const a1 = 0.5
			const a2 = alpha / 2

			return a0 - a1 * Math.cos( (2 * Math.PI * n) / (m - 1) ) + a2 * Math.cos( (4 * Math.PI * n) / (m - 1) )
		},
		/**
		 * A Blackman-Harris Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		BlackmanHarris: function(n, m) {
			const a0 = 0.35875
			const a1 = 0.48829
			const a2 = 0.14128
			const a3 = 0.01168

			return a0 - a1 * Math.cos( (2 * Math.PI * n) / (m - 1) ) + a2 * Math.cos( (4 * Math.PI * n) / (m - 1) ) - a3 * Math.cos( (6 * Math.PI * n) / (m - 1) )
		},
		/**
		 * A Blackman-Nuttall Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		BlackmanNuttall: function(n, m) {
			const a0 = 0.3635819
			const a1 = 0.4891775
			const a2 = 0.1365995
			const a3 = 0.0106411

			return a0 - a1 * Math.cos( (2 * Math.PI * n) / (m - 1) ) + a2 * Math.cos( (4 * Math.PI * n) / (m - 1) ) - a3 * Math.cos( (6 * Math.PI * n) / (m - 1) )
		},
		/**
		 * A Bartlett Window function
		 *
		 * @param {number} n The iterator
		 * @param {number} m The window size
		 */
		Bartlett: function(n, m) {
			return (2 / (m - 1)) * ( ((m - 1) / 2) - Math.abs( n - ((m - 1) / 2) ) )
		}
	}

	process.send({ status: 'readyForData' })
	process.on('message', (msg) => {
		switch(msg.action) {
			case 'processData':
				// The data are stored in msg.data
				var data = msg.data
				// Apply the window function onto the data
				// The function name is in msg.windowFunction
				var m = data.length
				for (var n = 0, j = data.length; n < j; ++n)
					data[n] = data[n] * windowFunctions[msg.windowFunction](n, m)
				// Apply a discrete cosine transform ont the data
				var coef = dct(data)
				// Convert the amplitudes to dB
				for (var i = 0, j = coef.length; i < j; ++i)
					coef[i] = 20 * Math.log10( Math.abs( coef[i] ) )
				// Send the result back to the master
				process.send({
					status: 'readyForData',
					result: {
						data: coef,
						index: msg.index
					}
				})
				break
			case 'shutdown':
				//console.log('Worker shutting down...')
				break
		}
	})
}