module.exports = function(homebridge){
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-alarmdecoder-sensor", "alarmdecoder-sensor", alarmdecoderSensorAccessory);
};

function alarmdecoderSensorAccessory(log, config) {
    this.log = log;
    this.name = config.name;
    this.port = config.port;
}

alarmdecoderSensorAccessory.prototype = {
    getServices: function() {
        var services = [];
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc')
            .setCharacteristic(Characteristic.Model, 'alarmdecoder');
        services.push(informationService);
        return services;
    }
};