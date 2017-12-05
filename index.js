const axios = require('axios'); 

module.exports = function(homebridge){
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-alarmdecoder-sensor", "alarmdecoder-sensor", alarmdecoderSensorAccessory);
};

function alarmdecoderSensorAccessory(log, config) {
    this.log = log;
    this.name = config.name;
    this.port = config.port;
    this.zones = config.zones;
}

alarmdecoderSensorAccessory.prototype = {
    httpListener: function(req, res) {
		var data = '';
		
		if (req.method == "POST") {
			req.on('data', function(chunk) {
			  data += chunk;
			});		
			req.on('end', function() {
			  this.log('Received notification and body data:');
			  this.log(data.toString());
			}.bind(this));
		}	
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end();
		this.log('notice received, querying state');
		this.getCurrentState();
	},
    
    getState: function(callback) {
        
    },

    identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},
    
    getServices: function() {
        this.services = [];
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc')
            .setCharacteristic(Characteristic.Model, 'alarmdecoder-sensor plugin');
        this.services.push(informationService);
        for (var zone in this.zones) {
            var type = this.zones[zone].type;
            this.zones[zone].state = false; //init all zones as off to start
            var serviceToAdd;
            if(type == 'motion') {
                serviceToAdd = new Service.MotionSensor();
                serviceToAdd
                    .setCharacteristic(Characteristic.Name, zone);
                serviceToAdd.getCharacteristic(Characteristic.ContactSensorState)
                    .on('get', this.getState.bind(this));
            } else if (type == 'contact'){
                serviceToAdd = new Service.ContactSensor();
                serviceToAdd
                    .setCharacteristic(Characteristic.Name, zone);
                serviceToAdd.getCharacteristic(Characteristic.ContactSensorState)
                    .on('get', this.getState.bind(this));
            }
            if(type == 'motion' || type == 'contact')
                this.services.push(serviceToAdd);
        }
        return services;
    }
};