var file = require('../')

var x = "test'';test";

// Prints a safe version of the string for use.
console.log(file.safe(x))

// Prints the unsafe version of the string by undoing the safe.
console.log(file.unsafe(file.safe(x)))