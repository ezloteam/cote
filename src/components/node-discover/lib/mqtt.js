const EventEmitter = require('events').EventEmitter;
const util = require('util');
const dns = require('dns');
const mqtthost = require('./mqtthost');

function MqttHandler(mqttopts, network) {
    EventEmitter.call(this);

    const defopts = {
        host: 'mqtt',
        host_port: '1883',
        host_protocol: 'mqtt',
        host_resolve_interval: 30 * 1000,
        host_resolve_interval_after_error: 30 * 1000,
        host_resolve_initial_delay: 100,
        host_topic_prefix: 'node-discover/',
    };

    this.lastSend = '';
    this.opts = mqttopts || {};
    this.network = network || {};
    this.port = 0;
    /* this.opts.return_buffers = true;*/

    let i;
    for (i in defopts) {
        if (typeof this.opts[i] == 'undefined') {
            this.opts[i] = defopts[i];
        }
    }

    const that = this;
    this.discoverHostsTimer = setTimeout(function() {
        that.discoverHosts();
    }, this.opts.host_resolve_initial_delay);

    // console.log('Starting mqtt with ',this.opts,'and',this.network.getInstanceUuid(), '/', this.network.getProcessUuid() );

    this.hosts = {};
}
util.inherits(MqttHandler, EventEmitter);

// MqttHandler.setMaxListeners(20);

MqttHandler.prototype.discoverHosts = function() {
    const that = this;
    clearTimeout(that.discoverHostsTimer);
    /* console.log('Resolving host',this.opts.host); */
    dns.resolve(this.opts.host, 'A', function(err, records) {
        if (err) {
            var i; /* console.error('Error',err);*/
            /* ?? */
            // setTimeout(function(){ that.discoverHosts() },that.opts.host_resolve_interval_after_error );
        }
        if (typeof records === 'undefined' || records.length == 0) {
            console.error('Critical', 'no ips found for', that.opts.host);
            for (i in that.hosts) {
                that.hosts[i].close();
                delete that.hosts[i];
                console.log('forgetting @', i);
            }
            setTimeout(function() {
                that.discoverHosts();
            }, that.opts.host_resolve_interval_after_error);
            return;
        }

        for (i in records) {
            if (typeof that.hosts[records[i]] == 'undefined') {
                // console.log('adding @',records[i]);
                that.hosts[records[i]] = mqtthost.createHost(records[i], that);
                that.hosts[records[i]].on('message', function(id, message, mqtthostid) {
                    // console.log('*** [',message,']',message.length);
                    if (message.length === 0) {
                        // console.log('!!!!!!!!!!!!!!!!!!!!!!!!!');
                        that.emit('message', id, '', { port: that.port }, mqtthostid);
                    } else {
                        if (that.network.key !== null) {
                            that.emit('message', id, Buffer.from(message, 'base64').toString(), { port: that.port }, mqtthostid);
                        } else {
                            that.emit('message', id, message.toString(), { port: that.port }, mqtthostid);
                        }
                    }
                });
                that.hosts[records[i]].on('mqtthostdisconnected', function(mqtthostid) {
                    // console.log('--disconnected mqtt',mqtthostid);
                    that.emit('mqtthostdisconnected', mqtthostid);
                });
                that.hosts[records[i]].send(that.lastSend);
            }
        }
        for (i in that.hosts) {
            console.log('Exists host', that.hosts[i].ip, 'in', records, '?');
            if (records.indexOf(that.hosts[i].ip) === -1) {
                const ip = that.hosts[i].ip;
                that.hosts[i].close();
                delete that.hosts[i];
                console.log('forgetting @', i);
                that.emit('mqtthostdisconnected', ip);
            }
        }
        setTimeout(function() {
            that.discoverHosts();
        }, that.opts.host_resolve_interval);
    });
};

MqttHandler.prototype.bind = function(port, address, callback) {
    const that = this;
    that.port = port;
    /* this.sub = redis.createClient(this.opts);
    this.pub = redis.createClient(this.opts);
    var that = this;
    this.sub.on('message', function(channel, message) {
        if (channel != 'cote') return;
        that.emit('message', message, { address: '0.0.0.0', port: port});
    });
    this.sub.subscribe('cote');
    this.pub.on('ready', () => {
        callback();
        this.emit('listening');
    });*/
    callback();
    this.emit('listening');
};

MqttHandler.prototype.setBroadcast = function() {};

MqttHandler.prototype.addMembership = function() {};

MqttHandler.prototype.setMulticastTTL = function() {};

MqttHandler.prototype.close = function() {
    const that = this;
    let i;
    for (i in that.hosts) {
        that.hosts[i].close();
    }
};

MqttHandler.prototype.send = function(msg, offset, length, port, address) {
    /* console.log(
        'Sending',
        msg
    );*/
    /* todo */
    /* this.pub.publish('cote', msg.toString());*/
    const that = this;
    if (that.network.key !== null) {
        msg = msg.toString('base64');
    } else {
        msg = msg.toString();
    }
    if (that.lastSend != msg) {
        // console.log('Sending',msg);
        let i;
        for (i in that.hosts) {
            setImmediate(
                function(message, index) {
                    that.hosts[index].send(message);
                },
                msg,
                i
            );
        }
        that.lastSend = msg;
    }
};

function createSocket(mqttopts, network) {
    return new MqttHandler(mqttopts, network);
}

module.exports = {
    createSocket: createSocket,
};
