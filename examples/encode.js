var file = require('../')

var x;
var y;
var z = {x:10,y:20};

// Prints the encoded object.
console.log(file.encode(z,"test"))