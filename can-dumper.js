const {
  spawn
} = require('child_process');

var dumper = (function () {
  let _dumping = false;
  let canDumper = null;
  // canplayer vcan0=can0 -l i -I candump-2018-03-27_045647.log // example of playing back a can dump file in vcan0

  function stopDumping() {
    if (_dumping === true) {
      _dumping = false;
      if (canDumper) {
        canDumper.kill()
        canDumper = null;
      }
    }
  }

  function startDumping() {
    if (_dumping === false) {
      _dumping = true;
      canDumper = spawn('candump', ['-l', 'can0,0:0,#FFFFFFFF']);
      canDumper.stdout.on('data', data => {
        console.log(`canDumper stdout: ${data}`);
      });

      canDumper.stderr.on('data', data => {
        console.log(`canDumper stderr: ${data}`);
      });

      canDumper.on('close', code => {
        console.log(`canDumper child process exited with code ${code}`);
        stopDumping();
      });
    }
  }

  function isDumping() {
    return _dumping;
  }

  return {
    dumping: isDumping,
    start: startDumping,
    stop: stopDumping,
  }
})();

exports.dumper = dumper;
