'use strict'

var pkg = require('./package.json')
var fs = require('fs-extra')
var path = require('path')
var pug = require('pug')
var _ = require('lodash')
var util = require('util')
var rootPath = process.cwd()

function loadHelpers (dirs) {
  var helpers = {}

  if (_.isArray(dirs)) {
    _.forEach(dirs, function (item) {
      if (_.isObject(item)) {
        _.forIn(item, function (value, key) {
          if (_.isString(key)) {
            if (_.isString(value)) {
              load(value, key)
            } else {
              helpers[key] = value
            }
          }
        })
      } else if (_.isString(item)) {
        load(item)
      }
    })
  } else {
    load(dirs)
  }

  function load (dir, moduleName) {
    var fullPath = path.resolve(dir)
    var stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      _.forEach(fs.readdirSync(dir), function (file) {
        load(dir + '/' + file)
      })
    } else if (stat.isFile()) {
      var mod = require(fullPath)

      if (_.isString(moduleName)) {
        helpers[moduleName] = mod
      } else if (_.isString(mod.moduleName)) {
        helpers[mod.moduleName] = mod.moduleBody
      } else {
        helpers[_.camelCase(path.basename(fullPath, path.extname(fullPath)))] = mod
      }
    }
  }

  return helpers
}

function Pug (options) {
  var defaultOptions = {
    compileDebug: false,
    pretty: false
  }
  var globalNoCache = false
  var compilers = new Map()
  var defaultLocals = {}
  var viewPath
  var helpers = {}

  function compileFile (tpl, locals, compileOptions, skipCache) {
    var tplPath, rawPug, compiler

    if (_.endsWith(tpl, '.pug')) {
      tplPath = path.resolve(viewPath, tpl)
    } else {
      // If view path doesn't end with `.pug`, add `.pug` and check if it exists
      var dirname = path.resolve(viewPath, tpl)
      tplPath = dirname + '.pug'

      // If doesn't exist and the dirname is a folder, then search `index.pug` file
      if (!fs.existsSync(tplPath)) {
        var stat = fs.statSync(dirname)
        if (stat.isDirectory()) {
          tplPath = path.resolve(dirname, 'index.pug')
        }
      }
    }

    rawPug = fs.readFileSync(tplPath)

    compileOptions.filename = tplPath

    if (skipCache) {
      compiler = pug.compile(rawPug, compileOptions)
    } else {
      compiler = compilers.get(tplPath)

      if (!compiler) {
        compiler = pug.compile(rawPug, compileOptions)
        compilers.set(tplPath, compiler)
      }
    }

    return compiler(locals)
  }

  function compileString (tpl, locals, compileOptions) {
    return pug.compile(tpl, compileOptions)(locals)
  }

  /**
   * @param {String}  tpl     the template path, search start from viewPath
   * @param {Object}  locals  locals that pass to Pug compiler, merged with global locals
   * @param {Object}  options options that pass to Pug compiler, merged with global default options
   * @param {Boolean} noCache use cache or not
   */
  function renderer (tpl, locals, options, noCache) {
    var compileOptions = _.merge({}, defaultOptions)

    if (_.isPlainObject(options)) {
      _.merge(compileOptions, options)
    }

    var finalLocals = _.merge({}, helpers, defaultLocals, this.state, locals)
    var compileResult;

    if (compileOptions.fromString) {
      compileResult = compileString(tpl, finalLocals, compileOptions)
    } else {
      var skipCache

      if (_.isBoolean(options)) {
        skipCache = options
      } else {
        skipCache = _.isBoolean(noCache) ? noCache : globalNoCache
      }

      compileResult = compileFile(tpl, finalLocals, compileOptions, skipCache)
    }
    
    if(compileOptions.returnString) {
      return compileResult;
    }

    this.body = compileResult;
    this.type = 'text/html'
    return this
  }

  Object.defineProperties(this, {
    use: {
      enumerable: true,
      value: function (app) {
        app.context.render = renderer
      }
    },

    middleware: {
      enumerable: true,
      get: util.deprecate(function () {
        return function* (next) {
          this.render = renderer
          yield next
        }
      }, 'koa-pug: Pug.middleware is deprecated, use Pug.use instead')
    },

    /* Configuration */
    options: {
      enumerable: true,
      get: function () {
        return defaultOptions
      },
      set: function (options) {
        if (!_.isPlainObject(options)) {
          return
        }

        if (_.isEmpty(options)) {
          defaultOptions = {}
          return
        }

        viewPath = _.isString(options.viewPath) ? options.viewPath : rootPath

        if (_.isPlainObject(options.locals)) {
          defaultLocals = options.locals
        }

        if (_.isBoolean(options.noCache)) {
          globalNoCache = options.noCache
        }

        if (_.isString(options.helperPath) || _.isArray(options.helperPath)) {
          _.merge(helpers, loadHelpers(options.helperPath))
        }

        if (_.isBoolean(options.debug)) {
          defaultOptions.pretty = options.debug
          defaultOptions.compileDebug = options.debug
        } else {
          _.forIn(defaultOptions, function (value, key) {
            if (key in options && _.isBoolean(options[key])) {
              defaultOptions[key] = options[key]
            }
          })
        }

        if (_.isString(options.basedir)) {
          defaultOptions.basedir = options.basedir
        }

        if (options.app && options.app.constructor.name === 'Application') {
          this.use(options.app)
        }
      }
    },

    locals: {
      enumerable: true,
      get: function () {
        return defaultLocals
      },

      set: function (val) {
        if (val == null) {
          defaultLocals = {}
        } else if (_.isPlainObject(val)) {
          defaultLocals = val
        }
      }
    }
  })

  this.options = _.assign({
    compileDebug: false,
    pretty: false
  }, options)
}

Object.defineProperties(Pug, {
  version: {
    enumerable: true,
    value: pkg.version
  }
})

module.exports = Pug
