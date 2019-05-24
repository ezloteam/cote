const EventEmitter = require('events').EventEmitter;
const util = require('util');
const mqtt = require('mqtt');

function MqttHost(ip, mqttnetwork) {
    EventEmitter.call(this);

    this.ip = ip;
    this.mqn = mqttnetwork;
    this.announce_topic = this.mqn.opts.host_topic_prefix + this.mqn.network.hostName;

    this.sent_last = '';

    // console.log( 'Starting host connection to', this.ip );

    let cid;
    cid =
        this.mqn.network.hostName +
        require('crypto')
            .createHash('md5')
            .update(this.mqn.network.instanceUuid)
            .digest('hex');
    cid = cid.substring(22);

    options = {
        keepalive: 10,
        clientId: cid,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        will: {
            topic: this.announce_topic,
            payload: '',
            retain: true,
        },
        resubscribe: true,
    };
    this.client = mqtt.connect(this.mqn.opts.host_protocol + '://' + this.ip + ':' + this.mqn.host_port, options);
    const that = this;

    that.client.on('connect', function() {
        // console.log('connected @',that.ip);
        if (that.sent_last.length > 0) {
            const tosend = that.sent_last;
            that.sent = '';
            that.send(tosend);
        }
        that.client.subscribe(that.mqn.opts.host_topic_prefix + '#');
        that.emit('connected', that.ip);
    });
    that.client.on('message', function(topic, message, packet) {
        if (topic.toString() == this.announce_topic) {
            return;
        }
        const topicSuffix = topic.toString().substr(that.mqn.opts.host_topic_prefix.length);
        that.emit('message', topicSuffix, message.toString(), that.ip);
    });
    that.client.on('close', function() {
        that.emit('mqtthostdisconnected', that.ip);
        // console.log('disconnected close @',that.ip);
    });
    that.client.on('offline', function() {
        that.emit('mqtthostdisconnected', that.ip);
        // console.log('disconnected offline @',that.ip);
    });
    that.client.on('end', function() {
        that.emit('mqtthostdisconnected', that.ip);
        // console.log('disconnected end @',that.ip);
    });
}

util.inherits(MqttHost, EventEmitter);

MqttHost.prototype.send = function(str) {
    str = str.toString();
    const that = this;
    if (that.sent !== str) {
        /* console.log(that.sent,' ?vs? ',str);*/
        that.client.publish(that.announce_topic, str, { retain: true });
        that.sent = str;
    }
};

MqttHost.prototype.close = function() {
    try {
        this.client.end(true);
    } catch (ecpt) {}
    try {
        this.mqn = {};
    } catch (ecpt) {}
};

function createHost(ip, mqttnetwork) {
    return new MqttHost(ip, mqttnetwork);
}

module.exports = {
    createHost: createHost,
};
