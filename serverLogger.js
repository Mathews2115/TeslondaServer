var serverLogger = (function() {
  const MAX_ENTRIES = 50;
  let _logArray = [];

  /**
   * @param {string} msg
   */
  let add = function(msg) {
    _logArray.unshift(msg);
    if (_logArray.length > MAX_ENTRIES) {
      _logArray.pop();
    }
  }

  /**
   * @returns {string[]}
   */
  let get = function() {
    return _logArray;
  }

  /**
   * @returns {string}
   */
  let toString = function() {
    return _logArray.join('\n');
  }

  let kill = function() {
    _logArray = [];
  }

  return {
    add:  add,
    get:  get,
    toString: toString,
    kill: kill
  };

})();

exports.serverLogger = serverLogger;
