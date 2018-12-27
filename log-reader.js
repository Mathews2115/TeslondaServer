'use strict'

// credit: https://stackoverflow.com/questions/16010915/parsing-huge-logfiles-in-node-js-read-in-line-by-line
// example usage
// let reader = CSVReader('path_to_file.csv')
// reader.read(() => reader.continue())

const fs = require('fs'),
  es = require('event-stream'),
  parse = require("csv-parse");

class LogReader {
  constructor(filename, columns) {
    this.reader = fs.createReadStream(filename);
    this.parseOptions = {
      columns: columns,
      skip_empty_lines: true
    }
  }

  stop() {
    this.reader.pause();
    this.reader.close();
    this.reader.destroy();
  }

  read(callback, errorCallback, onComplete) {
    this.reader
      .pipe(es.split())
      .pipe(es.mapSync(line => {
          this.reader.pause();
          // parse data and push to line data
          parse(line, this.parseOptions, (err, output) => {
            if (err) {
              errorCallback(err);
              return
            }
            if (output && output[0]) {
              callback(output[0])
            }
          });
        })
        .on('error', function () {
          errorCallback('Error while reading file.')
        })
        .on('end', () => onComplete())
      );
  }

  continue () {
    this.reader.resume()
  }
}

module.exports = LogReader
