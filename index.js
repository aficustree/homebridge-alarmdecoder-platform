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
        }
        return services;
    }
};