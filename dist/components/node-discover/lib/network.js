"use strict";

require("core-js/modules/es6.object.to-string");

const dgram = require('dgram');

const redis = require('./redis');

const mqtt = require('./mqtt');

const crypto = require('crypto');

const os = require('os');

const EventEmitter = require('events').EventEmitter;

const util = require('util');

const uuid = require('uuid/v4');

const nodeVersion = process.version.replace('v', '').split(/\./gi).map(function (t) {
  return parseInt(t, 10);
});
const procUuid = uuid();
const hostName = process.env.DISCOVERY_HOSTNAME || os.hostname();
module.exports = Network;

function Network(options) {
  if (!(this instanceof Network)) {
    return new Network(options, callback);
  }

  EventEmitter.call(this);
  const self = this;
  var options = options || {};
  self.address = options.address || '0.0.0.0';
  self.port = options.port || 12345;
  self.broadcast = options.broadcast || null;
  self.multicast = options.multicast || null;
  self.multicastTTL = options.multicastTTL || 1;
  self.unicast = options.unicast || null;
  self.key = options.key || null;
  self.reuseAddr = options.reuseAddr === false ? false : true;
  self.ignoreProcess = options.ignoreProcess === false ? false : true;
  self.ignoreInstance = options.ignoreInstance === false ? false : true;
  self.redis = options.redis;
  self.mqtt = options.mqtt;
  self.hostName = options.hostname || hostName;
  self.instanceUuid = uuid();
  self.processUuid = procUuid;

  if (self.mqtt) {
    self.socket = mqtt.createSocket(self.mqtt, this);
  } else if (self.redis) {
    self.socket = redis.createSocket(self.redis);
  } else if (nodeVersion[0] === 0 && nodeVersion[1] < 12) {
    // node v0.10 does not support passing an object to dgram.createSocket
    // not sure if v0.11 does, but assuming it does not.
    self.socket = dgram.createSocket('udp4');
  } else {
    self.socket = dgram.createSocket({
      type: 'udp4',
      reuseAddr: self.reuseAddr
    });
  }

  self.socket.on('mqtthostdisconnected', function (mqtthostid) {
    self.emit('mqtthostdisconnected', mqtthostid);
  });
  self.socket.on('message', function (id, data, rinfo, mqtthostid) {
    self.decode(id, data, function (err, obj) {
      if (err) {// most decode errors are because we tried
        // to decrypt a packet for which we do not
        // have the key
        // the only other possibility is that the
        // message was split across packet boundaries
        // and that is not handled
        // self.emit("error", err);
      } else if (obj.node_left) {
        self.emit('node_left', obj.node_left, mqtthostid);
      } else if (obj.iid == self.instanceUuid && self.ignoreInstance) {
        /* else if (obj.pid == procUuid && self.ignoreProcess && obj.iid !== self.instanceUuid) {
                return false;
        }*/
        return false;
      } else if (obj.event && obj.data) {
        self.emit(obj.event, id, obj.data, obj, rinfo, mqtthostid);
      } else {
        self.emit('message', id, obj, mqtthostid);
      }
    });
  });
  self.on('error', function (err) {// TODO: Deal with this

    /* console.log("Network error: ", err.stack);*/
  });
}

util.inherits(Network, EventEmitter);

Network.prototype.getInstanceUuid = function () {
  return this.instanceUuid;
};

Network.prototype.getProcessUuid = function () {
  return this.processUuid;
};

Network.prototype.start = function (callback) {
  const self = this;
  self.socket.bind(self.port, self.address, function () {
    if (self.unicast) {
      if (typeof self.unicast === 'string' && ~self.unicast.indexOf(',')) {
        self.unicast = self.unicast.split(',');
      }

      self.destination = [].concat(self.unicast);
    } else if (self.redis || self.mqtt) {
      self.destination = [true];
    } else if (!self.multicast) {
      // Default to using broadcast if multicast address is not specified.
      self.socket.setBroadcast(true); // TODO: get the default broadcast address from os.networkInterfaces() (not currently returned)

      self.destination = [self.broadcast || '255.255.255.255'];
    } else {
      try {
        // addMembership can throw if there are no interfaces available
        self.socket.addMembership(self.multicast);
        self.socket.setMulticastTTL(self.multicastTTL);
      } catch (e) {
        self.emit('error', e);
        return callback && callback(e);
      }

      self.destination = [self.multicast];
    }

    return callback && callback();
  });
};

Network.prototype.stop = function (callback) {
  const self = this;
  self.socket.close();
  return callback && callback();
};

Network.prototype.send = function (event) {
  const self = this;
  const obj = {
    event: event,
    // pid : procUuid,
    iid: self.instanceUuid // hostName : self.hostName

  };

  if (arguments.length == 2) {
    obj.data = arguments[1];
  } else {// TODO: splice the arguments array and remove the first element
    // setting data to the result array
  }

  self.encode(obj, function (err, contents) {
    if (err) {
      return false;
    }

    const msg = new Buffer(contents);
    self.destination.forEach(function (destination) {
      self.socket.send(msg, 0, msg.length, self.port, destination);
    });
  });
};

Network.prototype.encode = function (data, callback) {
  const self = this;
  let tmp;

  try {
    tmp = self.key ? encrypt(JSON.stringify(data), self.key) : JSON.stringify(data);
  } catch (e) {
    return callback(e, null);
  }

  return callback(null, tmp);
};

Network.prototype.decode = function (id, data, callback) {
  const self = this;
  let tmp;

  if (data.length === 0) {
    return callback(null, {
      node_left: id
    });
  }

  try {
    if (self.key) {
      tmp = JSON.parse(decrypt(data.toString(), self.key));
    } else {
      tmp = JSON.parse(data);
    }
  } catch (e) {
    return callback(e, null);
  }

  return callback(null, tmp);
};

function encrypt(str, key) {
  const buf = [];
  const cipher = crypto.createCipher('aes256', key);
  buf.push(cipher.update(str, 'utf8', 'binary'));
  buf.push(cipher.final('binary'));
  return buf.join('');
}

function decrypt(str, key) {
  const buf = [];
  const decipher = crypto.createDecipher('aes256', key);
  buf.push(decipher.update(str, 'binary', 'utf8'));
  buf.push(decipher.final('utf8'));
  return buf.join('');
}
//# sourceMappingURL=network.js.map