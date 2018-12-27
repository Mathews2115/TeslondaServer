// TODO: support LIVE GRAPHING
// Writes CSV log file in millisecond resolution
//
//  Log format: (see LOG_HEADER)
//  Example: // '{12312.12411},canbus,---,217,FFFFEA00,{21314.1231 can0 121#FFFFEA00'}
//
//  The last field is the raw candump.  A parser can rip this portion out and use it for can-player and other utils
//
var logger = (function () {
  let _loggingFile = null,
    _streamingFile = null,
    _startTime,
    _canChannel = "",
    _stream = null,
    fs = require("fs"),
    LogReader = require('./log-reader.js'),
    reader = null,
    extrasIO,
    appio,
    extraSockets = new Set(),
    logCache = [],
    loggingInterval = null,
    streamTimer = -1,
    streamTotalLength = 0;

  const LOG_PROPERTY = {
    TIME: 'time',
    TYPE: 'type',
    GPS: 'GPS',
    CAN_ID: 'can_id',
    CAN_DATA: 'can_data',
    CANDUMP: 'candump'
  };

  const LOG_HEADER = `${LOG_PROPERTY.TIME},${LOG_PROPERTY.TYPE},${LOG_PROPERTY.GPS},${LOG_PROPERTY.CAN_ID},${LOG_PROPERTY.CAN_DATA},${LOG_PROPERTY.CANDUMP}`;
  const NS_PER_SEC = 1e9;
  const NS_PER_MS = 1000000;
  const LOG_DIR = './log/'
  const LOG_EVENTS = {
    GET_LOGS: "list logs",
    LOGS_RECEIVED: "list_update",
    STREAM_UPDATE: "stream_update",
    START: "start logging",
    LOAD: "load log",
    DELETE: "delete log",
    ALL_STOP: "all stop"
  };

  /**
   * @private
   * @type {obj}
   */
  const DATA_TYPE = {
    CAN: 'canbus',
    GPS: 'gps'
  }

  /**
   * @private
   * @param {obj} param0
   */
  const toLogEntry = ({
    ts,
    logType,
    GPS = '---',
    CAN_ID = '---',
    CAN_DATA = '---',
    canDump = '---'
  }) => {
    return `${ts[0]}.${ts[1]},${logType},${GPS},${CAN_ID},${CAN_DATA},${formatCAN(canDump)}\n`
  }

  /**
   * @private
   * @param {string} str
   */
  function escape(str) {
    str = str + '';
    return (str.replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\//g, '&#x2F;')
      .replace(/\\/g, '&#x5C;')
      .replace(/`/g, '&#96;'));
  }

  /**
   * convert canmsg to match what you would see in the candump command example: (1522442563.334972) can0 116#00470002
   * @private
   * @param {obj} canMsg
   * @returns {string} string formatted in CAN output
   */
  function formatCAN(canMsg) {
    return `(${canMsg.ts_sec}.${canMsg.ts_usec}) ${_canChannel} ${parseInt(canMsg.id).toString(16)}#${canMsg.data.toString('hex')}`;
  }

  /**
   * Gives a file name to the log file.
   * @private
   * @param {string} name Name or type of log file.
   * @returns {string} Name of file
   */
  function nameFile(name) {
    date = new Date();
    return `${name}-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}--${date.getTime()}.log`;
  }

  /**
   * Queue timer to send a data chunk to client
   * @private
   */
  function queueStream() {
    if (streamTimer === -1) {
      streamTimer = setTimeout(streamData, 200);
    }
  }

  /**
   * Send Data chunk to client via socket connection
   * @private
   */
  function streamData() {
    // data we will be sending up - it will be combined into a single packet
    let buffers = [];
    streamTotalLength = 0; // total length of packet

    let i = 0; const iMax = logCache.length; for (; i < iMax; i++) {
      // allocate buffer big enough to hold TS tuple, ID, bytelength, actual can data.
      const buf = Buffer.allocUnsafe(11 + Buffer.byteLength(logCache[i].canMsg.data));
      // seconds / nanoseconds
      buf.writeUInt32BE(logCache[i].elapsed[0], 0);
      buf.writeUInt32BE(logCache[i].elapsed[1], 4);

      // can ID
      buf.writeUInt16BE(logCache[i].canMsg.id, 8);

      // can data length
      buf.writeUInt8(Buffer.byteLength(logCache[i].canMsg.data), 10);

      // copy can data into buffer
      logCache[i].canMsg.data.copy(buf, 11, 0);

      buffers.push(buf);
      streamTotalLength += buf.length;
    }

    if (streamTotalLength) {
      let packet = Buffer.concat(buffers, streamTotalLength);
      for (const s of extraSockets) {
        s.binary(true).emit(LOG_EVENTS.STREAM_UPDATE, packet);
      }
    }
    streamTimer = -1;
    logCache = [];
  }

  /**
   * Start logging data into a file
   * @param {string} name Name of log
   * @param {string} canChannel name of the can channel this data came from
   * @private
   */
   function start(name, canChannel) {
    stopStreaming();

    if (_loggingFile == null) {
      name = name || "log";
      name = nameFile(name);
      _canChannel = canChannel;
      _startTime = process.hrtime();
      _loggingFile = name;
      _stream = fs.createWriteStream(`${LOG_DIR}${name}`, {  flags: 'w' });
      _stream.on("error", (e) => {
        _loggingFile = null;
        console.error(e);
      });
      _stream.write(LOG_HEADER + '\n');
    }
    return name;
  };

  /**
   * Kills the file writer streamer
   * @private
   */
  function stopLogging () {
    if (_loggingFile) {
      _loggingFile = null;
      // close stream
      _stream.end();
    }
  };

  /**
   * Kills the file reader streamer
   * @private
   */
  function stopStreaming () {
    if (_streamingFile) {
      if (reader) {
        reader.stop();
      }
      reader = null;
      _streamingFile = null;
    }
  }

  /**
   * Loads a log file and begins to read chunks of data until complete
   * @private
   * @param {string} fileName name of file
   */
  function loadLog (fileName, OnBatchRead, onError, onComplete) {
    console.log('LOGGER: Loading' + fileName);
    stopStreaming();

    reader = new LogReader(LOG_DIR + fileName, LOG_HEADER.split(','));

    _streamingFile = fileName;

    reader.read((data) => {
      // NEXT: DATA CHUNK READ
      OnBatchRead(data);
      if (reader) {
        reader.continue();
      }
    }, (msg) => {
      // ERROR: called when stream is interrupted or errored out
      _streamingFile = null;
      onError(msg);
    }, () => {
      // COMPLETE: called when completed
      stopStreaming();
      onComplete();
    });
  }

  /**
   * On success, will call 'onsuccess' with a list of log files
   * @param {Function} onSuccess
   * @param {Function} onError
   * @private
   */
  function list (onSuccess, onError) {
    stopStreaming();
    setTimeout(() =>
      // fs.readdir(path[, options], callback)
      fs.readdir(LOG_DIR, (err, files) => {
        if (err) {
          console.log('Unable to scan directory: ' + err);
          onError(err);
        } else {
          // let i = 0; const iMax = items.length; for(; i < iMax; i++) { }
          // todo: trim out non log files?
          // console.log(files);
          onSuccess(files);
        }
      })
    );
  };

  /**
   * msg: {id: number, data: NodeBuffer} or GPS data?
   * @param {DATA_TYPE} type
   * @param {*} canMsg
   */
  let log = function (type, canMsg) {
    if (_loggingFile != null) {
      let ts = process.hrtime(_startTime);
      if (type == DATA_TYPE.CAN) {
        // '{timestamp},{CAN0}, {hsr id}, {hsr data}, {21314.1231 can0 121#FFEEFFEE'}
        _stream.write(toLogEntry({
          ts: ts,
          logType: DATA_TYPE.CAN,
          CAN_ID: parseInt(canMsg.id),
          CAN_DATA: canMsg.data.toString('hex'),
          canDump: canMsg
        }));
      }
      logCache.push({ canMsg: canMsg, elapsed: ts });
    }
  };

  let loggingFile = function () {
    return _loggingFile;
  }
  let streamingFile = function () {
    return _streamingFile;
  }

  let allStop = function() {
    stopLogging();
    stopStreaming();

    clearInterval(loggingInterval);
    clearTimeout(streamTimer);
    streamTimer = -1;
    logCache = [];
    console.log('Logging/Streaming Stopped');
  }

  /**
   * Inits logger instance
   * 1 - creates the log directory if it doesnt exist
   * 2 - Inits socket interface
   */
  let init = function (appio) {
    if (!fs.existsSync(LOG_DIR)) {
      console.log('Creating directory ' + LOG_DIR);
      fs.mkdirSync(LOG_DIR);
    }
    // **********************************************
    //      SOCKET HANDLING
    // **********************************************
    extrasIO = appio.of('/extra');
    extrasIO.on('connection', (socket) => {
      extraSockets.add(socket);
      socket.on('disconnect', () => extraSockets.delete(socket));

      // Logging support
      socket.on(LOG_EVENTS.START, (data, callback) => {
        if (!loggingFile()) {
          stopLogging();
          let name = start(data.name, process.env.CHANNEL)
          loggingInterval = setInterval(streamData, 200);
          callback({fileName: name});
        }
      });

      // get list of log files
      socket.on(LOG_EVENTS.GET_LOGS, (data) => {
        list((logs) => socket.emit(LOG_EVENTS.LOGS_RECEIVED, {
          list: logs
        }), (err) => socket.emit(LOG_EVENTS.LOGS_RECEIVED, {
          error: err
        }));
      });

      socket.on(LOG_EVENTS.LOAD, (fileName, callback) => {
        logCache = [];

        // make sure we stop anything that is happening; prep for streaming data;
        stopLogging();
        stopStreaming();

        callback({fileName: fileName});

        // queue up a stream request (send chunk of data to client)
        queueStream();

        loadLog(escape(fileName), (data) => {
          // stream log data to client (emulate like it was coming in live...kindof);
          if (data.time && !Number.isNaN(parseFloat(data.time))) {
            queueStream();
            logCache.push({
              canMsg: {
                id: data.can_id,
                data: Buffer.from(data.can_data, 'hex')
              },
              elapsed: data.time.split('.')
            });
          }
        }, (msg) => {   // error; stop stream
          stopStreaming();
          console.error("ERROR: load log: " + msg);
        }, stopStreaming)  // completed; stop stream
      });

      socket.on(LOG_EVENTS.DELETE, (fileName) => {
        allStop();
        let file = `${LOG_DIR}${fileName}`;
        fs.unlink(file, (err) => console.error(err));
      });

      socket.on(LOG_EVENTS.ALL_STOP, () => allStop() )
    });
  }

  return {
    streaming: streamingFile,   // we are streaming data from a log file.
    logging: loggingFile,       // we currently saving data coming from the car. AND streaming.
    log: log,
    TYPE: DATA_TYPE,
    init: init,
    kill: allStop
  };
})();

exports.logger = logger;
