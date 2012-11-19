var http        = require('http')
  , querystring = require('querystring')

  , cookies     = require('cookies')
  , _           = require('underscore')
  ;

var MixpanelPeople    = require('./mixpanel-people')
  , MIXPANEL_API_HOST = 'api.mixpanel.com'
  , MIXPANEL_API_PORT = 80

  , DEBUG_MODE        = 0
  ;

var GlobalAPIToken
  ;

/* ========================================================================== *
 *  Static Utils Methods                                                      *
 * ========================================================================== */
function getUnixTime() {
  return (Date.now() + '').slice(0,-3) / 1;
}

function debug () {
  if (DEBUG_MODE)
    console.log.apply(console, arguments);
}

function formatDate(d) {
  // YYYY-MM-DDTHH:MM:SS in UTC
  function pad(n) {return n < 10 ? '0' + n : n}
    return d.getUTCFullYear() + '-'
      + pad(d.getUTCMonth() + 1) + '-'
      + pad(d.getUTCDate()) + 'T'
      + pad(d.getUTCHours()) + ':'
      + pad(d.getUTCMinutes()) + ':'
      + pad(d.getUTCSeconds());
}

function encodeDates(obj) {
  _.each(obj, function (v, k) {
    if (v instanceof Date)
      obj[k] = formatDate(v);

    else if (_.isObject(v))
      obj[k] = encodeDates(v); // recurse
  });
  return obj;
}

/* ========================================================================== *
 *  Private Methods                                                           *
 * ========================================================================== */
MixpanelClient.prototype._saveSuperProperties = function() {
  if (this.cookieJar) {
    this.cookieJar.set(
        this.MIXPANEL_COOKIE_NAME
      , encodeURIComponent(JSON.stringify(this.superProperties))
      , this.COOKIE_OPTIONS
    );
  }
}

MixpanelClient.prototype._sendRequest = function(endpointURI, data, callback) {
  
  var properties  = data.properties
    , requestData
    , encodedData
    , jsonData
    ;

  data = encodeDates(data);

  if (properties) {
    if (!properties.token)
      properties.token = this.APIToken;

    if (!properties.time)
      properties.time = getUnixTime();

    if (!properties.ip) {
      if (this.req)
        properties.ip = this.req.connection.remoteAddress;
      else
        properties.ip = 0;
    }
  }

  jsonData = JSON.stringify(_.extend(
      {}
    , data
    , { $distinct_id  : data.distinct_id 
      , $token        : this.APIToken
      }
  ));

  debug('--- jsonData:', jsonData);

  encodedData = new Buffer(jsonData).toString('base64');

  requestData = {
      data  : encodedData
    , t     : 0
  };

  debug('--- requestData:', requestData);

  http.get(
      { host  : MIXPANEL_API_HOST
      , port  : MIXPANEL_API_PORT
      , path  : endpointURI + '?' + querystring.stringify(requestData)
      }

    , function(res) {
        var data = ''
          ;
        
        res.on('data', function(chunk) { data += chunk; });
        
        res.on('end', function() {
            var err
              ;

            data == '1' || (err = new Error('MIXPANEL_API_REQUEST_ERROR: ' + data));

            err && console.log(err);
            callback && callback(err);
        });
      }

  ).on('error', function(err) {
    err && console.log('MIXPANEL_API_REQUEST_ERROR:' + err); 
    callback && callback(err); 
  });

};

/* ========================================================================== *
 *  Public Methods                                                            *
 * ========================================================================== */

/***
 * Track an event caused by a user. This is the most important Mixpanel function 
 * and is the one you will be using the most.
 *
 * @param {String} eventName The name of the event to track. This can be 
 *     anything a user does - "button click", "user signup", "item purchased", 
 *     etc. You can name your events anything you like.
 *
 * @param {Object} properties (optional) A set of properties to include with the 
 *     event you're sending. These can describe the user who did the event or 
 *     the event itself. 
 */
MixpanelClient.prototype.track = function(eventName, properties, callback) {
  var compiledProperties
    ;

  compiledProperties = {
      event       : eventName
    , properties  : _.extend(new Object(this.superProperties), properties)
  };

  this._sendRequest('/track', compiledProperties, callback);
};

/***
 * Store a persistent set of properties for a user (i.e. super properties). 
 * These properties are automatically included with all events sent by the user.
 * 
 * @param {Object} properties A dictionary of information about the user to 
 *     store. This is often information you just learned, such as the user's age 
 *     or gender, that you'd like to send with later events. 
 */
