# A clustered nods.js module to create spectrograms from pcm audio data

# Install

Spectro can be installed via npm:

`npm install spectro`

# Usage

By using a cluster of workers to process the computational expensive stuff the execution time can be decreased dramatically.
The spectrogram class is a writable stream where the data can be piped into.
So the easiest way to use it is to pipe a wav file into it:

```js
const Spectro = require('spectro')
const fs = require('fs')

var sp = new Spectro()
var audioFile = fs.createReadStream('file.wav', {start: 44}) // Note: The first 44 bytes are the wav-header

// The file stream can simply be piped into the Spectro instance
audioFile.pipe(sp)

// Check when the file stream completed
var fileRead = false
audioFile.on('end', () => fileRead = true)

// The data event can be used to work with recently processed data from the workers
spectro.on('data', (err, frame) => {
    if (err) console.error('Spectro data event has an error', err)
    // frame contains an index of the processed frame and a data section with the processed data
})

spectro.on('end', (err, data) => {
    if (err) return console.error('Spectro ended with an error', err)
    // The 'end' event always fires when spectro has reached the end of the currently processable data
    // Therefore we should check if the file was read completely before using the data
    if (fileRead !== true) return

    // Stop spectro from waiting for data and stop all of it's workers
    spectro.stop()

	// The spectrogram can e.g. be drawn with third party modules such as pngjs
	// Examples therefore can be found in examples/...
})
``` 

# Methods

**Constructor**

The constructor can be called with an options object with these options:

Option     | Default       | Description
-----------|---------------|------------
`bps`      | 16            | Bits per second of the audio
`channels` | 1             | The channels count of the audio (allowed: 1)
`wSize`    | 1024          | The window size being used for the dct
`wFunc`    | 'Hamming'     | The window function to use
`overlap`  | 0             | The overlap size: `0 <= overlap < 1`
`workers`  | \<CPU cores\> | How many workers should be created to process the data

**Instance methods**

* `stop()` - Stops all workers from further processing of incoming data
* `start()` - Recreates the workers that compute the spectrogram on incoming data  
**Note:** `start()` will automatically be called with the constructor
* `clear()` - Triggers `stop()` and resets all data and the time measuring
* `executionTime(): number` - Returns the execution time in ms

**Static methods**

* `colorize(colorMap): Function` - Returns colorization function for the amplitudes.
* `maxApplitude(): number` - Returns the maximum applitude of a spectrogram
* `minApplitude(): number` - Returns the minimum applitude of a spectrogram

# Events

Event  | Parameters     | Description
-------|----------------|------------
`data` | `err`, `frame` | When a new frame was processed. `frame` has an `index` and a `data` array
`end`  | `err`, `data` | When all possible windows where processed. This event can be called several times before the complete audio has been piped into the Spectro instance. `data` is a two-dimensional array with the amplitudes

# Window functions

The following window functions are implemented:

* `Square`
* `Hamming`
* `VonHann` (Hanning)
* `Blackman` (default)
* `BlackmanHarris`
* `BlackmanNuttall`
* `Bartlett`

# Limitations

Only mono is supported at the moment.