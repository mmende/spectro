/**
 * Thanks to http://www.audiocheck.net/ for the test audio data.
 * 
 * This example uses pngjs to store the spectrogram into a png file.
 * To run this example you need to install pngjs first:
 *
 * npm install pngjs
 */

const	fs = require('fs'),
		Spectro = require(__dirname + '/../spectro.js'),
		PNG = require('pngjs').PNG

/**
 * This color map is basically a gradient over the specified magnitudes
 *
 * @type {Object}
 */
const colorMap = {
	'130': '#fff',
	'90': '#f00',
	'40': '#00f',
	'10': '#000',
}
/** @type {Function} This function can then be used to get an rgb array for the amplitudes **/
var cFunc = Spectro.colorize(colorMap)

const wFunc = 'Blackman'
/** @type {Spectro} This is our Spectro instance **/
var spectro = new Spectro({
	overlap: 0.5,
	wFunc: wFunc
})

/** @type {Stream} A stream with pcm audio data. (The first 44 bytes are the header...) **/
var audioFile = fs.createReadStream(__dirname + '/audios/audiocheck.net_sin_1000Hz_-3dBFS_3s.wav', {start: 44})
// The stream can now simply be piped into the Spectro instance
audioFile.pipe(spectro)

/**
 * Creates an image from the spectrogram data
 *
 * @param  {Array} spectrogram The spectrogram
 */
function createImage(spectrogram) {
	// Create a png
	var png = new PNG({
		width: spectrogram.length,
		height: spectrogram[0].length,
		filterType: -1
	})
	for (var y = 0; y < png.height; y++) {
		for (var x = 0; x < png.width; x++) {

			// Get the color
			var intensity = spectrogram[x][png.height - y - 1]
			// Now we can use the colorize function to get rgb values for the amplitude
			var col = cFunc(intensity)

			// Draw the pixel
			var idx = (png.width * y + x) << 2
			png.data[idx  ] = col[0]
			png.data[idx+1] = col[1]
			png.data[idx+2] = col[2]
			png.data[idx+3] = 255
		}
	}
	png.pack().pipe(fs.createWriteStream(__dirname + '/images/' + wFunc + '.png'))
	console.log(`Spectrogram written to ${wFunc}.png`)
}

// Capture when the file stream completed
var fileRead = false
audioFile.on('end', () => fileRead = true)

spectro.on('data', (err, frame) => {
	// Check if any error occured
	if (err) return console.error('Spectro ended with error:', err)
})

spectro.on('end', (err, data) => {
	// Check if the file was read completely
	if (fileRead !== true) return console.log('Have not finished reading file')
	// Check if any error occured
	if (err) return console.error('Spectro ended with error:', err)
	// Stop spectro from waiting for data and stop all of it's workers
	spectro.stop()
	
	const time = (spectro.getExecutionTime() / 1000) + 's'
	console.log(`Spectrogram created in ${time}`)

	const max = Spectro.maxApplitude(data)
	const min = Spectro.minApplitude(data)
	console.log(`Max amplitude is ${max}, min amplitude is ${min}`)

	createImage(data)
})