MixpanelClient.prototype.register = function(properties) {
  for (var key in properties) {
    this.superProperties[key] = properties[key];
  }

  this._saveSuperProperties();
};

/***
 * Store a persistent set of properties about a user, but only save them if they 
 * haven't been set before. Useful for storing one-time values, or when you want 
 * first-touch attribution.
 *
 * @param {Object} properties A dictionary of information about the user to 
 *     store. This is often information you just learned, such as the user's age 
 *     or gender, that you'd like to send with later events. 
 *
 * @param {*} (Optinal) If the current value of the super property is this 
 *     default value (ex: "False", "None") and a different value is set, we will 
 *     override it. Defaults to 'undefined'.
 */
MixpanelClient.prototype.register_once = function(properties, defaultValue) {

  for (var key in properties) {
    if (  !this.superProperties.hasOwnProperty(key) 
    ||    (defaultValue && this.superProperties[key] === defaultValue)) 
    {
      newProperties[key] = properties[key];
    }
  }

  return this.register(newProperties);
};

/***
 * Delete a super property stored on this user, if it exists.
 *
 * @param {String} propertyName The name of the super property to remove. If it 
 *     doesn't exist, this call will do nothing.
 */
MixpanelClient.prototype.unregister = function(propertyName) {
  var count = 0
    ;

  this.superProperties.hasOwnProperty(key) && (count++);

  delete this.superProperties[propertyName];
  this._saveSuperProperties();

  return count;
};

/***
 * Get the value of a super property by the property name.
 * 
 * @param {String} propertyName The name of the super property to retrieve.
 */
MixpanelClient.prototype.get_property = function(propertyName) {
  return this.superProperties[propertyName];
};

MixpanelClient.prototype.get_distinct_id = function () {
  return this.get_property('distinct_id');
}

/***
 * Identify a user with a unique ID. All subsequent events sent by this user 
 * will be tied to the new identity. If this method is not called, unique users 
 * will be identified by a UUID generated the first time they visit your site.
 *
 * @param {String} uniqueId A string that uniquely identifies the user, such as 
 *     the user's ID in your database.
 */
MixpanelClient.prototype.identify = function(uniqueId) {
  return this.register({ 'distinct_id' : uniqueId });
};

/***
 * Set a human-readable name for the user to be displayed in the Streams 
 * interface. Name tags do not have to be unique.
 *
 * @param {String} nameTag A human-readable name for the user. This name will 
 *     show up in the Mixpanel Streams interface.
 */
MixpanelClient.prototype.name_tag = function(nameTag) {
  return this.register({ 'mp_name_tag' : nameTag });
};

/* ========================================================================== *
 *  Static Public Methods                                                     *
 * ========================================================================== */
MixpanelClient.setAPIToken = function(APIToken) {
  globalAPIToken = APIToken;
};

/* ========================================================================== *
 *  MixpanelClient's Constructor                                              *
 * ========================================================================== */

/***
 * MixpanelClient's Constructor
 *
 * @param {String} APIToken The mixpanel API token.
 * @param {Object} req The `req` object as passed by express/connect to their 
 *     middlewares.
 * @param {Object} res The `res` object as passed by express/connect to their 
 *     middlewares.
 */
function MixpanelClient() {
  var args      = Array.prototype.slice.call(arguments)
    , APIToken  = typeof args[0] === 'string' ? args.shift() : undefined

    , req       = args.shift()
    , res       = args.shift()
    ;

  this.req                  = req;
  this.res                  = res;

  this.APIToken             = APIToken || globalAPIToken;

  this.MIXPANEL_COOKIE_NAME = 'mp_' + this.APIToken + '_mixpanel';

  if (this.req)
    this.COOKIE_OPTIONS = {
        secure    : false
      , httpOnly  : false
      , expires   : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      , domain    : '.' + this.req.headers.host.split('.').slice(-2).join('.')
    };

  this.cookieJar  = this.req && this.res 
                      ? new cookies(req, res) 
                      : undefined
                      ;

  this.superProperties  = this.cookieJar && this.cookieJar.get(this.MIXPANEL_COOKIE_NAME) 
                            ? JSON.parse(decodeURIComponent(this.cookieJar.get(this.MIXPANEL_COOKIE_NAME))) 
                            : {}
                            ;

  this.people = new MixpanelPeople(this);
}

/* ========================================================================== */
/* ========================================================================== */

module.exports = MixpanelClient;