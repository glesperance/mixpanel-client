var _ = require('underscore')
  ;

/* ========================================================================== *
 *  Private Methods                                                           *
 * ========================================================================== */
MixpanelPeople.prototype._sendRequest = function (data, callback) {
  if (!this._identified) {
    if (callback)
      callback(new Error('UNINDENTIFIED_PEOPLE_REQUEST'));
    else
      this._queuedRequests.push(data);
  }

  else
    this._mixpanel._sendRequest(
        '/engage/'
      , _.extend({}, { distinct_id : this._identity }, data)
      , callback
    )
}

MixpanelPeople.prototype._flush = function () {
  if (!this._identified)
    return

  for (var i = 0, ii =  this._queuedRequests; i < ii; i++)
    this._sendRequest(this._queuedRequests[i]);

  this._queuedRequests = []; 
}


/* ========================================================================== *
 *  Public Methods                                                            *
 * ========================================================================== */

MixpanelPeople.prototype.identify = function (unique_id) {
  var $events_distinct_id = this._mixpanel.get_distinct_id();

  this._identity = unique_id;
  this._identified = true;

  if ($events_distinct_id && $events_distinct_id !== unique_id)
    this.set({ '$events_distinct_id': $events_distinct_id })

  this._mixpanel.register({ '$people_distinct_id': unique_id });

  // Flush any queued up people requests
  this._flush();
}

MixpanelPeople.prototype.set = function () {
  var args      = Array.prototype.slice.call(arguments)
    , callback  = typeof args[args.length - 1] === 'function'
                    ? args.pop()
                    : undefined

    , props
    ; 

  if (typeof args[0] === 'object')
    props = args.shift()

  else {
    props = {};
    props[args[0]] = args[1];
  }

  return this._sendRequest({ $set : props }, callback);

};

MixpanelPeople.prototype.increment = function () {
  var args      = Array.prototype.slice.call(arguments)
    , callback  = typeof args[args.length - 1] === 'function'
                    ? args.pop()
                    : undefined

    , props
    ; 

  if (typeof args[0] === 'object')
    props = args.shift()

  else {
    props = {};
    props[args[0]]  = isNaN(args[1])
                        ? 1
                        : args[1] 
                        ;
  }

  return this._sendRequest({ $add : props }, callback);
};


function MixpanelPeople(mixpanel) {
  this._mixpanel = mixpanel;
  this._queuedRequests = [];
}

module.exports = MixpanelPeople;