exports.parse = exports.decode = decode
exports.stringify = exports.encode = encode

exports.safe = safe
exports.unsafe = unsafe

var eol = process.platform === 'win32' ? '\r\n' : '\n'

/**
 * Endcodes an object into an ini-style formatted string.
 * @param {object} obj - Object that will be changed into a ini-style formatted string.
 * @param {variable} opt - Can be a string or boolean. If a string, it will be the first section in the encoded ini data. If a boolean, it specifies whether to put whitespace around the = character.
 * @return {string} out - The resulting ini-style formatted string created from the obj and opt parameters.
 */
function encode (obj, opt) {
  var children = []
  var out = ''
  
  if (typeof opt === 'string') { /** If the opt is a string, then it will be the first section in the encoded ini data. */
    opt = {
      section: opt,
      whitespace: false
    }  
  } else { /** If the opt is a boolean, then there will be whitespace around the = character. */
    opt = opt || {}
    opt.whitespace = opt.whitespace === true
  }

  var separator = opt.whitespace ? ' = ' : '='

  Object.keys(obj).forEach(function (k, _, __) { /** Checks for section paramaters */
    var val = obj[k]
    if (val && Array.isArray(val)) { /** Checks if section parameter is given, if so then all top-level properties of the object are put into this section and the section string is prepended to all sub-sections. */
      val.forEach(function (item) {
        out += safe(k + '[]') + separator + safe(item) + '\n'
      })
    } else if (val && typeof val === 'object') { /** Determines object is not parent-level, is child-level. */
      children.push(k)
    } else {
      out += safe(k) + separator + safe(val) + eol
    }
  })

  if (opt.section && out.length) {
    out = '[' + safe(opt.section) + ']' + eol + out
  }

  children.forEach(function (k, _, __) { /** Adds properties to beginning of child objects */
    var nk = dotSplit(k).join('\\.')
    var section = (opt.section ? opt.section + '.' : '') + nk
    var child = encode(obj[k], {
      section: section,
      whitespace: opt.whitespace
    })
    if (out.length && child.length) {
      out += eol
    }
    out += child
  })

  return out
}

/**
 * Changes a string to a usable string key/value pair object.
 * @param {string} str - String to be changed into object.
 * @return {object} out - The resulting object from changing the str parameter into string key/value pairs.
 */
function dotSplit (str) {
  return str.replace(/\1/g, '\u0002LITERAL\\1LITERAL\u0002')
    .replace(/\\\./g, '\u0001')
    .split(/\./).map(function (part) {
    return part.replace(/\1/g, '\\.')
      .replace(/\2LITERAL\\1LITERAL\2/g, '\u0001')
  })
}

/**
 * Decodes an ini-style formatted string into a nested object.
 * @param {string} str - String that will be formatted into a nested object.
 * @return {object} out - The resulting nested object that was decoded from the ini-style formatted str.
 */
function decode (str) {
  var out = {}
  var p = out
  var section = null
  //          section     |key      = value
  var re = /^\[([^\]]*)\]$|^([^=]+)(=(.*))?$/i
  var lines = str.split(/[\r\n]+/g)

  lines.forEach(function (line, _, __) {
    if (!line || line.match(/^\s*[;#]/)) return
    var match = line.match(re)
    if (!match) return
    if (match[1] !== undefined) {
      section = unsafe(match[1])
      p = out[section] = out[section] || {}
      return
    }
    var key = unsafe(match[2])
    var value = match[3] ? unsafe((match[4] || '')) : true
    switch (value) {
      case 'true':
      case 'false':
      case 'null': value = JSON.parse(value)
    }

    /** Convert keys with '[]' suffix to an array. */
    if (key.length > 2 && key.slice(-2) === '[]') {
      key = key.substring(0, key.length - 2)
      if (!p[key]) {
        p[key] = []
      } else if (!Array.isArray(p[key])) {
        p[key] = [p[key]]
      }
    }

    /** Safeguards against resetting a previously defined array by accidentally forgetting the brackets. */
    if (Array.isArray(p[key])) {
      p[key].push(value)
    } else {
      p[key] = value
    }
  })

  /** {a:{y:1},"a.b":{x:2}} --> {a:{y:1,b:{x:2}}}
  Uses a filter to return the keys that have to be deleted. */
  Object.keys(out).filter(function (k, _, __) {
    if (!out[k] ||
      typeof out[k] !== 'object' ||
      Array.isArray(out[k])) {
      return false
    }
    /** Checks if the parent section is also an object. If so, add it to that, and mark this one for deletion. */
    var parts = dotSplit(k)
    var p = out
    var l = parts.pop()
    var nl = l.replace(/\\\./g, '.')
    parts.forEach(function (part, _, __) {
      if (!p[part] || typeof p[part] !== 'object') p[part] = {}
      p = p[part]
    })
    if (p === out && nl === l) {
      return false
    }
    p[nl] = out[k]
    return true
  }).forEach(function (del, _, __) {
    delete out[del]
  })

  return out
}

/**
 * Checks if the string is surrounded in quotations.
 * @param {string} val - String to be checked for quotations.
 * @return {boolean} - Returned to show if the string is in quotations.
 */
function isQuoted (val) {
  return (val.charAt(0) === '"' && val.slice(-1) === '"') ||
    (val.charAt(0) === "'" && val.slice(-1) === "'")
}

/**
 * Escapes the string val such that it is safe to be used as a key or value in an ini-file. Essentially, it escapes quotes.
 * @param {string} val - String that will be changed so that is it usable as a key or value in an ini-file.
 */
function safe (val) {
  return (typeof val !== 'string' ||
    val.match(/[=\r\n]/) ||
    val.match(/^\[/) ||
    (val.length > 1 &&
     isQuoted(val)) ||
    val !== val.trim()) ?
      JSON.stringify(val) :
      val.replace(/;/g, '\\;').replace(/#/g, '\\#')
}

/**
 * Unescapes the string val.
 * @param {string} val - Initial string that is escaped.
 * @return {string} val - Resulting string after changing that is unescaped.
 */
function unsafe (val, doUnesc) {
  val = (val || '').trim()
  if (isQuoted(val)) {
    /** remove the single quotes before calling JSON.parse */
    if (val.charAt(0) === "'") {
      val = val.substr(1, val.length - 2)
    }
    try { val = JSON.parse(val) } catch (_) {}
  } else {
    /** walk the val to find the first not-escaped ; character */
    var esc = false
    var unesc = ''
    for (var i = 0, l = val.length; i < l; i++) {
      var c = val.charAt(i)
      if (esc) {
        if ('\\;#'.indexOf(c) !== -1) {
          unesc += c
        } else {
          unesc += '\\' + c
        }
        esc = false
      } else if (';#'.indexOf(c) !== -1) {
        break
      } else if (c === '\\') {
        esc = true
      } else {
        unesc += c
      }
    }
    if (esc) {
      unesc += '\\'
    }
    return unesc
  }
  return val
}