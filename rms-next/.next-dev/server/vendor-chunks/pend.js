/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/pend";
exports.ids = ["vendor-chunks/pend"];
exports.modules = {

/***/ "(rsc)/./node_modules/pend/index.js":
/*!************************************!*\
  !*** ./node_modules/pend/index.js ***!
  \************************************/
/***/ ((module) => {

eval("module.exports = Pend;\n\nfunction Pend() {\n  this.pending = 0;\n  this.max = Infinity;\n  this.listeners = [];\n  this.waiting = [];\n  this.error = null;\n}\n\nPend.prototype.go = function(fn) {\n  if (this.pending < this.max) {\n    pendGo(this, fn);\n  } else {\n    this.waiting.push(fn);\n  }\n};\n\nPend.prototype.wait = function(cb) {\n  if (this.pending === 0) {\n    cb(this.error);\n  } else {\n    this.listeners.push(cb);\n  }\n};\n\nPend.prototype.hold = function() {\n  return pendHold(this);\n};\n\nfunction pendHold(self) {\n  self.pending += 1;\n  var called = false;\n  return onCb;\n  function onCb(err) {\n    if (called) throw new Error(\"callback called twice\");\n    called = true;\n    self.error = self.error || err;\n    self.pending -= 1;\n    if (self.waiting.length > 0 && self.pending < self.max) {\n      pendGo(self, self.waiting.shift());\n    } else if (self.pending === 0) {\n      var listeners = self.listeners;\n      self.listeners = [];\n      listeners.forEach(cbListener);\n    }\n  }\n  function cbListener(listener) {\n    listener(self.error);\n  }\n}\n\nfunction pendGo(self, fn) {\n  fn(pendHold(self));\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvcGVuZC9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQUk7QUFDSjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3Jtcy1uZXh0Ly4vbm9kZV9tb2R1bGVzL3BlbmQvaW5kZXguanM/NjQ3MSJdLCJzb3VyY2VzQ29udGVudCI6WyJtb2R1bGUuZXhwb3J0cyA9IFBlbmQ7XG5cbmZ1bmN0aW9uIFBlbmQoKSB7XG4gIHRoaXMucGVuZGluZyA9IDA7XG4gIHRoaXMubWF4ID0gSW5maW5pdHk7XG4gIHRoaXMubGlzdGVuZXJzID0gW107XG4gIHRoaXMud2FpdGluZyA9IFtdO1xuICB0aGlzLmVycm9yID0gbnVsbDtcbn1cblxuUGVuZC5wcm90b3R5cGUuZ28gPSBmdW5jdGlvbihmbikge1xuICBpZiAodGhpcy5wZW5kaW5nIDwgdGhpcy5tYXgpIHtcbiAgICBwZW5kR28odGhpcywgZm4pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMud2FpdGluZy5wdXNoKGZuKTtcbiAgfVxufTtcblxuUGVuZC5wcm90b3R5cGUud2FpdCA9IGZ1bmN0aW9uKGNiKSB7XG4gIGlmICh0aGlzLnBlbmRpbmcgPT09IDApIHtcbiAgICBjYih0aGlzLmVycm9yKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmxpc3RlbmVycy5wdXNoKGNiKTtcbiAgfVxufTtcblxuUGVuZC5wcm90b3R5cGUuaG9sZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gcGVuZEhvbGQodGhpcyk7XG59O1xuXG5mdW5jdGlvbiBwZW5kSG9sZChzZWxmKSB7XG4gIHNlbGYucGVuZGluZyArPSAxO1xuICB2YXIgY2FsbGVkID0gZmFsc2U7XG4gIHJldHVybiBvbkNiO1xuICBmdW5jdGlvbiBvbkNiKGVycikge1xuICAgIGlmIChjYWxsZWQpIHRocm93IG5ldyBFcnJvcihcImNhbGxiYWNrIGNhbGxlZCB0d2ljZVwiKTtcbiAgICBjYWxsZWQgPSB0cnVlO1xuICAgIHNlbGYuZXJyb3IgPSBzZWxmLmVycm9yIHx8IGVycjtcbiAgICBzZWxmLnBlbmRpbmcgLT0gMTtcbiAgICBpZiAoc2VsZi53YWl0aW5nLmxlbmd0aCA+IDAgJiYgc2VsZi5wZW5kaW5nIDwgc2VsZi5tYXgpIHtcbiAgICAgIHBlbmRHbyhzZWxmLCBzZWxmLndhaXRpbmcuc2hpZnQoKSk7XG4gICAgfSBlbHNlIGlmIChzZWxmLnBlbmRpbmcgPT09IDApIHtcbiAgICAgIHZhciBsaXN0ZW5lcnMgPSBzZWxmLmxpc3RlbmVycztcbiAgICAgIHNlbGYubGlzdGVuZXJzID0gW107XG4gICAgICBsaXN0ZW5lcnMuZm9yRWFjaChjYkxpc3RlbmVyKTtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gY2JMaXN0ZW5lcihsaXN0ZW5lcikge1xuICAgIGxpc3RlbmVyKHNlbGYuZXJyb3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBlbmRHbyhzZWxmLCBmbikge1xuICBmbihwZW5kSG9sZChzZWxmKSk7XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/pend/index.js\n");

/***/ })

};
;